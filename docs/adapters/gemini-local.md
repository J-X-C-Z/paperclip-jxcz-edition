---
title: Gemini CLI
summary: Gemini CLI 本地适配器的设置和配置
---

`gemini_local` 适配器在本机运行 Google Gemini CLI，支持通过 `--resume` 持久化会话、注入技能以及解析结构化 `stream-json` 输出。

## 前置条件

- 已安装 Gemini CLI（可使用 `gemini` 命令）
- 已设置 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`，或已配置本地 Gemini CLI 身份验证

## 配置字段

| 字段 | 类型 | 必填 | 说明 |
|-------|------|----------|-------------|
| `cwd` | string | 是 | 智能体进程的工作目录（绝对路径；有权限时会自动创建） |
| `model` | string | 否 | 使用的 Gemini 模型，默认为 `auto`。 |
| `promptTemplate` | string | 否 | 所有运行使用的提示词模板 |
| `instructionsFilePath` | string | 否 | 添加到提示词前面的 Markdown 指令文件 |
| `env` | object | 否 | 环境变量（支持密钥引用） |
| `timeoutSec` | number | 否 | 进程超时时间（0 表示不设超时） |
| `graceSec` | number | 否 | 强制终止前的宽限时间 |
| `yolo` | boolean | 否 | 无人值守运行时传入 `--approval-mode yolo` |

## 会话持久化

适配器会在心跳之间保存 Gemini 会话 ID。下次唤醒时，会通过 `--resume` 恢复现有对话，让智能体保留上下文。

会话恢复会检查 cwd：如果工作目录与上次运行不同，就会启动新会话。

如果恢复时因会话未知而失败，适配器会自动使用新会话重试。

## 注入技能

适配器会将 Paperclip 技能符号链接到 Gemini 全局技能目录（`~/.gemini/skills`）。不会覆盖现有用户技能。

## 环境测试

使用 UI 中的“测试环境”按钮验证适配器配置。检查内容包括：

- 已安装且可以访问 Gemini CLI
- 工作目录为可用的绝对路径（如缺失且有权限则自动创建）
- API 密钥/身份验证提示（`GEMINI_API_KEY` 或 `GOOGLE_API_KEY`）
- 实时问候探测（`gemini --output-format json "Respond with hello."`），用于验证 CLI 是否就绪
