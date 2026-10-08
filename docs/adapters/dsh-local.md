# DeepSeek Harness（DSH）

`dsh_local` 适配器通过 `dsh --profile acp` 将 DeepSeek Harness 作为 ACP 编程智能体运行。它会创建持久化 ACP 会话，供 Paperclip 在多次心跳运行之间恢复使用。

请在运行智能体的本机或远程执行环境中安装 `@deepseek-ai/dsh`。适配器会检查 `dsh` 可执行文件是否可用。身份验证使用 DSH 自带凭据存储，或智能体环境中的 `DEEPSEEK_API_KEY`。默认模型为 `deepseek-v4-flash`。

交互式 `dsh-tui` 配置面向人工终端操作，Paperclip 不会使用它。ACP 自动化配置基于标准 Agent Client Protocol 提供结构化任务输出、会话生命周期管理和取消功能。
