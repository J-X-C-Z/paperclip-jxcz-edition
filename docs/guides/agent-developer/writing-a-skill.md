---
title: 编写技能
summary: SKILL.md 格式和最佳实践
---

## 简体中文

Skill 是 agents 可在 heartbeat 中调用的可复用指令，通常是包含 `SKILL.md` 的目录，支持 `references/` 存放辅助材料。`SKILL.md` 使用 YAML frontmatter，至少包含唯一的 kebab-case `name` 和说明 `description`。Description 会作为路由逻辑：agent 先据此判断是否需要加载正文，因此应写清“做什么、何时使用”，而不是宣传文案。

运行时会先把技能的名称和说明放入上下文；agent 判断相关后才加载完整内容。编写时应：说明适用及不适用情境、步骤具体可执行、提供可靠的 API/命令示例、每项技能聚焦一个问题，并把较长辅助资料放入 `references/`。

Adapter 负责让运行时发现技能：`claude_local` 使用临时目录、symlinks 与 `--add-dir`；`codex_local` 使用全局技能目录。Adapter 实现细节见[创建 Adapter 指南](/adapters/creating-an-adapter)。

---

Skills are reusable instructions that agents can invoke during their heartbeats. They're markdown files that teach agents how to perform specific tasks.

## Skill Structure

A skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```
skills/
└── my-skill/
    ├── SKILL.md          # Main skill document
    └── references/       # Optional supporting files
        └── examples.md
```

## SKILL.md Format

```markdown
---
name: my-skill
description: >
  Short description of what this skill does and when to use it.
  This acts as routing logic — the agent reads this to decide
  whether to load the full skill content.
---

# My Skill

Detailed instructions for the agent...
```

### Frontmatter Fields

- **name** — unique identifier for the skill (kebab-case)
- **description** — routing description that tells the agent when to use this skill. Write it as decision logic, not marketing copy.

## How Skills Work at Runtime

1. Agent sees skill metadata (name + description) in its context
2. Agent decides whether the skill is relevant to its current task
3. If relevant, agent loads the full SKILL.md content
4. Agent follows the instructions in the skill

This keeps the base prompt small — full skill content is only loaded on demand.

## Best Practices

- **Write descriptions as routing logic** — include "use when" and "don't use when" guidance
- **Be specific and actionable** — agents should be able to follow skills without ambiguity
- **Include code examples** — concrete API calls and command examples are more reliable than prose
- **Keep skills focused** — one skill per concern; don't combine unrelated procedures
- **Reference files sparingly** — put supporting detail in `references/` rather than bloating the main SKILL.md

## Skill Injection

Adapters are responsible for making skills discoverable to their agent runtime. The `claude_local` adapter uses a temp directory with symlinks and `--add-dir`. The `codex_local` adapter uses the global skills directory. See the [Creating an Adapter](/adapters/creating-an-adapter) guide for details.
