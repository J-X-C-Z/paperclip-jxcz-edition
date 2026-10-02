# DeepSeek Harness (DSH)

The `dsh_local` adapter runs DeepSeek Harness as an ACP coding agent using
`dsh --profile acp`. It creates persistent ACP sessions that Paperclip can
resume across heartbeat runs.

Install `@deepseek-ai/dsh` on the machine or remote execution environment that
runs the agent. The adapter checks that the `dsh` executable is available.
Authentication uses DSH's own credential store or `DEEPSEEK_API_KEY` in the
agent environment. The default model is `deepseek-v4-flash`.

The interactive `dsh-tui` profile is designed for a human terminal and is not
used by Paperclip. The ACP automation profile provides structured task output,
session lifecycle, and cancellation over the standard Agent Client Protocol.
