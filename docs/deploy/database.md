---
title: 数据库
summary: 内嵌 PGlite、Docker Postgres 与托管数据库
---

Paperclip 通过 Drizzle ORM 使用 PostgreSQL。数据库有三种运行方式。

## 1. 内嵌 PostgreSQL（默认）

无需配置。如果未设置 `DATABASE_URL`，服务器会自动启动内嵌 PostgreSQL 实例。

```sh
pnpm dev
```

服务器首次启动时会：

1. 创建 `~/.paperclip/instances/default/db/` 用于存储数据
2. 确保 `paperclip` 数据库存在
3. 自动运行迁移
4. 开始处理请求

数据会在重启后保留。重置方法：`rm -rf ~/.paperclip/instances/default/db`。

Docker 快速入门也默认使用内嵌 PostgreSQL。

## 2. 本地 PostgreSQL（Docker）

要在本地运行完整的 PostgreSQL 服务器：

```sh
docker compose up -d
```

此命令会在 `localhost:5432` 启动 PostgreSQL 17。设置连接字符串：

```sh
cp .env.example .env
# DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
```

推送数据库结构：

```sh
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \
  npx drizzle-kit push
```

## 3. 托管 PostgreSQL（Supabase）

生产环境可使用 [Supabase](https://supabase.com/) 等托管服务。

1. 在 [database.new](https://database.new) 创建项目
2. 从“项目设置 > 数据库”复制连接字符串
3. 在 `.env` 中设置 `DATABASE_URL`

迁移请使用**直连**（端口 5432），应用请使用**连接池连接**（端口 6543）。

如果使用事务模式的连接池，请通过环境变量禁用预处理语句，无需修改源码：

```sh
DATABASE_PREPARED_STATEMENTS=false
```

相关的可选客户端调优项包括：`DATABASE_POOL_MAX`、`DATABASE_IDLE_TIMEOUT_SECONDS`、`DATABASE_CONNECT_TIMEOUT_SECONDS`、`DATABASE_MAX_LIFETIME_SECONDS`、`DATABASE_APPLICATION_NAME`。未设置时使用驱动默认值；例外是空闲连接在 60 秒后关闭（设置 `DATABASE_IDLE_TIMEOUT_SECONDS=0` 可保持连接打开），且连接池报告的 `application_name=paperclip`。请参阅[连接池设置](#connection-pool-settings)。

## 连接池设置

服务器会为自身查询创建一个 postgres.js 连接池（当 `DATABASE_MIGRATION_URL` 指向其他连接时，还会创建第二个连接池）。以下设置均为可选项：

| 变量 | 默认值 | 作用 |
|----------|---------|--------|
| `DATABASE_POOL_MAX` | `10` (driver) | Maximum pooled connections. |
| `DATABASE_IDLE_TIMEOUT_SECONDS` | `60` | Close a pooled connection after this much idle time. `0` keeps idle connections open forever (the driver default). |
| `DATABASE_CONNECT_TIMEOUT_SECONDS` | `30` (driver) | Give up on a connection attempt after this long. |
| `DATABASE_MAX_LIFETIME_SECONDS` | 30–60 min, randomized (driver) | Recycle a pooled connection once it is this old. |
| `DATABASE_APPLICATION_NAME` | `paperclip` | Value of `application_name` in `pg_stat_activity`, so you can find Paperclip's backends: `SELECT * FROM pg_stat_activity WHERE application_name = 'paperclip';` |
| `DATABASE_PREPARED_STATEMENTS` | `true` (driver) | Set `false` behind a transaction-mode pooler (see above). |

服务器会在关闭时（SIGINT/SIGTERM）以及连接池创建后启动失败时关闭连接池，因此重启服务器不会遗留空闲后端连接。PostgreSQL 端的 `max_connections` 至少应能容纳每个服务器进程的 `DATABASE_POOL_MAX` 个连接，以及其他客户端所需的连接。

## 切换模式

| `DATABASE_URL` | 模式 |
|----------------|------|
| Not set | Embedded PostgreSQL |
| `postgres://...localhost...` | Local Docker PostgreSQL |
| `postgres://...supabase.com...` | Hosted Supabase |

无论使用哪种模式，Drizzle 数据库结构（`packages/db/src/schema/`）都相同。
