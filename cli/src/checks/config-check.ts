import { readConfig, configExists, resolveConfigPath } from "../config/store.js";
import type { CheckResult } from "./index.js";

export function configCheck(configPath?: string): CheckResult {
  const filePath = resolveConfigPath(configPath);

  if (!configExists(configPath)) {
    return {
      name: "配置文件",
      status: "fail",
      message: `未找到配置文件：${filePath}`,
      canRepair: false,
      repairHint: "运行 `paperclipai onboard` 创建配置文件",
    };
  }

  try {
    readConfig(configPath);
    return {
      name: "配置文件",
      status: "pass",
      message: `配置文件有效：${filePath}`,
    };
  } catch (err) {
    return {
      name: "配置文件",
      status: "fail",
      message: `配置文件无效：${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "运行 `paperclipai configure --section database` 修改配置（或运行 `paperclipai onboard` 重新创建）",
    };
  }
}
