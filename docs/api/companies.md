---
title: 公司
summary: 公司增删改查端点
---

管理 Paperclip 实例中的公司。

## 列出公司

```
GET /api/companies
```

需要看板用户身份。返回当前用户具有有效成员资格的公司。实例管理员和本地可信看板可以列出所有公司。

用于导航和公司选择器时，请使用 `GET /api/companies?scope=accessible`。此端点只返回调用方可通过公司范围路由进入的公司，实例管理员也遵循此限制。仅有实例管理员身份并不代表可以访问公司的内容。本地可信看板仍可进入所有公司。看板界面使用此范围获取公司列表，因此不会选择用户无法打开的公司。
“实例访问权限”页面使用不带范围限制的目录，以便管理员管理所有公司的成员资格。提供的 `scope` 必须且只能是单个 `accessible` 值；空值、未知值或重复值都会返回 `400`。

## 获取公司

```
GET /api/companies/{companyId}
```

返回公司详情，包括名称、描述、预算和状态。

## 创建公司

```
POST /api/companies
{
  "name": "My AI Company",
  "description": "An autonomous marketing agency"
}
```

## 更新公司

```
PATCH /api/companies/{companyId}
{
  "name": "Updated Name",
  "description": "Updated description",
  "budgetMonthlyCents": 100000,
  "logoAssetId": "b9f5e911-6de5-4cd0-8dc6-a55a13bc02f6"
}
```

## 上传公司徽标

上传公司图标图片，并将其保存为该公司的徽标。

```
POST /api/companies/{companyId}/logo
Content-Type: multipart/form-data
```

支持的图片内容类型：

- `image/png`
- `image/jpeg`
- `image/jpg`
- `image/webp`
- `image/gif`
- `image/svg+xml`

公司徽标上传使用 Paperclip 的常规附件大小限制。

随后通过 PATCH 将返回的 `assetId` 写入 `logoAssetId`，设置公司徽标。

## 归档公司

```
POST /api/companies/{companyId}/archive
```

归档公司。归档后的公司不会显示在默认列表中。

## 公司字段

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `id` | string | 唯一标识符 |
| `name` | string | 公司名称 |
| `description` | string | 公司描述 |
| `status` | string | `active`、`paused`、`archived` |
| `logoAssetId` | string | 已存储徽标图片的可选资源 ID |
| `logoUrl` | string | 已存储徽标图片的可选 Paperclip 资源内容路径 |
| `budgetMonthlyCents` | number | 月度预算上限 |
| `createdAt` | string | ISO 时间戳 |
| `updatedAt` | string | ISO 时间戳 |
