import { Command } from "commander";
import {
  CONNECTION_INTENT_AGENT_GUIDANCE,
  connectionRequestInputSchema,
  connectionsSearchInputSchema,
} from "@paperclipai/shared";

interface RuntimeConnectionOptions {
  retryProviderChoice?: boolean;
  json?: boolean;
}

async function callRuntimeConnectionTool(
  endpointEnv: "PAPERCLIP_RUNTIME_TOOLS_CONNECTIONS_SEARCH_URL" | "PAPERCLIP_RUNTIME_TOOLS_CONNECTION_REQUEST_URL",
  body: unknown,
) {
  const endpoint = process.env[endpointEnv]?.trim();
  const token = process.env.PAPERCLIP_RUNTIME_TOOLS_TOKEN?.trim();
  if (!endpoint || !token) {
    throw new Error("此命令需要活动心跳运行提供的运行时连接环境");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : `Runtime connection request failed with ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

function writeResult(value: unknown, options: RuntimeConnectionOptions) {
  process.stdout.write(`${JSON.stringify(value, null, options.json ? 2 : 0)}\n`);
}

export function registerConnectionIntentCommands(program: Command) {
  const connections = program
    .command("connections")
    .description("从活动心跳运行中搜索连接或请求连接")
    .addHelpText("after", `\n${CONNECTION_INTENT_AGENT_GUIDANCE}\n`);

  connections
    .command("search")
    .argument("[query]", "服务名称或能力")
    .option("--retry-provider-choice", "仅在用户明确要求时重新考虑提供方选择")
    .option("--json", "输出格式化的 JSON")
    .action(async (query: string | undefined, options: RuntimeConnectionOptions) => {
      const input = connectionsSearchInputSchema.parse({ query: query ?? "", retryProviderChoice: options.retryProviderChoice });
      writeResult(await callRuntimeConnectionTool(
        "PAPERCLIP_RUNTIME_TOOLS_CONNECTIONS_SEARCH_URL",
        input,
      ), options);
    });

  connections
    .command("request")
    .argument("<service>", "可连接服务标识")
    .option("--target-service <slug>", "用户明确指定外部提供方时使用的应用")
    .option("--selection-interaction-id <id>", "已回答的外部提供方问题 ID")
    .option("--json", "输出格式化的 JSON")
    .action(async (service: string, options: RuntimeConnectionOptions & { targetService?: string }) => {
      const input = connectionRequestInputSchema.parse({ service, targetService: options.targetService, selectionInteractionId: (options as RuntimeConnectionOptions & { selectionInteractionId?: string }).selectionInteractionId });
      writeResult(await callRuntimeConnectionTool(
        "PAPERCLIP_RUNTIME_TOOLS_CONNECTION_REQUEST_URL",
        input,
      ), options);
    });
}
