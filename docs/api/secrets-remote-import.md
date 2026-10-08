---
title: 远程导入密钥
summary: 仅导入 AWS Secrets Manager 元数据的 API
---

远程导入允许看板将现有 AWS Secrets Manager 条目关联为 Paperclip `external_reference` 密钥，而无需将明文复制到 Paperclip。

这两个路由都仅供看板使用，并且以公司为范围。所选提供方保险库必须属于该公司、使用 `aws_secrets_manager`，且状态可选（`ready` 或 `warning`）。已禁用、即将推出或属于其他公司的保险库会被拒绝。

远程导入用于盘点资源和管理元数据。预览操作只会调用 AWS `ListSecrets`；导入操作会保存 Paperclip 外部引用以及指纹/版本元数据。这两个路由都不会调用 `GetSecretValue` 或 `BatchGetSecretValue`，不会请求 `SecretString`、要求 KMS 解密、记录原始远程元数据，也不会将密钥明文复制到 Paperclip。

## 预览远程 AWS 密钥

```
POST /api/companies/{companyId}/secrets/remote-import/preview
{
  "providerConfigId": "<aws-vault-uuid>",
  "query": "stripe",
  "nextToken": "optional-provider-page-token",
  "pageSize": 50
}
```

`query` 是可选项，会作为盘点筛选条件发送给 AWS。由于 AWS 可能在 CloudTrail 中记录列表请求参数，请将其视为非敏感元数据。`nextToken` 是不透明的 AWS 游标，应原样传回。`pageSize` 上限为 100。

响应：

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
        "lastChangedDate": "2026-05-06T00:00:00.000Z",
        "hasDescription": true
      },
      "status": "ready",
      "importable": true,
      "conflicts": []
    }
  ]
}
```

候选项的 `status` 值：

- `ready`：没有完全相同的外部引用，也不存在名称/键冲突。
- `duplicate`：已有密钥包含完全相同的提供方 `externalRef`。
- `conflict`：建议的 Paperclip `name` 或 `key` 已被使用。

冲突 `type` 值包括 `exact_reference`、`name`、`key` 和 `provider_guardrail`。Paperclip 自有受管理命名空间中的 AWS 引用不能作为外部引用，以避免某公司通过权限过宽的运行时角色导入其他公司的 Paperclip 管理密钥。

## 导入远程 AWS 密钥引用

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
        "lastChangedDate": "2026-05-06T00:00:00.000Z",
        "hasDescription": true
      }
    }
  ]
}
```

导入响应按行返回。状态为 ready 的行会成为活动的 `external_reference` 密钥，只保存版本元数据。完全相同的引用重复项以及名称/键冲突会被跳过，不会导致整个请求失败。`secrets` 数组接受 1–100 行，后端会在提交时重新检查重复项和冲突。
每行可包含审查时输入的可选 Paperclip `description`；空描述会保存为 `null`。不会将 AWS 提供方的描述复制到此字段。

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

活动日志只记录汇总数量和提供方/保险库 ID，不会记录远程密钥名称、ARN、标签或值。

即使导入成功，日后在受绑定的运行时中解析引用时仍可能失败：Paperclip 运行时角色可能可以列出 AWS 密钥，但缺少该特定密钥所需的 `secretsmanager:GetSecretValue` 权限或 KMS 解密权限。
