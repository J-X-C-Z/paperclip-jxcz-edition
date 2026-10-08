import fs from "node:fs";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

export function storageCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  if (config.storage.provider === "local_disk") {
    const baseDir = resolveRuntimeLikePath(config.storage.localDisk.baseDir, configPath);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    try {
      fs.accessSync(baseDir, fs.constants.W_OK);
      return {
        name: "存储",
        status: "pass",
        message: `本地磁盘存储目录可写：${baseDir}`,
      };
    } catch {
      return {
        name: "存储",
        status: "fail",
        message: `本地存储目录不可写：${baseDir}`,
        canRepair: false,
        repairHint: "检查 storage.localDisk.baseDir 的文件权限",
      };
    }
  }

  const bucket = config.storage.s3.bucket.trim();
  const region = config.storage.s3.region.trim();
  if (!bucket || !region) {
    return {
      name: "存储",
      status: "fail",
      message: "S3 存储需要填写存储桶和区域",
      canRepair: false,
      repairHint: "运行 `paperclipai configure --section storage` 修改配置",
    };
  }

  return {
    name: "存储",
    status: "warn",
    message: `已配置 S3 存储（存储桶=${bucket}，区域=${region}）。doctor 不会检查其连通性。`,
    canRepair: false,
    repairHint: "检查部署环境中的凭据和端点",
  };
}

