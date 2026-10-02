import type { AdapterEnvironmentTestContext, AdapterEnvironmentTestResult } from "@paperclipai/adapter-utils";
import { ensureAdapterExecutionTargetCommandResolvable } from "@paperclipai/adapter-utils/execution-target";
import { asString } from "@paperclipai/adapter-utils/server-utils";

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const command = asString(ctx.config?.command, "dsh").trim() || "dsh";
  try {
    await ensureAdapterExecutionTargetCommandResolvable(command, ctx.executionTarget ?? null, process.cwd(), process.env);
    return { adapterType: "dsh_local", status: "pass", checks: [{ code: "dsh_cli", level: "info", message: `DSH command is available: ${command}` }], testedAt: new Date().toISOString() };
  } catch (error) {
    return { adapterType: "dsh_local", status: "fail", checks: [{ code: "dsh_cli_missing", level: "error", message: error instanceof Error ? error.message : String(error) }], testedAt: new Date().toISOString() };
  }
}
