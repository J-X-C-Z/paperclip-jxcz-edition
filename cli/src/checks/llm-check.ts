import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export async function llmCheck(config: PaperclipConfig): Promise<CheckResult> {
  if (!config.llm) {
    return {
      name: "LLM 提供方",
      status: "pass",
      message: "尚未配置 LLM 提供方（可选）",
    };
  }

  if (!config.llm.apiKey) {
    return {
      name: "LLM 提供方",
      status: "pass",
      message: `已配置 ${config.llm.provider}，但未设置 API 密钥（可选）`,
    };
  }

  try {
    if (config.llm.provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.llm.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (res.ok || res.status === 400) {
        return { name: "LLM 提供方", status: "pass", message: "Claude API 密钥有效" };
      }
      if (res.status === 401) {
        return {
          name: "LLM 提供方",
          status: "fail",
          message: "Claude API 密钥无效（401）",
          canRepair: false,
          repairHint: "运行 `paperclipai configure --section llm` 修改配置",
        };
      }
      return {
        name: "LLM 提供方",
        status: "warn",
        message: `Claude API 返回状态码 ${res.status}`,
      };
    } else {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${config.llm.apiKey}` },
      });
      if (res.ok) {
        return { name: "LLM 提供方", status: "pass", message: "OpenAI API 密钥有效" };
      }
      if (res.status === 401) {
        return {
          name: "LLM 提供方",
          status: "fail",
          message: "OpenAI API 密钥无效（401）",
          canRepair: false,
          repairHint: "运行 `paperclipai configure --section llm` 修改配置",
        };
      }
      return {
        name: "LLM 提供方",
        status: "warn",
        message: `OpenAI API 返回状态码 ${res.status}`,
      };
    }
  } catch {
    return {
      name: "LLM 提供方",
      status: "warn",
      message: "无法连接 API 以验证密钥",
    };
  }
}
