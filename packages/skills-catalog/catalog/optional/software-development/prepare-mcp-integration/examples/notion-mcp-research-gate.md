# 示例：研究并审批 Notion MCP 连接

## 输入

> 研究 Notion 托管的 MCP server，并为 Paperclip 准备集成。从供应商文档 URL 开始。在我批准研究前，不要构建 connector。

## 执行步骤

1. 从内容目标 commit 中阅读当前的 `paperclip-content/integrations/README.md` 和 integration harness。
2. 研究 Notion 官方 MCP、OAuth、scopes、工具、限制和管理员设置。记录 URL 和访问日期；对未知项明确标记，不要猜测。
3. 添加或修改 catalog 内容前，先协调已有 Notion 集成 artifacts 和开放 PR。
4. 在 `paperclip-content` 中创建一份仅包含研究内容的 PR，并附上集成操作手册要求的规划材料。
5. 在 issue 文档中记录研究 PR head SHA 和拟议的连接清单，然后针对该确切版本请求确认。
6. 停止处理，并将 issue 保持为审查状态。此时尚未创建 Paperclip App 分支。

## 审批材料

```text
研究 PR：https://github.com/paperclipai/paperclip-content/pull/123
研究 head：0123456789abcdef0123456789abcdef01234567
Content 源码：89abcdef0123456789abcdef0123456789abcdef
App 源码：fedcba9876543210fedcba9876543210fedcba98
拟议的连接清单：
- notion-mcp：一个 OAuth 凭据负责人、托管 MCP endpoint，以及可独立审查的 Notion 操作 catalog
已知限制：
- 获批后，生产环境 OAuth 授权仍需 QA 使用凭据进行验证。
下一步操作：
- 由人工确认或拒绝此确切的研究版本。
```

获批后，为 `notion-mcp` 创建一个隔离的 Paperclip App worktree 和 PR，重读当前 Connector Playbook，并遵循其实施和验证要求。如果研究发现可复用的 OAuth 或文档规则，应先通过适当的 PR 更新对应的上游操作手册，再将 connector 标记为可合并。
