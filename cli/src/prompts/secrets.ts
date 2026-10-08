import * as p from "@clack/prompts";
import type { SecretProvider } from "@paperclipai/shared";
import type { SecretsConfig } from "../config/schema.js";
import { resolveDefaultSecretsKeyFilePath, resolvePaperclipInstanceId } from "../config/home.js";

function defaultKeyFilePath(): string {
  return resolveDefaultSecretsKeyFilePath(resolvePaperclipInstanceId());
}

export function defaultSecretsConfig(): SecretsConfig {
  const keyFilePath = defaultKeyFilePath();
  return {
    provider: "local_encrypted",
    strictMode: false,
    localEncrypted: {
      keyFilePath,
    },
  };
}

export async function promptSecrets(current?: SecretsConfig): Promise<SecretsConfig> {
  const base = current ?? defaultSecretsConfig();

  const provider = await p.select({
    message: "密钥提供方",
    options: [
      {
        value: "local_encrypted" as const,
        label: "Local encrypted (recommended)",
        hint: "best for single-developer installs",
      },
      {
        value: "aws_secrets_manager" as const,
        label: "AWS Secrets Manager",
        hint: "requires runtime AWS credentials and provider env config",
      },
      {
        value: "gcp_secret_manager" as const,
        label: "GCP Secret Manager",
        hint: "requires external adapter integration",
      },
      {
        value: "vault" as const,
        label: "HashiCorp Vault",
        hint: "requires external adapter integration",
      },
    ],
    initialValue: base.provider,
  });

  if (p.isCancel(provider)) {
    p.cancel("设置已取消。");
    process.exit(0);
  }

  const strictMode = await p.confirm({
    message: "敏感环境变量是否必须使用密钥引用？",
    initialValue: base.strictMode,
  });

  if (p.isCancel(strictMode)) {
    p.cancel("设置已取消。");
    process.exit(0);
  }

  const fallbackDefault = defaultKeyFilePath();
  let keyFilePath = base.localEncrypted.keyFilePath || fallbackDefault;
  if (provider === "local_encrypted") {
    const keyPath = await p.text({
      message: "本地加密密钥文件路径",
      defaultValue: keyFilePath,
      placeholder: fallbackDefault,
      validate: (value) => {
        // Clack validates the raw input before applying defaultValue —
        // validate the value that will actually be submitted.
        if ((value || keyFilePath).trim().length === 0) return "必须填写密钥文件路径";
      },
    });

    if (p.isCancel(keyPath)) {
      p.cancel("设置已取消。");
      process.exit(0);
    }
    keyFilePath = keyPath.trim();
  }

  if (provider !== "local_encrypted") {
    p.note(
      provider === "aws_secrets_manager"
        ? "AWS credentials must come from the Paperclip server runtime (IAM role/workload identity, AWS_PROFILE/SSO/shared credentials, or short-lived shell env), not from Paperclip company secrets."
        : `${provider} is not fully wired in this build yet. Keep local_encrypted unless you are actively implementing that adapter.`,
      "Heads up",
    );
  }

  return {
    provider: provider as SecretProvider,
    strictMode,
    localEncrypted: {
      keyFilePath,
    },
  };
}
