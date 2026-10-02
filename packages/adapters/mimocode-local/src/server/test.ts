import type { AdapterEnvironmentTestContext, AdapterEnvironmentTestResult } from "@paperclipai/adapter-utils";
import { ensureAdapterExecutionTargetCommandResolvable } from "@paperclipai/adapter-utils/execution-target";
import { asString } from "@paperclipai/adapter-utils/server-utils";

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const config = ctx.config ?? {};
  const command = asString(config.command, "mimo").trim() || "mimo";
  try {
    await ensureAdapterExecutionTargetCommandResolvable(command, ctx.executionTarget ?? null, process.cwd(), process.env);
    return { adapterType: "mimocode_local", status: "pass", checks: [{ code: "mimocode_cli", level: "info", message: `MiMo Code command is available: ${command}` }], testedAt: new Date().toISOString() };
  } catch (error) {
    return { adapterType: "mimocode_local", status: "fail", checks: [{ code: "mimocode_cli_missing", level: "error", message: error instanceof Error ? error.message : String(error) }], testedAt: new Date().toISOString() };
  }
}
