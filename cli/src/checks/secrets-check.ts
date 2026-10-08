import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

const AWS_CREDENTIAL_SOURCE_HINT =
  "Provide AWS runtime credentials through the AWS SDK default credential chain: IAM role/workload identity, AWS_PROFILE/SSO/shared credentials, web identity, container/instance metadata, or short-lived shell credentials";

function decodeMasterKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // ignored
  }

  if (Buffer.byteLength(trimmed, "utf8") === 32) {
    return Buffer.from(trimmed, "utf8");
  }
  return null;
}

function withStrictModeNote(
  base: Pick<CheckResult, "name" | "status" | "message" | "canRepair" | "repair" | "repairHint">,
  config: PaperclipConfig,
): CheckResult {
  const strictModeDisabledInDeployedSetup =
    config.database.mode === "postgres" && config.secrets.strictMode === false;
  if (!strictModeDisabledInDeployedSetup) return base;

  if (base.status === "fail") return base;
  return {
    ...base,
    status: "warn",
    message: `${base.message}；PostgreSQL 部署未启用严格密钥模式`,
    repairHint: base.repairHint
      ? `${base.repairHint}. Consider enabling secrets.strictMode`
      : "Consider enabling secrets.strictMode",
  };
}

export function secretsCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  const provider = config.secrets.provider;
  if (provider === "aws_secrets_manager") {
    return withStrictModeNote(awsSecretsManagerCheck(), config);
  }
  if (provider !== "local_encrypted") {
    return {
      name: "密钥适配器",
      status: "fail",
      message: `已配置 ${provider}，但此构建仅支持 local_encrypted 和 aws_secrets_manager`,
      canRepair: false,
      repairHint: "运行 `paperclipai configure --section secrets`，选择 local_encrypted 或 aws_secrets_manager",
    };
  }

  const envMasterKey = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  if (envMasterKey && envMasterKey.trim().length > 0) {
    if (!decodeMasterKey(envMasterKey)) {
      return {
        name: "密钥适配器",
        status: "fail",
        message:
          "PAPERCLIP_SECRETS_MASTER_KEY is invalid (expected 32-byte base64, 64-char hex, or raw 32-char string)",
        canRepair: false,
        repairHint: "将 PAPERCLIP_SECRETS_MASTER_KEY 设为有效密钥，或取消设置以使用密钥文件",
      };
    }

    return withStrictModeNote(
      {
        name: "密钥适配器",
        status: "pass",
        message: "已通过 PAPERCLIP_SECRETS_MASTER_KEY 配置本地加密提供方",
      },
      config,
    );
  }

  const keyFileOverride = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  const configuredPath =
    keyFileOverride && keyFileOverride.trim().length > 0
      ? keyFileOverride.trim()
      : config.secrets.localEncrypted.keyFilePath;
  const keyFilePath = resolveRuntimeLikePath(configuredPath, configPath);

  if (!fs.existsSync(keyFilePath)) {
    return withStrictModeNote(
      {
        name: "密钥适配器",
        status: "warn",
        message: `密钥文件尚不存在：${keyFilePath}`,
        canRepair: true,
        repair: () => {
          fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });
          fs.writeFileSync(keyFilePath, randomBytes(32).toString("base64"), {
            encoding: "utf8",
            mode: 0o600,
          });
          try {
            fs.chmodSync(keyFilePath, 0o600);
          } catch {
            // best effort
          }
        },
        repairHint: "使用 --repair 创建本地加密密钥文件",
      },
      config,
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(keyFilePath, "utf8");
  } catch (err) {
    return {
      name: "密钥适配器",
      status: "fail",
      message: `无法读取密钥文件：${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "检查文件权限，或设置 PAPERCLIP_SECRETS_MASTER_KEY",
    };
  }

  if (!decodeMasterKey(raw)) {
    return {
      name: "密钥适配器",
      status: "fail",
      message: `${keyFilePath} 中的密钥材料无效`,
      canRepair: false,
      repairHint: "替换为有效密钥材料，或删除该文件后运行 doctor --repair",
    };
  }

  const keyMode = fs.statSync(keyFilePath).mode & 0o777;
  const permissionWarning =
    (keyMode & 0o077) !== 0
      ? `; key file permissions are ${keyMode.toString(8)} (run chmod 600 ${keyFilePath})`
      : "";

  return withStrictModeNote(
    {
      name: "密钥适配器",
      status: permissionWarning ? "warn" : "pass",
      message: `已通过密钥文件 ${keyFilePath} 配置本地加密提供方${permissionWarning}`,
      repairHint: permissionWarning
        ? "Restrict the local encrypted secrets key file to owner read/write permissions"
        : undefined,
    },
    config,
  );
}

function awsSecretsManagerCheck(): CheckResult {
  const missingConfig = missingAwsSecretsManagerConfig();
  if (missingConfig.length > 0) {
    return {
      name: "密钥适配器",
      status: "fail",
      message: `AWS Secrets Manager 提供方缺少非敏感配置：${missingConfig.join(", ")}`,
      canRepair: false,
      repairHint:
        `Set ${missingConfig.join(", ")} in the Paperclip server runtime. ${AWS_CREDENTIAL_SOURCE_HINT}. Do not store AWS root credentials or long-lived IAM user keys in Paperclip secrets.`,
    };
  }

  const staticEnvCredentials =
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const credentialSource = detectedAwsCredentialSources().join(", ");
  const message =
    `AWS Secrets Manager provider configured for deployment ${process.env.PAPERCLIP_SECRETS_AWS_DEPLOYMENT_ID}; ` +
    `runtime credentials source: ${credentialSource || "AWS SDK default credential chain"}`;

  if (staticEnvCredentials) {
    return {
      name: "密钥适配器",
      status: "warn",
      message,
      canRepair: false,
      repairHint:
        "AWS static environment credentials are visible. Use only short-lived shell credentials locally; prefer IAM role/workload identity for hosted deployments and never store AWS access keys in Paperclip company secrets.",
    };
  }

  return {
    name: "密钥适配器",
    status: "pass",
    message,
  };
}

function missingAwsSecretsManagerConfig(): string[] {
  const missing: string[] = [];
  if (
    !(
      process.env.PAPERCLIP_SECRETS_AWS_REGION?.trim() ||
      process.env.AWS_REGION?.trim() ||
      process.env.AWS_DEFAULT_REGION?.trim()
    )
  ) {
    missing.push("PAPERCLIP_SECRETS_AWS_REGION or AWS_REGION/AWS_DEFAULT_REGION");
  }
  if (!process.env.PAPERCLIP_SECRETS_AWS_DEPLOYMENT_ID?.trim()) {
    missing.push("PAPERCLIP_SECRETS_AWS_DEPLOYMENT_ID");
  }
  if (!process.env.PAPERCLIP_SECRETS_AWS_KMS_KEY_ID?.trim()) {
    missing.push("PAPERCLIP_SECRETS_AWS_KMS_KEY_ID");
  }
  return missing;
}

function detectedAwsCredentialSources(): string[] {
  const sources: string[] = [];
  if (process.env.AWS_PROFILE?.trim()) sources.push("AWS_PROFILE/shared config");
  if (process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    sources.push("temporary AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY environment credentials");
  }
  if (process.env.AWS_WEB_IDENTITY_TOKEN_FILE?.trim() && process.env.AWS_ROLE_ARN?.trim()) {
    sources.push("AWS web identity token");
  }
  if (
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim() ||
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI?.trim()
  ) {
    sources.push("AWS container credentials endpoint");
  }
  if (process.env.AWS_SHARED_CREDENTIALS_FILE?.trim() || process.env.AWS_CONFIG_FILE?.trim()) {
    sources.push("custom AWS shared credentials/config file");
  }
  return sources;
}
