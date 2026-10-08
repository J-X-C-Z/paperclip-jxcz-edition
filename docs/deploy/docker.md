---
title: Docker
summary: Docker Compose 快速入门
---

无需在本机安装 Node 或 pnpm，即可通过 Docker 运行 Paperclip。

## Compose 快速入门（推荐）

```sh
docker compose -f docker/docker-compose.quickstart.yml up --build
```

Open [http://localhost:3100](http://localhost:3100).

默认值：

- 主机端口：`3100`
- 数据目录：`./data/docker-paperclip`

通过环境变量覆盖：

```sh
PAPERCLIP_PORT=3200 PAPERCLIP_DATA_DIR=../data/pc \
  docker compose -f docker/docker-compose.quickstart.yml up --build
```

**注意：** `PAPERCLIP_DATA_DIR` 相对于 compose 文件（`docker/`）解析，因此 `../data/pc` 会映射到项目根目录下的 `data/pc`。

## 手动构建 Docker 镜像

```sh
docker build -t paperclip-local .
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

## 数据持久化

所有数据都会持久化到绑定挂载目录（`./data/docker-paperclip`）中：

- 内嵌 PostgreSQL 数据
- 上传的资源
- 本地密钥
- 智能体工作区数据

## Docker 中的本地适配器 CLI

Docker 镜像预装了以下智能体 CLI，以便相应的 `*_local` 适配器可以在容器内运行：

- `claude` (Anthropic Claude Code CLI) — `claude_local`
- `codex` (OpenAI Codex CLI) — `codex_local`
- `opencode` (OpenCode multi-provider CLI) — `opencode_local`
- `gemini` (Google Gemini CLI) — `gemini_local` (experimental)

传入 API 密钥以启用容器内的本地适配器运行：

```sh
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-... \
  -e GEMINI_API_KEY=... \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

每个适配器都会读取相应提供方的标准凭据，例如 Claude 的 `ANTHROPIC_API_KEY`、Codex 的 `OPENAI_API_KEY`，以及 Gemini 的 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`。OpenCode 支持多个提供方，会使用你传入的对应密钥。

> **Gemini 密钥限制：** Google 要求 Gemini API 密钥限制为仅用于 Gemini API（在 Google Cloud 控制台中设置范围）；未受限的密钥会被拦截，导致 `gemini_local` 运行时出现身份验证错误。请创建受限密钥，或通过 `gemini auth login` 使用 OAuth 登录，并通过数据卷持久化 `~/.gemini`，以便容器重启后仍保留凭据。

镜像设置了 `GEMINI_SANDBOX=false`，避免 Gemini CLI 在容器中再启动自己的（Docker-in-Docker）沙箱。`gemini_local` 适配器每次运行时已经传入 `--sandbox=none`，因此只有在容器内手动调用 `gemini` 时，这个环境变量才会生效；如果环境支持嵌套容器且需要 CLI 级沙箱，可覆盖该值。

即使没有 API 密钥，应用仍可正常运行；适配器环境检查会提示缺少的前置条件。
