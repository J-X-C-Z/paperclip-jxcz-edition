import { inferBindModeFromHost } from "@paperclipai/shared";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export function deploymentAuthCheck(config: PaperclipConfig): CheckResult {
  const mode = config.server.deploymentMode;
  const exposure = config.server.exposure;
  const auth = config.auth;
  const bind = config.server.bind ?? inferBindModeFromHost(config.server.host);

  if (mode === "local_trusted") {
    if (bind !== "loopback") {
      return {
        name: "部署/身份验证模式",
        status: "fail",
        message: `local_trusted 模式要求绑定到 loopback（当前为 ${bind}）`,
        canRepair: false,
        repairHint: "运行 `paperclipai configure --section server`，选择 Local trusted / loopback 可访问性",
      };
    }
    return {
      name: "部署/身份验证模式",
      status: "pass",
      message: "local_trusted 模式已配置为仅允许 loopback 访问",
    };
  }

  const secret =
    process.env.BETTER_AUTH_SECRET?.trim() ??
    process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
  if (!secret) {
    return {
      name: "部署/身份验证模式",
      status: "fail",
      message: "authenticated 模式需要 BETTER_AUTH_SECRET（或 PAPERCLIP_AGENT_JWT_SECRET）",
      canRepair: false,
      repairHint: "启动 Paperclip 前请设置 BETTER_AUTH_SECRET",
    };
  }

  if (auth.baseUrlMode === "explicit" && !auth.publicBaseUrl) {
    return {
      name: "部署/身份验证模式",
      status: "fail",
      message: "auth.baseUrlMode=explicit 时必须设置 auth.publicBaseUrl",
      canRepair: false,
      repairHint: "运行 `paperclipai configure --section server` 并填写基础 URL",
    };
  }

  if (exposure === "public") {
    if (auth.baseUrlMode !== "explicit" || !auth.publicBaseUrl) {
      return {
        name: "部署/身份验证模式",
        status: "fail",
        message: "authenticated/public 模式必须显式设置 auth.publicBaseUrl",
        canRepair: false,
        repairHint: "运行 `paperclipai configure --section server` 并选择 public 暴露方式",
      };
    }
    try {
      const url = new URL(auth.publicBaseUrl);
      if (url.protocol !== "https:") {
        return {
          name: "部署/身份验证模式",
          status: "warn",
          message: "公开访问时，auth.publicBaseUrl 应使用 https://",
          canRepair: false,
          repairHint: "生产环境使用 HTTPS 以保护会话 Cookie",
        };
      }
    } catch {
      return {
        name: "部署/身份验证模式",
        status: "fail",
        message: "auth.publicBaseUrl 不是有效 URL",
        canRepair: false,
        repairHint: "运行 `paperclipai configure --section server` 并填写有效 URL",
      };
    }
  }

  return {
    name: "部署/身份验证模式",
    status: "pass",
    message: `模式 ${mode}/${exposure}，绑定 ${bind}，身份验证 URL 模式 ${auth.baseUrlMode}`,
  };
}
