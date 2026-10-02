export const type = "dsh_local";
export const label = "DeepSeek Harness (DSH)";
export const DEFAULT_DSH_MODEL = "deepseek-v4-flash";
export const models = [{ id: DEFAULT_DSH_MODEL, label: "DeepSeek V4 Flash" }];

export const agentConfigurationDoc = `# dsh_local agent configuration

Adapter: dsh_local

Runs DeepSeek Harness through its standard Agent Client Protocol (ACP) profile.
Install \`@deepseek-ai/dsh\` on the Paperclip execution host. Paperclip starts
\`dsh --profile acp\`; it does not start the interactive dsh-tui profile.

Fields:
- model (string, optional): model id, defaults to ${DEFAULT_DSH_MODEL}.
- command (string, optional): DSH executable, defaults to dsh.
- env (object, optional): process environment overrides, including DEEPSEEK_API_KEY.
- mode (string, optional): ACP session mode, persistent by default.
- timeoutSec (number, optional): run timeout in seconds.
- cwd (string, optional): default working directory.

Authentication may come from DSH's configured credential store or DEEPSEEK_API_KEY.
Paperclip delivers its task and workspace context through the standard ACP session.
`;
