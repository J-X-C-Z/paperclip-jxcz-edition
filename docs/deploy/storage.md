---
title: 存储
summary: 本地磁盘与兼容 S3 的存储
---

Paperclip 使用可配置的存储提供方保存上传文件（任务附件、图片等）。

## 本地磁盘（默认）

Files are stored at:

```
~/.paperclip/instances/default/data/storage
```

无需配置，适用于本地开发和单机部署。

## 兼容 S3 的存储

生产环境或多节点部署可使用兼容 S3 的对象存储（AWS S3、MinIO、Cloudflare R2 等）。

通过 CLI 配置：

```sh
pnpm paperclipai configure --section storage
```

## 配置

| 提供方 | 适用场景 |
|----------|----------|
| `local_disk` | Local development, single-machine deployments |
| `s3` | Production, multi-node, cloud deployments |

存储配置保存在实例配置文件中：

```
~/.paperclip/instances/default/config.json
```
