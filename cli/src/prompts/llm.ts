import * as p from "@clack/prompts";
import type { LlmConfig } from "../config/schema.js";

export async function promptLlm(): Promise<LlmConfig | undefined> {
  const configureLlm = await p.confirm({
    message: "现在配置 LLM 提供方吗？",
    initialValue: false,
  });

  if (p.isCancel(configureLlm)) {
    p.cancel("设置已取消。");
    process.exit(0);
  }

  if (!configureLlm) return undefined;

  const provider = await p.select({
    message: "LLM 提供方",
    options: [
      { value: "claude" as const, label: "Claude (Anthropic)" },
      { value: "openai" as const, label: "OpenAI" },
    ],
  });

  if (p.isCancel(provider)) {
    p.cancel("设置已取消。");
    process.exit(0);
  }

  const apiKey = await p.password({
    message: `${provider === "claude" ? "Anthropic" : "OpenAI"} API 密钥`,
    validate: (val) => {
      if (!val) return "必须填写 API 密钥";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("设置已取消。");
    process.exit(0);
  }

  return { provider, apiKey };
}
