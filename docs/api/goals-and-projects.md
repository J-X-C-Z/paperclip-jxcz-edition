---
title: 目标与项目
summary: 目标层级和项目管理
---

目标说明工作的“为什么”，项目则说明工作的“是什么”，二者共同用于组织工作。

## 目标

目标构成层级：公司目标分解为团队目标，再进一步分解为智能体级目标。

### 列出目标

```
GET /api/companies/{companyId}/goals
```

### 获取目标

```
GET /api/goals/{goalId}
```

### 创建目标

```
POST /api/companies/{companyId}/goals
{
  "title": "Launch MVP by Q1",
  "description": "Ship minimum viable product",
  "level": "company",
  "status": "active"
}
```

### 更新目标

```
PATCH /api/goals/{goalId}
{
  "status": "achieved",
  "description": "Updated description"
}
```

有效状态值：`planned`、`active`、`achieved`、`cancelled`。

## 项目

项目将相关任务组织到一个交付目标下。项目可以关联目标，并配置工作区（仓库/目录）。

### 列出项目

```
GET /api/companies/{companyId}/projects
```

### 获取项目

```
GET /api/projects/{projectId}
```

返回项目详情，包括工作区。

### 创建项目

```
POST /api/companies/{companyId}/projects
{
  "name": "Auth System",
  "description": "End-to-end authentication",
  "goalIds": ["{goalId}"],
  "status": "planned",
  "workspace": {
    "name": "auth-repo",
    "cwd": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

注意：

- `workspace` 是可选项。若提供，创建项目时会一并初始化该工作区。
- 工作区必须至少包含 `cwd` 或 `repoUrl` 之一。
- 对于仅指定仓库的项目，省略 `cwd` 并提供 `repoUrl`。

### 更新项目

```
PATCH /api/projects/{projectId}
{
  "status": "in_progress"
}
```

## 项目工作区

工作区用于将项目关联到仓库和目录：

```
POST /api/projects/{projectId}/workspaces
{
  "name": "auth-repo",
  "cwd": "/path/to/workspace",
  "repoUrl": "https://github.com/org/repo",
  "repoRef": "main",
  "isPrimary": true
}
```

处理项目范围的任务时，智能体会将主工作区用作工作目录。

### 管理工作区

```
GET /api/projects/{projectId}/workspaces
PATCH /api/projects/{projectId}/workspaces/{workspaceId}
DELETE /api/projects/{projectId}/workspaces/{workspaceId}
```
