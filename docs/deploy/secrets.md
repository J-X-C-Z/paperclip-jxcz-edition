---
title: 密钥管理
summary: 主密钥、加密与严格模式
---

Paperclip 使用本地主密钥对静态存储的密钥进行加密。Agent 环境变量中的敏感值（API key、token）以加密密钥引用的形式保存。

<a id="custody-boundaries"></a>

## 保管边界

Paperclip 会保护密钥值，直到将其交给 agent 或工作负载为止：

- 存储：密钥值由当前 provider 进行静态加密。本地 provider 使用不会离开主机的 key 加密。
- 传输：调用前，密钥值会在服务器端解密，并注入 agent 进程环境、SSH 命令环境、沙箱驱动或 HTTP 请求。Paperclip 不会将解密后的值返回给 board UI。
- 审计：每次解析都会记录一条非敏感事件（secret id、版本、provider id、使用方和结果），不包含密钥值或 provider 凭据。

密钥值到达使用它的进程后，Paperclip 就无法继续保证其保密性。Agent（或沙箱、远程主机）可以读取密钥值、写入自身日志或对话记录，也可以转交给下游工具。应将绑定给 agent 的任何密钥都视为已向该 agent 暴露。通过绑定限制影响范围（只绑定每个 agent 必需的密钥）、在 provider 支持时使用短期凭据，并在 agent 对话记录或下游系统可能已保存密钥值时进行轮换。

## 在运行中使用密钥

创建公司密钥不会自动创建环境变量。要使用密钥，需将其绑定到支持密钥引用的 agent、项目、环境或插件配置字段。

配置 Agent 和项目环境变量时：

1. 在 `Company Settings > Secrets` 中创建或关联密钥。
2. 打开 agent 的 `Environment variables` 字段，或项目的 `Env` 字段。
3. 添加进程所需的环境变量 key，例如 `GH_TOKEN` 或 `OPENAI_API_KEY`。
4. 将该行来源设为 `Secret`，选择已存储的密钥，并选择 `latest` 或固定版本。

运行时，Paperclip 会在服务器端解析所选密钥，并将解析后的值注入绑定行指定的环境变量 key。存储的密钥名称可以便于人类阅读；agent 进程实际接收的是绑定 key。

项目环境变量适用于该项目的每次 issue 运行。如果项目环境变量 key 与 agent 环境变量 key 相同，则在 Paperclip 注入自身的 `PAPERCLIP_*` 运行时变量之前，项目值优先生效。

除环境变量绑定外，**服务器本身**也会读取以下名称之一的公司密钥
`GITHUB_TOKEN`、`GH_TOKEN` 或 `PAPERCLIP_GITHUB_TOKEN`（按名称读取，无需绑定），用于服务器端 git 操作身份验证——为仅仓库项目工作区克隆私有 GitHub 仓库，以及刷新 worktree 基础 ref。参阅
[执行工作区](../guides/board-operator/execution-workspaces-and-runtime-services.md#private-repositories-and-repo-only-project-workspaces)。

## 用户专属密钥

用户专属密钥允许共享 agent 或项目声明一个槽位（例如 `github_api_token`），并在分派运行时解析由该运行负责用户持有的密钥值。环境绑定只存储定义 key：

```json
{
  "env": {
    "GITHUB_TOKEN": {
      "type": "user_secret_ref",
      "key": "github_api_token",
      "required": true,
      "allowMissingOverride": false
    }
  }
}
```

Paperclip 将此功能存储为不含密钥值的元数据，以及用户自己的密钥值记录：

- `user_secret_definitions`：可复用槽位的公司级元数据。
- `user_secret_declarations`：`user_secret_ref` 绑定的目标/配置路径声明，包括必需/可选策略。
- `company_secrets` 中满足 `scope = "user"` 且包含 `owner_user_id` 和 `user_secret_definition_id` 的记录：当前用户的实际密钥值记录。
- `company_secret_versions`：该密钥值记录的加密版本元数据或 provider 托管版本元数据。

Board/admin 运维人员负责管理定义和覆盖情况。各用户自行管理自己的密钥值。Board/admin 覆盖视图必须仅展示元数据：可以显示缺失、已配置、未启用、provider 和密钥库状态，但不得显示明文值、原始外部引用、provider 凭据或 provider 错误 payload。

缺少负责用户、定义，或负责用户没有有效密钥时，必需的用户密钥引用会以 fail-closed 方式失败。
可选引用可以省略环境变量，但不得注入空凭据，也不得回退使用其他用户的密钥值。

### 密钥库存放位置

用户范围的密钥值可以使用与公司密钥相同的 provider 类型：

- `local_encrypted`：默认本地方案，适用于本地可信安装和小型自托管部署。同一个主密钥同时保护公司范围和用户范围的密钥值。
- `aws_secrets_manager`：托管/provider 密钥库方案。如果部署已使用 AWS Secrets Manager、KMS、CloudTrail 和基础设施 IAM 管理密钥，可选择此方案。
- 专用 provider 密钥库：可选。只有在需要为用户自有密钥值设置独立 AWS 账户、Region、KMS key、前缀、保留策略或导入边界时，才使用专用密钥库。默认不要为每个用户创建一个密钥库；建议按环境或合规边界配置密钥库。

用户密钥定义可以包含 provider 和密钥库默认值。如果实现路径支持覆盖，用户密钥值也可以包含 provider/密钥库元数据。两种情况下，provider 密钥库配置都只能包含非敏感路由元数据。Provider 凭据仍须来自部署基础设施身份，而不是 Paperclip 密钥。

### 外部引用命名

外部密钥库引用属于密钥相关元数据。尽管路径、ARN、版本、别名和 tag 不是明文密钥值，仍应将其视为运维敏感信息。

运维人员管理的 AWS 路径建议采用以下外部引用格式：

```text
paperclip-ext/{environment}/{company-id}/user-secrets/{definition-key}/{opaque-owner-id}
```

指南：

- 使用用户密钥定义 key 表示凭据类型，例如
  `github_api_token`.
- owner 部分使用不透明且稳定的用户 ID，或单向映射的 subject ID。不要在 provider 路径中使用邮箱、个人姓名、客户名称、OAuth scope 或 ticket 标识符。
- Provider 元数据不得包含密钥值。安全的元数据示例包括 provider id、密钥库 id、Region、KMS key id 或别名、tag 数量和指纹哈希。不要存储原始 AWS 描述、完整 tag 映射、token scope、provider 错误正文，或任何从密钥值复制的内容。
- Paperclip 托管的 AWS 密钥值必须位于 Paperclip 托管命名空间下。防护规则会禁止将该命名空间下的引用作为外部引用；需要由 Paperclip 创建并轮换密钥值时，请使用 Paperclip 托管流程。

### IAM 注意事项

Paperclip 会强制执行公司范围、负责用户推导、声明策略、当前用户值 API、脱敏和访问事件元数据规则，但不能替代外部密钥库自身的 IAM 策略。

对于 AWS Secrets Manager，Paperclip 运行时角色需要对它可能解析的每个用户范围密钥值拥有 `GetSecretValue` 和所需的 KMS 解密权限。如果关联的用户专属外部引用位于 Paperclip 托管前缀之外，请将这些权限限定在获准的外部前缀和 KMS key 范围内。AWS tag/名称筛选可帮助运维人员搜索，但不能作为解析权限边界。

如需更强的 provider 侧隔离，请在关联引用前，按 provider 密钥库、AWS 账户、Region、前缀或运行时角色拆分用户密钥工作负载。Paperclip 可以阻止 agent 选择其他凭据持有者；但如果运行时角色拥有广泛的外部密钥库读取权限，一旦 Paperclip 之外新增其他代码路径，仍可读取 IAM 所允许的内容。

## 默认 Provider：`local_encrypted`

密钥使用存储在以下位置的本地主密钥加密：

```
~/.paperclip/instances/default/secrets/master.key
```

该 key 会在引导流程中自动创建，且不会离开本机。Paperclip 在创建或加载 key 文件时会尽力设置 `0600` 权限。如果该文件可被组内或其他用户读取，`paperclipai doctor` 和 provider 健康状态 API 会发出警告。

备份数据库时也要备份 key 文件。没有 key 的数据库备份无法解密本地密钥；只有 key 备份而没有数据库元数据，也不足以恢复命名密钥版本。

## 配置

### CLI 设置

引导流程会写入默认密钥配置：

```sh
pnpm paperclipai onboard
```

更新密钥设置：

```sh
pnpm paperclipai configure --section secrets
```

验证密钥配置：

```sh
pnpm paperclipai doctor
npx paperclipai secrets doctor --company-id <company-id>
```

### 环境变量覆盖项

| Variable | Description |
|----------|-------------|
| `PAPERCLIP_SECRETS_MASTER_KEY` | 32-byte key as base64, hex, or raw string |
| `PAPERCLIP_SECRETS_MASTER_KEY_FILE` | Custom key file path |
| `PAPERCLIP_SECRETS_STRICT_MODE` | Set to `true` to enforce secret refs |

## 严格模式

启用严格模式后，敏感环境变量 key（匹配 `*_API_KEY`、`*_TOKEN`、`*_SECRET`）必须使用密钥引用，不得直接填写明文值。

```sh
PAPERCLIP_SECRETS_STRICT_MODE=true
```

除本地可信部署外，建议所有部署都启用此模式。

除非通过配置或 `PAPERCLIP_SECRETS_STRICT_MODE=false` 显式覆盖，经过身份验证的部署默认启用严格模式。

## 外部引用

通过设置 `managedMode: "external_reference"` 和 provider `externalRef`，即可关联由 provider 管理的密钥，而无需将密钥值复制到 Paperclip。Paperclip 只存储元数据和非敏感指纹，不存储密钥值。运行时仍由服务器解析，并强制检查绑定。

内置的 AWS、GCP 和 Vault provider ID 当前接受外部引用元数据，但运行时解析要求部署中已配置相应 provider。在完成配置前，provider 健康检查会将其报告为警告。

如需了解 AWS 上托管的 Paperclip Cloud 的 AWS Secrets Manager 运维约定——包括必需环境变量、IAM/KMS 范围、命名和 tag 规范，以及备份/轮换/事件处理手册——请参阅 `doc/SECRETS-AWS-PROVIDER.md`。

<a id="provider-vaults"></a>

## Provider 密钥库

*Provider 密钥库*是按名称标识、限定公司范围的配置，用于将密钥材料指向受支持的 provider 后端。每家公司可配置多个密钥库，同一 provider 类型也可有多个，并可为每种类型选择一个默认密钥库供新密钥操作使用。配置密钥库之前创建的现有密钥仍会通过部署级默认 provider 解析，无需迁移。

### 配置位置

在 board UI 中打开 `Organization Settings → Secrets`，切换到 `Provider vaults` 标签页。你可以在此：

- 为任意受支持的 provider 类型创建密钥库。
- 编辑现有密钥库中的非敏感配置。
- 为每种 provider 类型设置一个就绪的公司默认密钥库。
- 禁用密钥库（软删除，保留审计历史）。
- 对密钥库运行健康检查，并直接查看最新结果。

自动化可通过 `/api/companies/{companyId}/secret-provider-configs` 使用相同操作。完整路由表请参阅[密钥 API 参考](/api/secrets#provider-vaults)。

### Provider 凭据保管

Provider 密钥库有意只存储**非敏感**配置：
例如 region、project id、namespace、prefix、KMS key id、mount path、address 等路由元数据。API、UI 和 activity log 均不会接受、返回或显示 provider 凭据值。提交名称类似以下内容的字段时，
`accessKeyId`、`secretAccessKey`、`token`、`password`、`serviceAccountJson`、`privateKey`、`keyFile`、`unsealKey` 或任何常见凭据别名，都会在校验时被拒绝。

这使 AWS provider 的引导规则同样适用于所有 provider 类型：**provider 凭据应放在部署基础设施身份中，而不是 Paperclip 公司密钥中**。允许的凭据来源包括附加到 Paperclip 服务器的工作负载身份（instance profile、IRSA、ECS task role）、本地运行时的 `AWS_PROFILE` / SSO / shared config、用于启动服务器的编排器密钥存储，或本地开发用的短期 shell 凭据。不要将长期有效的 API key 粘贴到密钥库配置中。

### 密钥库状态

每个密钥库都有一个状态，用于控制运行时可对其执行的操作：

| 状态 | 含义 |
|---------------|-----------------------------------------------------------------------------------------------|
| `ready`       | Selectable for create/rotate/resolve. Eligible to be the default.                             |
| `warning`     | Saved config exists but health needs attention (for example missing AWS env). Still selectable. |
| `coming_soon` | Visible and editable as draft metadata, but locked out of all runtime operations.            |
| `disabled`    | Soft-deleted. Hidden from the secret create/rotate flow.                                      |

在对应运行时模块发布前，`gcp_secret_manager` 和 `vault` 固定为 `coming_soon`。设置 UI 允许保存这些 provider 的配置草稿（并在密钥库列表中显示），但针对即将推出的密钥库创建、轮换和解析密钥的调用会明确报错，提示运行时已锁定。

### 默认密钥库行为

每家公司可将每种 provider 类型下的**一个**就绪（或警告）状态密钥库设为默认值。创建和轮换密钥的对话框会预选所选 provider 的默认密钥库，避免运维人员记错。即将推出或已禁用的密钥库不能设为默认值；尝试这样设置会返回校验错误。设置新的默认项时，会自动清除该 provider 之前的默认项。

如果创建密钥时没有 `providerConfigId`（尚无密钥库，或运维人员清空了选择器），运行时解析会回退到部署级 provider 配置，即现有安装使用的路径。这样，在配置 provider 密钥库前创建的密钥无需迁移即可继续使用。在 UI 中选择默认密钥库属于显式选择，不是运行时回退：创建请求仍会发送明确的 `providerConfigId`。

### 每种 Provider 配置多个密钥库

同一种 provider 类型支持配置多个密钥库。常见场景包括：

- 两个 AWS 密钥库分别指向不同 Region 或 KMS key，以隔离环境。
  以隔离环境。
- 同时配置 staging 和 production 的 Vault address。
- 为某一产品线配置独立 GCP 项目，公司的其他部分使用另一个项目。

每个密钥库都有自己的显示名称、状态、默认标记和健康记录。创建或轮换密钥时由运维人员明确选择密钥库；系统会预选默认密钥库，避免误路由到错误账户。

### 单个密钥库健康检查

`POST /api/secret-provider-configs/{id}/health` 会运行 provider 专属健康探测，并将结果保存到密钥库记录。设置 UI 提供相同操作，并在页面中直接显示结果。健康状态响应包含状态、面向运维人员的消息和结构化指南（例如缺少的环境变量名称、预期凭据来源和备份提醒），绝不包含 provider 凭据或密钥值。即将推出的密钥库始终返回 `runtime_locked` 健康状态代码，不会调用 provider 模块。

### Provider 专属说明

**本地加密密钥库**封装现有的 `local_encrypted` provider。上文介绍的主密钥路径和轮换指南仍然适用。本地密钥库配置主要用于记录信息，并明确确认 key 文件已与数据库一同备份。

**AWS Secrets Manager 密钥库**读取每个密钥库的 `region`、`namespace`、
`secretNamePrefix`、`kmsKeyId`、`ownerTag` 和 `environmentTag`，用于路由托管写入和外部引用读取。密钥库配置会补充（并可覆盖）部署级 `PAPERCLIP_SECRETS_AWS_*` 环境变量。引导凭据仍来自 AWS SDK 默认凭据链；完整 IAM 和 KMS 约定请参阅 `doc/SECRETS-AWS-PROVIDER.md`。

**GCP Secret Manager** 和 **HashiCorp Vault** 密钥库即将推出。你可以预先保存 `projectId`、`location`、`namespace`、`address` 和 `mountPath` 配置草稿，以便 provider 模块发布后启用。Vault `address` 必须是仅包含 origin 的 `http(s)://host[:port]` URL；含内嵌凭据、路径、查询字符串或片段的地址会被拒绝。

### 从 AWS 密钥库远程导入

AWS provider 密钥库可以将 AWS Secrets Manager 中已有条目导入为 Paperclip `external_reference` 密钥。这只是元数据关联：Paperclip 存储 AWS ARN/路径、指纹/版本引用和绑定元数据。预览或导入过程中都不会读取、复制、存储、记录或显示远程密钥明文值。

在 board UI 中的运维流程：

1. 打开 `Company Settings -> Secrets`。
2. 确认至少有一个 AWS provider 密钥库处于 `ready` 或 `warning` 状态。
3. 在 `Secrets` 标签页中选择 `Import from vault`。
4. 选择 AWS 密钥库，搜索远程清单，并根据需要加载更多页面。
5. 勾选要导入的行，检查/编辑 Paperclip name 和 key，然后提交。
6. 查看结果摘要，了解已创建、已跳过和失败的行数。

预览列表特意采用分页和优先搜索的方式。AWS 账户在每个 Region 中的清单可能很大，而 `ListSecrets` 返回不透明的 `NextToken` 游标。不要期待 Paperclip 在后台遍历整个账户；应按需加载页面，并在请求受限时采用退避策略重试。

远程导入会呈现 Paperclip 运行时角色可见的 AWS 密钥元数据，包括名称/ARN 和安全的派生字段，如日期、是否存在描述或 KMS key，以及 tag 数量。名称、ARN、tag 和搜索文本都可能属于敏感运维元数据。API 和 activity log 不得存储原始描述、tag、明文值、provider 凭据或原始 AWS 错误内容。

AWS 权限要求：

- 预览需要可选的 `secretsmanager:ListSecrets` 权限，资源范围为 `Resource: "*"`。AWS 不支持通过 IAM 边界将 `ListSecrets` 限定到单个密钥 ARN 或 tag。
- 预览/导入不得调用 `secretsmanager:GetSecretValue`、`secretsmanager:BatchGetSecretValue`，也不得执行 KMS 解密。
- 运行时解析导入的引用时，仍需对所选外部 ARN/路径拥有 `secretsmanager:GetSecretValue` 权限；如果密钥使用客户管理的 key，还需 KMS 解密权限。
- 托管密钥的创建/轮换/删除权限应限定在 Paperclip 部署前缀下。不要仅因为启用了清单导入而扩大托管写入/删除权限。

安全隔离应依靠部署配置，而不是 AWS 列表筛选：为每个环境/账户配置专用 Paperclip 运行时角色；让 AWS 密钥库指向目标账户和 Region；仅在清单信息可接受暴露的环境中启用导入角色；并将导入路由限制为 board 专用。Tag 和名称筛选只是搜索辅助，不是权限模型。

如果导入预览失败：

- `AccessDenied` 或 `not authorized`：运行时角色缺少 `secretsmanager:ListSecrets`；只有当该密钥库需要启用远程导入时，才添加可选的清单权限语句。
- 请求限流：稍等片刻后重试，并在加载更多页面前缩小搜索范围。
- 游标无效：刷新预览；AWS `NextToken` 是不透明值，可能过期或失效。
- 导入后运行时解析失败：检查所选外部密钥的 `GetSecretValue` 和 KMS 解密权限范围。清单中可见并不能证明运行时角色有权读取该值。

### 备份与恢复

不同 provider 类型的备份方式各不相同：

- `local_encrypted`：应同时备份本地主密钥文件和 Paperclip 数据库。单独备份其中任何一项都不足以恢复加密值；密钥库记录仅保存文件路径和确认状态，不保存 key 内容。用户范围的值也适用此规则：数据库保存
  `user_secret_definitions`, `user_secret_declarations`,
- `company_secrets.scope = "user"` 记录、版本元数据和 owner ID；解密本地材料必须有 key 文件。
- `aws_secrets_manager`：备份 Paperclip 数据库中的密钥库元数据
  （密钥库 id、region、前缀、KMS key id、默认标记、绑定、版本指针、用户密钥定义/声明、owner ID 和访问事件元数据）。实际密钥值存储在 AWS Secrets Manager 配置的前缀或运维人员管理的外部引用下；恢复时，将同一 Paperclip 公司指向相同 AWS 命名空间，并确认运行时角色仍对托管及关联的用户范围密钥拥有 `GetSecretValue` 和 KMS 解密权限。完整恢复清单位于
  `doc/SECRETS-AWS-PROVIDER.md`.
- `gcp_secret_manager` 和 `vault`：功能推出前，Paperclip 中只有密钥库配置草稿。数据库备份会包含这些配置；运行时支持发布前，无需恢复 provider 侧数据。

### AWS Provider 引导边界

AWS Secrets Manager provider 无法从 Paperclip `company_secrets` 中为自身提供引导凭据。在服务器能够创建或解析 AWS 托管的公司密钥之前，必须先配置初始 AWS 访问权限，无论你使用的是部署级默认配置还是每公司的密钥库。

对于 Paperclip Cloud，在 board UI 中启用 AWS 托管密钥前，应先配置服务器运行时 IAM role/工作负载身份、KMS key、部署前缀和非敏感的 `PAPERCLIP_SECRETS_AWS_*` 环境配置。对于自托管和本地运行，请使用 AWS SDK 默认凭据链：instance profile、ECS task role、EKS IRSA/OIDC web identity、通过 `AWS_PROFILE` 使用 AWS SSO/shared config，或本地开发用的短期 shell 凭据。

不要将 AWS root 凭据或长期有效的 IAM 用户 access key 存储在 Paperclip 密钥中。引导材料应保存在基础设施 IAM/工作负载身份、进程环境、AWS profile 或编排器密钥存储中。

## 迁移内联密钥

如果现有 agent 配置中直接写入了 API key，请将其迁移为加密密钥引用：

```sh
npx paperclipai secrets migrate-inline-env --company-id <company-id>
npx paperclipai secrets migrate-inline-env --company-id <company-id> --apply

# low-level script for direct database maintenance
pnpm secrets:migrate-inline-env         # dry run
pnpm secrets:migrate-inline-env --apply # apply migration
```

常规操作请使用 CLI 命令，因为它会通过 Paperclip API 创建或轮换密钥记录，并在带审计日志的情况下更新 agent 环境变量绑定。

## 可移植声明

公司导出仅包含环境变量声明，不包含 secret ID、provider 引用、加密材料或明文值。

```sh
npx paperclipai secrets declarations --company-id <company-id> --kind secret
```

将 package 导入其他实例前，请使用这些声明在目标部署中创建本地密钥值或关联托管 provider 引用。对于 AWS Secrets Manager 等托管 provider，密钥值仍由该 provider 保管；Paperclip 存储元数据和 provider 版本引用，不存储 provider 凭据或密钥明文值。

## Agent 配置中的密钥引用

Agent 环境变量使用密钥引用：

```json
{
  "env": {
    "ANTHROPIC_API_KEY": {
      "type": "secret_ref",
      "secretId": "8f884973-c29b-44e4-8ea3-6413437f8081",
      "version": "latest"
    }
  }
}
```

服务器会在运行时解析并解密密钥引用，再将真实值注入 agent 进程环境。
