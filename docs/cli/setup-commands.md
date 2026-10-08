---
title: 设置命令
summary: 初始化、运行、诊断和配置
---

实例设置和诊断命令。

## `paperclipai run`

使用一条命令完成初始化并启动：

```sh
pnpm paperclipai run
```

此命令会：

1. 配置缺失时自动运行初始化
2. 运行启用修复功能的 `paperclipai doctor`
3. 检查通过后启动服务器

指定要使用的实例：

```sh
npx paperclipai run --instance dev
```

## `paperclipai onboard`

交互式首次设置：

```sh
pnpm paperclipai onboard
```

如果 Paperclip 已完成配置，再次运行 `onboard` 会保留现有配置。要修改已安装实例的设置，请使用 `paperclipai configure`。

首次运行时会出现以下选项：

1. `Quickstart`（推荐）：使用本地默认值（内嵌数据库、不配置 LLM 提供方、本地磁盘存储和默认密钥）
2. `Advanced setup`：完整的交互式配置

初始化后立即启动：

```sh
pnpm paperclipai onboard --run
```

使用 Quickstart 默认值并立即启动：

```sh
pnpm paperclipai onboard --yes
```

从交互式终端初始化并启动 Paperclip 时，会在浏览器中打开一次初始化页面。非交互式终端不会打开浏览器。无头环境或自动化运行时，可通过以下任一环境变量禁止打开浏览器：

```sh
PAPERCLIP_NO_BROWSER=1 pnpm paperclipai onboard --yes
PAPERCLIP_OPEN_ON_LISTEN=false pnpm paperclipai onboard --yes
```

对于已安装的实例，`--yes` 会保留当前配置并直接按该配置启动 Paperclip。

## `paperclipai doctor`

运行健康检查，可选择自动修复：

```sh
pnpm paperclipai doctor
pnpm paperclipai doctor --repair
```

检查内容：

- 服务器配置
- 数据库连接
- 密钥适配器配置；选择 AWS Secrets Manager 时也会检查非敏感环境变量配置
- 存储配置
- 缺失的密钥文件

## `paperclipai configure`

更新配置分区：

```sh
pnpm paperclipai configure --section server
pnpm paperclipai configure --section secrets
pnpm paperclipai configure --section storage
```

`--section secrets` 用于更新部署级密钥提供方；未指定公司保险库的密钥会回退到该提供方。每家公司自己的提供方保险库（命名实例、默认保险库选择、每个提供方配置多个保险库；GCP/Vault 即将支持）请在看板界面的“公司设置 → 密钥 → 提供方保险库”中管理，也可使用 `/api/companies/{companyId}/secret-provider-configs` API。

## `paperclipai env`

显示解析后的环境配置：

```sh
pnpm paperclipai env
```

如果已配置，也会显示 `PAPERCLIP_BIND`、`PAPERCLIP_BIND_HOST` 等监听地址相关的部署设置。

## `paperclipai allowed-hostname`

为“已认证/私有”模式放行一个私有主机名：

```sh
npx paperclipai allowed-hostname my-tailscale-host
```

## 本地存储路径

| 数据 | 默认路径 |
|------|-------------|
| Config | `~/.paperclip/instances/default/config.json` |
| Database | `~/.paperclip/instances/default/db` |
| Logs | `~/.paperclip/instances/default/logs` |
| Storage | `~/.paperclip/instances/default/data/storage` |
| Secrets key | `~/.paperclip/instances/default/secrets/master.key` |

通过以下环境变量修改：

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm paperclipai run
```

也可在任意命令中直接传入 `--data-dir`：

```sh
npx paperclipai run --data-dir ./tmp/paperclip-dev
npx paperclipai doctor --data-dir ./tmp/paperclip-dev
```
