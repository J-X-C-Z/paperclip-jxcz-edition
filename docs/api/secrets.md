---
title: 密钥
summary: 密钥增删改查
---

管理加密密钥。Agent 可通过环境绑定接收密钥，也可按需获取。

## Agent 查询与获取

这些路由要求使用与当前运行绑定的 agent JWT。长期有效的 agent key、低信任审查 agent、task-bridge key 和技能测试 token 均不可使用这些路由。

列出当前运行可访问的密钥，但不返回密钥值：

```
GET /api/agents/me/secrets
```

```json
{
  "secrets": [
    {
      "key": "github_token",
      "secretRef": "11111111-1111-4111-8111-111111111111",
      "name": "GitHub token",
      "description": null,
      "delivery": "env",
      "projectionClass": "unclassified",
      "latestVersion": 2,
      "versionSelector": "latest",
      "resolvedVersion": 2
    }
  ]
}
```

`delivery` 的取值为 `env`、`api` 或 `both`。`secretRef` 是稳定的不透明句柄，并非密钥材料或访问凭证；每个使用它的路由都会重新授权。
列表不会返回密钥值、内部 `secretId` 字段、绑定 ID 或配置路径。`env.*` 绑定意味着可通过此 API 读取；`access.*` 绑定只授予 API 访问权限，不会注入环境变量。

仅在需要时获取密钥值。请求没有请求体，响应使用 `Cache-Control: no-store`：

```
POST /api/agents/me/secrets/github_token/value
```

```json
{
  "key": "github_token",
  "value": "decrypted-secret-value",
  "version": 2
}
```

如果 adapter 或其子进程每次运行都需要该值，优先使用环境变量注入。如果只有部分运行会用到、值较大或结构化，或者技能和工具不会继承 adapter 环境变量，则优先按需获取。每次成功或失败的值获取都会记录到 `secret_access_events` 和 `activity_log`；agent 不得将获取到的值写入日志，也不得粘贴到 issue、评论或文档中。

## Agent 密钥绑定提案

这些路由与查询和获取路由使用相同的当前运行绑定 agent JWT：

```
POST /api/agents/me/secret-proposals
GET /api/agents/me/secret-proposals
DELETE /api/agents/me/secret-proposals/{proposalId}
```

Agent 可以请求 Paperclip 将已有密钥绑定到新路径，而无需知道 secret ID。将 `kind` 设为 `binding`，并通过该 agent 自己已有的 `env.*` 或 `access.*` 配置路径指定来源：

```json
POST /api/agents/me/secret-proposals
{
  "kind": "binding",
  "sourceConfigPath": "access.openai_api_key",
  "configPath": "access.evals_openai_api_key",
  "justification": "Use the existing OpenAI credential under the eval-specific alias"
}
```

`sourceConfigPath` 必须解析到提案 agent 自己的绑定。未知路径或其他 agent 的路径会返回 `404`。绑定请求必须且只能提供 `sourceConfigPath`、`secretId` 或 `secretProposalId` 其中之一。
省略 `targetAgentId` 时，目标为提案 agent；按默认策略，manager 也可以指定自己的下属为目标。`configPath` 支持用于环境变量注入的 `env.<KEY>`，或用于仅 API 访问的 `access.<ALIAS>`。

如果运行关联的源 issue 已检出，成功提交提案后会在该 issue 中自动创建仅供人工处理的 **确认密钥绑定**卡片。API 客户端不得再创建第二个交互。卡片仅包含非敏感元数据：来源标签、目标 agent、新配置路径、理由和过期时间。

选择**创建绑定**会接受卡片，并随后触发一次单独且重新授权的绑定写入。接受卡片不等于执行。请读取 `result.secretProposal.status` 查看实际结果：

- `executed` 表示绑定写入已完成。
- `failed` 表示卡片已接受，但执行失败。卡片显示 **FAILED**，提供非敏感的 `errorCode`，Paperclip 还会发布 **密钥绑定执行失败**评论，并注明 `Binding created: no`。
- `rejected`、`withdrawn` 或 `expired` 表示未创建绑定。

处理完成后，卡片会唤醒 issue 负责人。唤醒 payload 包含 `secretProposal.configPath`、`decision`、`executionStatus` 和操作说明。任何密钥卡片处理完成后，使用新绑定前都应再次调用 `GET /api/agents/me/secrets`，确认预期的密钥元数据和交付方式。接受卡片并不代表执行成功；若唤醒失败或缺少元数据，必须将该别名视为不可用，直到新的提案成功执行。

## 列出密钥

```
GET /api/companies/{companyId}/secrets
```

返回密钥元数据（不包含解密后的值）。

## 创建密钥

```
POST /api/companies/{companyId}/secrets
{
  "name": "anthropic-api-key",
  "value": "sk-ant-..."
}
```

密钥值会以静态加密方式存储。响应仅返回 secret ID 和元数据。

如需关联由 provider 管理的密钥，而不将密钥值复制到 Paperclip，请创建外部引用密钥：

```json
{
  "name": "prod-stripe-key",
  "provider": "aws_secrets_manager",
  "managedMode": "external_reference",
  "externalRef": "arn:aws:secretsmanager:us-east-1:123456789012:secret:paperclip/prod/stripe",
  "providerVersionRef": "version-id-or-label"
}
```

Paperclip 只存储 provider 引用和非敏感指纹。配置好 provider 后，服务器运行时会通过强制检查绑定上下文并记录访问事件的路径解析密钥值。

## Provider 健康状态

```
GET /api/companies/{companyId}/secret-providers/health
```

返回 provider 配置诊断、警告和本地备份指南。健康状态响应不得包含密钥值或 provider 凭据。

对于 `aws_secrets_manager`，未就绪的健康状态响应会列出缺失的非敏感 provider 环境变量、服务器运行时预期使用的 AWS SDK 默认凭据来源，并说明不得将 AWS 引导凭据存储在 Paperclip 的 `company_secrets` 中。

对应的 CLI 检查命令：

```sh
npx paperclipai secrets doctor --company-id {companyId}
```

<a id="provider-vaults"></a>

## Provider 密钥库

Provider 密钥库是按名称标识、限定公司范围的配置，用于将密钥材料路由到受支持的 provider 后端。运维模型和保管规则请参阅[密钥部署指南](/deploy/secrets#provider-vaults)。

以下所有路由都要求 board 身份验证和公司访问权限。变更路由会生成 `secret_provider_config.*` activity-log 条目。此接口不会返回 provider 凭据值；在 `config` 中提交类似凭据的字段会在校验时被拒绝。

### 列出密钥库

```
GET /api/companies/{companyId}/secret-provider-configs
```

返回该公司的所有密钥库（包括为审计保留的已禁用记录）。每项包含 id、provider、displayName、status、isDefault、非敏感的 `config`、最新健康状态快照（`healthStatus`、`healthCheckedAt`、`healthMessage`、`healthDetails`）、`disabledAt` 和审计字段。

### 创建密钥库

```
POST /api/companies/{companyId}/secret-provider-configs
{
  "provider": "aws_secrets_manager",
  "displayName": "Prod US-East",
  "isDefault": true,
  "config": {
    "region": "us-east-1",
    "namespace": "paperclip",
    "secretNamePrefix": "paperclip",
    "kmsKeyId": "arn:aws:kms:us-east-1:123456789012:key/abcd-...",
    "environmentTag": "production"
  }
}
```

各 provider 对应的 `config` 结构：

- `local_encrypted`: optional `backupReminderAcknowledged: boolean`.
- `aws_secrets_manager`: required `region`; optional `namespace`,
  `secretNamePrefix`, `kmsKeyId`, `ownerTag`, `environmentTag`.
- `gcp_secret_manager` (coming soon): optional `projectId`, `location`,
  `namespace`, `secretNamePrefix`.
- `vault` (coming soon): optional origin-only HTTPS `address`, `namespace`,
  `mountPath`, `secretPathPrefix`. `address` values with embedded credentials,
  paths, query strings, or fragments are rejected.

`local_encrypted` 和 `aws_secrets_manager` 的 `status` 默认值为 `ready`，`gcp_secret_manager` 和 `vault` 的默认值为 `coming_soon`。即将推出或已禁用的密钥库不能设为 `isDefault`。将 `isDefault: true` 会在同一事务中清除同一 provider 之前的默认项。

### 获取密钥库

```
GET /api/secret-provider-configs/{id}
```

### 更新密钥库

```
PATCH /api/secret-provider-configs/{id}
{
  "displayName": "Prod US-East-2",
  "config": {
    "region": "us-east-2",
    "kmsKeyId": "arn:aws:kms:us-east-2:123456789012:key/abcd-..."
  }
}
```

更新时会整体替换 `config`；请传入完整 provider 配置 payload，而非部分 diff。在运行时模块发布前，`gcp_secret_manager` 和 `vault` 的状态只能设为 `coming_soon` 或 `disabled`。

### 禁用密钥库

```
DELETE /api/secret-provider-configs/{id}
```

软删除该密钥库：状态改为 `disabled`、清除 `isDefault` 并写入 `disabledAt`。为保留审计记录，已禁用的密钥库仍会出现在 `GET` 结果中，但不会再出现在创建/轮换密钥流程中。

### 设置默认密钥库

```
POST /api/secret-provider-configs/{id}/default
```

将目标密钥库设为其 provider 类型的默认项，并清除之前的默认项。如果目标状态为 `coming_soon` 或 `disabled`，则返回 422。

### 运行健康检查

```
POST /api/secret-provider-configs/{id}/health
```

运行 provider 专属的健康探测，并将结果保存到密钥库。响应结构：

```json
{
  "configId": "<uuid>",
  "provider": "aws_secrets_manager",
  "status": "ready" | "warning" | "error" | "coming_soon" | "disabled",
  "message": "Provider vault is ready to handle managed writes",
  "details": {
    "code": "provider_ready",
    "message": "...",
    "guidance": ["..."]
  },
  "checkedAt": "2026-05-06T14:00:00.000Z"
}
```

健康状态响应始终不会包含 provider 凭据或密钥值。对于 AWS 密钥库，`details.guidance` 可能会包含缺失的非敏感环境变量名称及预期的 AWS SDK 凭据来源；即将推出的密钥库始终返回 `status: "coming_soon"` 和 `code: "runtime_locked"`，不会调用 provider 模块。

### 创建或轮换密钥时选择密钥库

`POST /api/companies/{companyId}/secrets` 和 `POST /api/secrets/{secretId}/rotate` 都接受可选字段 `providerConfigId`，用于将密钥固定到特定密钥库。省略该字段或设为 null 时，操作会使用部署级 provider 配置，即现有安装已使用的路径。board UI 会在提交前预选所选 provider 对应的公司默认密钥库，因此调用方通常应显式传入 `providerConfigId`。即将推出或已禁用的密钥库会被拒绝并返回 422；与密钥 provider 不匹配的密钥库也会同样被拒绝。

```json
POST /api/companies/{companyId}/secrets
{
  "name": "prod-stripe-key",
  "provider": "aws_secrets_manager",
  "providerConfigId": "<vault-uuid>",
  "managedMode": "external_reference",
  "externalRef": "arn:aws:secretsmanager:us-east-1:123456789012:secret:paperclip/prod/stripe"
}
```

### 响应脱敏规则

此接口中的所有路由都遵循相同的脱敏约定：

- 绝不返回密钥值。board UI 不提供“显示密钥值”操作；密钥会在运行时由服务器根据绑定进行解析。
- 绝不接受、存储、返回或记录 provider 凭据值，也不会在错误消息中回显。提交类似凭据的字段时，校验会以不泄露信息的错误拒绝请求。
- activity log 条目记录密钥库 id、provider、displayName、status 和 isDefault 状态变更，绝不记录 `config` payload 或健康状态详情正文。

## 从 AWS Secrets Manager 远程导入

远程导入会将 AWS Secrets Manager 中已有条目关联到 Paperclip，作为 `external_reference` 密钥。导入时仅存储 provider 引用元数据，不会将远程密钥明文复制到 Paperclip。

这些路由仅供 board 使用，并限定在公司范围内。`providerConfigId` 必须指向同一公司的 AWS provider 密钥库，且其状态为 `ready` 或 `warning`。已禁用、即将推出、非 AWS 或属于其他公司的密钥库都会被拒绝。导入的密钥之后会通过所选密钥库解析，因此运行时读取仍需对所选外部密钥具备 `secretsmanager:GetSecretValue` 权限，以及所需的 KMS 解密权限。

### 预览远程导入候选项

```
POST /api/companies/{companyId}/secrets/remote-import/preview
{
  "providerConfigId": "<aws-vault-uuid>",
  "query": "stripe",
  "nextToken": "opaque-provider-token",
  "pageSize": 50
}
```

`query` 是可选项，会传给 AWS Secrets Manager 用于筛选清单。应将其视为非密钥元数据，因为 AWS 可能会在 CloudTrail 中记录列表请求参数。`nextToken` 是不透明的 AWS 游标；调用方必须原样传回，不能自行生成偏移值。`pageSize` 是可选项，UI 中默认为 50，最大为 100。

预览仅使用 AWS `ListSecrets`。不得调用 `GetSecretValue` 或 `BatchGetSecretValue`，不得请求 `SecretString`，也不得要求 KMS 解密。响应包含经过脱敏、供展示和冲突判断使用的元数据：

```json
{
  "providerConfigId": "<aws-vault-uuid>",
  "provider": "aws_secrets_manager",
  "nextToken": null,
  "candidates": [
    {
      "externalRef": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/stripe",
      "remoteName": "prod/stripe",
      "name": "prod/stripe",
      "key": "prod-stripe",
      "providerVersionRef": null,
      "providerMetadata": {
        "createdDate": "2026-05-06T00:00:00.000Z",
        "lastChangedDate": "2026-05-06T00:00:00.000Z",
        "hasDescription": true,
        "hasKmsKey": true,
        "tagCount": 3
      },
      "status": "ready",
      "importable": true,
      "conflicts": []
    }
  ]
}
```

候选项状态：

- `ready`：该行可选中并导入。
- `duplicate`：Paperclip 密钥已通过同一个 provider 密钥库关联相同的规范化 provider 引用。
- `conflict`：该行存在名称/key 冲突，或未通过 provider 防护规则。

冲突类型包括 `exact_reference`、`name`、`key` 和 `provider_guardrail`。Paperclip 自有托管命名空间下的 AWS 引用不能作为外部引用；这类资源应改用 Paperclip 托管密钥流程。

### 导入选定的远程引用

```
POST /api/companies/{companyId}/secrets/remote-import
{
  "providerConfigId": "<aws-vault-uuid>",
  "secrets": [
    {
      "externalRef": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/stripe",
      "name": "Stripe production key",
      "key": "stripe-production-key",
      "description": "Stripe key used by production checkout",
      "providerVersionRef": null,
      "providerMetadata": {
        "createdDate": "2026-05-06T00:00:00.000Z"
      }
    }
  ]
}
```

`secrets` 数组接受 1–100 行。每行都可以覆盖建议的 Paperclip `name`、`key`、可选的 Paperclip `description`、`providerVersionRef` 和经过脱敏的 `providerMetadata`。空白描述会存储为 `null`；AWS provider 描述不会复制到 Paperclip 的描述字段。后端会在提交时重新检查重复引用和名称/key 冲突；预览结果过期也不能绕过这些检查。

导入响应以行为单位返回：

```json
{
  "providerConfigId": "<aws-vault-uuid>",
  "provider": "aws_secrets_manager",
  "importedCount": 1,
  "skippedCount": 1,
  "errorCount": 0,
  "results": [
    {
      "externalRef": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/stripe",
      "name": "Stripe production key",
      "key": "stripe-production-key",
      "status": "imported",
      "reason": null,
      "secretId": "<paperclip-secret-id>",
      "conflicts": []
    }
  ]
}
```

行状态：

- `imported`：Paperclip 创建了一个有效的 `external_reference` 密钥，以及一条仅含元数据的版本记录。
- `skipped`：该行与现有引用完全重复，或存在名称/key 冲突。
- `error`：provider 拒绝该引用，或该行校验失败。

预览/导入的 activity log 仅存储汇总数量、provider id 和密钥库 id。不得存储远程密钥名称、ARN、描述、tag、明文值、provider 凭据或原始 AWS 错误内容。

## 轮换密钥

```
POST /api/secrets/{secretId}/rotate
{
  "value": "sk-ant-new-value..."
}
```

创建密钥的新版本。使用 `"version": "latest"` 的 agent 会在下次 heartbeat 时自动获取新值。如果错误的 `latest` 发布会同时影响许多 agent，请将其固定到特定版本。

## 在 Agent 配置中使用密钥

在 agent adapter 配置中引用密钥，避免直接填写密钥值：

```json
{
  "env": {
    "ANTHROPIC_API_KEY": {
      "type": "secret_ref",
      "secretId": "{secretId}",
      "version": "latest"
    }
  }
}
```

服务器会在运行时解析并解密密钥引用，再将真实值注入 agent 进程环境。Paperclip 的保管保障在注入时结束：agent 进程可以读取、记录或转发该值，因此应将绑定给 agent 的密钥视为已暴露给该 agent。请参阅[密钥部署指南](/deploy/secrets#custody-boundaries)中的保管边界说明。

用户专属环境绑定使用定义 key，而不是具体的 `secretId`。运行时会解析该运行负责用户对应的实际值：

```json
{
  "env": {
    "GITHUB_TOKEN": {
      "type": "user_secret_ref",
      "key": "github_api_token",
      "version": "latest",
      "required": true,
      "allowMissingOverride": false
    }
  }
}
```

`required` 默认为 `true`，`allowMissingOverride` 默认为 `false`。缺少必需的用户密钥值时，必须在分派给 adapter 前以 fail-closed 方式终止。可选值缺失时应省略该环境变量；不得注入空字符串或其他用户的值。Paperclip 记录不含密钥值的访问事件，字段包括 `secretScope`、`responsibleUserId`、`credentialOwnerUserId` 和 `userSecretDefinitionId`。

## 可移植性

公司导出/导入 API 会在 package manifest 中以声明形式表示 agent 和项目的环境变量要求。导出时会省略密钥值、secret ID、provider 引用和加密的 provider 材料。使用以下命令：

```sh
npx paperclipai secrets declarations --company-id {companyId}
```

在迁移 package 前检查导出内容中将包含的声明。
