import fs from "node:fs/promises";
import path from "node:path";
import type { PaperclipConfig } from "../config/schema.js";
import { resolvePaperclipInstanceId } from "../config/home.js";
import { readInstallManifest, resolveInstallStorePaths } from "../install-store.js";
import {
  detectServiceManager,
  isExecutableFile,
  resolveServiceShimPath,
  type ServiceManagerDetection,
} from "../services/service-manager.js";
import { buildLocalHealthUrl } from "../utils/health-url.js";
import type { CheckResult } from "./index.js";

type HealthResult = { ok: boolean; version: string | null; error?: string };
type ServiceCheckDependencies = {
  detect: (instanceId: string) => Promise<ServiceManagerDetection>;
  probe: (config: PaperclipConfig) => Promise<HealthResult>;
  shimPresent: (executablePath: string) => Promise<boolean>;
};

async function probeHealth(config: PaperclipConfig): Promise<HealthResult> {
  try {
    const response = await fetch(buildLocalHealthUrl(config.server.host, config.server.port), {
      signal: AbortSignal.timeout(2_000),
    });
    const body = (await response.json()) as {
      status?: unknown;
      serverVersion?: unknown;
      version?: unknown;
    };
    const version = typeof body.serverVersion === "string"
      ? body.serverVersion
      : typeof body.version === "string"
        ? body.version
        : null;
    return { ok: response.ok && body.status === "ok", version };
  } catch (error) {
    return { ok: false, version: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function serviceHealthChecks(
  config: PaperclipConfig,
  dependencies: Partial<ServiceCheckDependencies> = {},
): Promise<CheckResult[]> {
  if (process.env.PAPERCLIP_SERVICE_MANAGED === "1") return [];

  const deps: ServiceCheckDependencies = {
    detect: (instanceId) => detectServiceManager({ instanceId }),
    probe: probeHealth,
    shimPresent: (executablePath) => isExecutableFile(executablePath),
    ...dependencies,
  };
  const instanceId = resolvePaperclipInstanceId();
  const detection = await deps.detect(instanceId);
  if (!detection.supported) {
    return [{ name: "后台服务", status: "pass", message: detection.reason }];
  }

  const manager = detection.manager;
  const status = await manager.status();
  if (!status.installed) {
    return [
      {
        name: "后台服务",
        status: "pass",
        message: `实例 ${instanceId} 未安装（可选）`,
      },
    ];
  }

  const results: CheckResult[] = [];
  let definitionCurrent = false;
  try {
    definitionCurrent = (await fs.readFile(manager.definitionPath, "utf8")) === manager.renderDefinition();
  } catch {
    definitionCurrent = false;
  }
  results.push(
    definitionCurrent
      ? { name: "服务定义", status: "pass", message: manager.definitionPath }
      : {
          name: "服务定义",
          status: "fail",
          message: `服务定义缺失或已变更：${manager.definitionPath}`,
          repairHint: "运行 `paperclipai service install` 重新生成服务定义",
        },
  );

  const health = await deps.probe(config);
  // The installed definition is the truth about what the service executes;
  // fall back to the environment-derived path only when it is unreadable.
  const serviceExecutable = (await manager.installedExecutablePath()) ?? resolveServiceShimPath();
  const shimPresent = status.active ? true : await deps.shimPresent(serviceExecutable);
  results.push(
    status.active
      ? { name: "服务运行状态", status: "pass", message: `${status.serviceName} 正在运行` }
      : !shimPresent
        ? {
            name: "服务运行状态",
            status: "fail",
            message: `${status.serviceName} 无法启动：可执行文件不存在于 ${serviceExecutable}`,
            repairHint:
              path.resolve(serviceExecutable) === path.resolve(resolveInstallStorePaths().shimPath)
                ? "Run `paperclipai install` to restore the managed payload and shim, then `paperclipai service start`"
                : `Restore the executable at ${serviceExecutable}, or unset PAPERCLIP_SHIM_PATH and run \`paperclipai install\` followed by \`paperclipai service install\` to re-point the service at the managed shim`,
          }
        : health.ok
          ? {
              name: "服务运行状态",
              status: "fail",
              message: `${status.serviceName} 未运行，但配置的端口正由另一个 Paperclip 进程提供服务`,
              repairHint: "运行 `paperclipai service start`，或先停止冲突的前台进程",
            }
          : {
              name: "服务运行状态",
              status: "fail",
              message: `${status.serviceName} 状态为 ${status.detail ?? "inactive"}`,
              repairHint: "运行 `paperclipai service start`；如果服务未能持续运行，请查看 `paperclipai service logs`",
            },
  );

  let expectedVersion: string | null = null;
  try {
    expectedVersion = readInstallManifest()?.version ?? null;
  } catch {}
  results.push(
    !health.ok
      ? {
          name: "服务健康状态",
          status: "fail",
          message: health.error ?? "健康检查端点未返回正常状态",
          repairHint: "检查 `paperclipai service status` 和 `paperclipai service logs`",
        }
      : expectedVersion && health.version !== expectedVersion
        ? {
            name: "服务版本",
            status: "fail",
            message: `当前运行版本为 ${health.version ?? "unknown"}；托管安装版本为 ${expectedVersion}`,
            repairHint: "运行 `paperclipai service restart --expected-version " + expectedVersion + "`",
          }
        : status.active
          ? {
              name: "服务健康状态",
              status: "pass",
              message: `运行正常${health.version ? `，版本 ${health.version}` : ""}`,
            }
          : {
              name: "服务健康状态",
              status: "warn",
              message: `配置的端口返回正常${health.version ? `（版本 ${health.version}）` : ""}，但响应进程不是 ${status.serviceName}，该服务当前未运行`,
            },
  );

  if (status.enabled && status.linger === false) {
    results.push({
      name: "Service linger",
      status: "warn",
      message: "已启用登录时启动，但 systemd 用户 linger 未开启",
      repairHint: "如需在退出登录后继续运行服务，请重新运行 `paperclipai service install --enable-linger`",
    });
  }

  return results;
}
