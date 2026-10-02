import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { DEFAULT_ACP_ENGINE_MODE, DEFAULT_ACP_ENGINE_PERMISSION_MODE, DEFAULT_ACP_ENGINE_NON_INTERACTIVE_PERMISSIONS } from "@paperclipai/adapter-utils/acpx-engine/constants";

export function getConfigSchema(): AdapterConfigSchema {
  return { fields: [
    { key: "command", label: "命令", type: "text", default: "mimo", hint: "MiMo Code 可执行文件的名称或完整路径。" },
    { key: "mode", label: "ACP 会话模式", type: "select", default: DEFAULT_ACP_ENGINE_MODE, options: [{ value: "persistent", label: "保留会话" }, { value: "oneshot", label: "每次新建会话" }] },
    { key: "permissionMode", label: "ACP 工具权限", type: "select", default: DEFAULT_ACP_ENGINE_PERMISSION_MODE, options: [{ value: "approve-all", label: "允许所有工具操作" }, { value: "approve-reads", label: "仅允许读取" }, { value: "deny-all", label: "拒绝所有工具操作" }] },
    { key: "nonInteractivePermissions", label: "非交互权限请求", type: "select", default: DEFAULT_ACP_ENGINE_NON_INTERACTIVE_PERMISSIONS, options: [{ value: "deny", label: "拒绝请求" }, { value: "fail", label: "终止运行" }] },
    { key: "timeoutSec", label: "运行超时（秒）", type: "number", default: 0, hint: "0 表示不限制运行时间。" },
    { key: "graceSec", label: "停止宽限时间（秒）", type: "number", default: 15 },
  ] };
}
