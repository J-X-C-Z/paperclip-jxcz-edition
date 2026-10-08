import * as p from "@clack/prompts";
import { isLoopbackHost, type BindMode } from "@paperclipai/shared";
import type { AuthConfig, ServerConfig } from "../config/schema.js";
import { parseHostnameCsv } from "../config/hostnames.js";
import { buildCustomServerConfig, buildPresetServerConfig, inferConfiguredBind } from "../config/server-bind.js";

const TAILNET_BIND_WARNING =
  "No Tailscale address was detected during setup. The saved config will stay on loopback until Tailscale is available or PAPERCLIP_TAILNET_BIND_HOST is set.";

function cancelled(): never {
  p.cancel("设置已取消。");
  process.exit(0);
}

export async function promptServer(opts?: {
  currentServer?: Partial<ServerConfig>;
  currentAuth?: Partial<AuthConfig>;
}): Promise<{ server: ServerConfig; auth: AuthConfig }> {
  const currentServer = opts?.currentServer;
  const currentAuth = opts?.currentAuth;
  const currentBind = inferConfiguredBind(currentServer);

  const bindSelection = await p.select({
    message: "可访问性",
    options: [
      {
        value: "loopback" as const,
        label: "Trusted local",
        hint: "Recommended for first run: localhost only, no login friction",
      },
      {
        value: "lan" as const,
        label: "Private network",
        hint: "Broad private bind for LAN, VPN, or legacy --tailscale-auth style access",
      },
      {
        value: "tailnet" as const,
        label: "Tailnet",
        hint: "Private authenticated access using the machine's detected Tailscale address",
      },
      {
        value: "custom" as const,
        label: "Custom",
        hint: "Choose exact auth mode, exposure, and host manually",
      },
    ],
    initialValue: currentBind,
  });

  if (p.isCancel(bindSelection)) cancelled();
  const bind = bindSelection as BindMode;

  const portDefault = String(currentServer?.port ?? 3100);
  const portStr = await p.text({
    message: "服务端口",
    defaultValue: portDefault,
    placeholder: "3100",
    validate: (val) => {
      // Clack validates the raw input before applying defaultValue, so an
      // Enter press hands the validator an empty string. Validate the value
      // that will actually be submitted — the typed input, or the default.
      const n = Number(val || portDefault);
      if (isNaN(n) || n < 1 || n > 65535 || !Number.isInteger(n)) {
        return "必须是 1 到 65535 之间的整数";
      }
    },
  });

  if (p.isCancel(portStr)) cancelled();
  const port = Number(portStr) || 3100;
  const serveUi = currentServer?.serveUi ?? true;

  if (bind === "loopback") {
    return buildPresetServerConfig("loopback", {
      port,
      allowedHostnames: [],
      serveUi,
    });
  }

  if (bind === "lan" || bind === "tailnet") {
    const allowedHostnamesInput = await p.text({
      message: "允许的私有主机名（以逗号分隔，可选）",
      defaultValue: (currentServer?.allowedHostnames ?? []).join(", "),
      placeholder:
        bind === "tailnet"
          ? "your-machine.tailnet.ts.net"
          : "dotta-macbook-pro, host.docker.internal",
      validate: (val) => {
        try {
          parseHostnameCsv(val ?? "");
          return;
        } catch (err) {
          return err instanceof Error ? err.message : "Invalid hostname list";
        }
      },
    });

    if (p.isCancel(allowedHostnamesInput)) cancelled();

    const preset = buildPresetServerConfig(bind, {
      port,
      allowedHostnames: parseHostnameCsv(allowedHostnamesInput),
      serveUi,
    });
    if (bind === "tailnet" && isLoopbackHost(preset.server.host)) {
      p.log.warn(TAILNET_BIND_WARNING);
    }
    return preset;
  }

  const deploymentModeSelection = await p.select({
    message: "身份验证模式",
    options: [
      {
        value: "local_trusted",
        label: "Local trusted",
        hint: "No login required; only safe with loopback-only or similarly trusted access",
      },
      {
        value: "authenticated",
        label: "Authenticated",
        hint: "Login required; supports both private-network and public deployments",
      },
    ],
    initialValue: currentServer?.deploymentMode ?? "authenticated",
  });

  if (p.isCancel(deploymentModeSelection)) cancelled();
  const deploymentMode = deploymentModeSelection as ServerConfig["deploymentMode"];

  let exposure: ServerConfig["exposure"] = "private";
  if (deploymentMode === "authenticated") {
    const exposureSelection = await p.select({
      message: "暴露配置",
      options: [
        {
          value: "private",
          label: "Private network",
          hint: "Private access only, with automatic URL handling",
        },
        {
          value: "public",
          label: "Public internet",
          hint: "Internet-facing deployment with explicit public URL requirements",
        },
      ],
      initialValue: currentServer?.exposure ?? "private",
    });
    if (p.isCancel(exposureSelection)) cancelled();
    exposure = exposureSelection as ServerConfig["exposure"];
  }

  const defaultHost =
    currentServer?.customBindHost ??
    currentServer?.host ??
    (deploymentMode === "local_trusted" ? "127.0.0.1" : "0.0.0.0");
  const host = await p.text({
    message: "绑定主机",
    defaultValue: defaultHost,
    placeholder: defaultHost,
    validate: (val) => {
      const candidate = (val || defaultHost).trim();
      if (!candidate) return "必须填写主机名";
      if (deploymentMode === "local_trusted" && !isLoopbackHost(candidate)) {
        return "local_trusted 模式要求使用 loopback 主机，例如 127.0.0.1";
      }
    },
  });

  if (p.isCancel(host)) cancelled();

  let allowedHostnames: string[] = [];
  if (deploymentMode === "authenticated" && exposure === "private") {
    const allowedHostnamesInput = await p.text({
      message: "允许的私有主机名（以逗号分隔，可选）",
      defaultValue: (currentServer?.allowedHostnames ?? []).join(", "),
      placeholder: "dotta-macbook-pro, your-host.tailnet.ts.net",
      validate: (val) => {
        try {
          parseHostnameCsv(val ?? "");
          return;
        } catch (err) {
          return err instanceof Error ? err.message : "Invalid hostname list";
        }
      },
    });

    if (p.isCancel(allowedHostnamesInput)) cancelled();
    allowedHostnames = parseHostnameCsv(allowedHostnamesInput);
  }

  let publicBaseUrl: string | undefined;
  if (deploymentMode === "authenticated" && exposure === "public") {
    const publicBaseUrlDefault = currentAuth?.publicBaseUrl ?? "";
    const urlInput = await p.text({
      message: "公开基础 URL",
      defaultValue: publicBaseUrlDefault,
      placeholder: "https://paperclip.example.com",
      validate: (val) => {
        const candidate = (val || publicBaseUrlDefault).trim();
        if (!candidate) return "公开访问时必须填写基础 URL";
        try {
          const url = new URL(candidate);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "URL 必须以 http:// 或 https:// 开头";
          }
          return;
        } catch {
          return "请输入有效 URL";
        }
      },
    });
    if (p.isCancel(urlInput)) cancelled();
    publicBaseUrl = urlInput.trim().replace(/\/+$/, "");
  }

  return buildCustomServerConfig({
    deploymentMode,
    exposure,
    host: host.trim(),
    port,
    allowedHostnames,
    serveUi,
    publicBaseUrl,
  });
}
