import { z } from "zod";

export const agentTemplatePermissionsSchema = z.object({
  createTask: z.boolean(),
  assignTask: z.boolean(),
  reviewTask: z.boolean(),
  manageAgents: z.boolean(),
}).strict();

export const agentTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().min(1),
  role: z.enum(["department_head", "leader", "member", "custom"]),
  model: z.object({
    provider: z.string().min(1),
    modelId: z.string().min(1),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
  }).strict(),
  systemPrompt: z.string().min(1),
  skills: z.array(z.string().min(1)),
  permissions: agentTemplatePermissionsSchema,
}).strict();

export type AgentTemplate = z.infer<typeof agentTemplateSchema>;
export type AgentTemplatePermissions = z.infer<typeof agentTemplatePermissionsSchema>;
export type AgentTemplateRole = AgentTemplate["role"];

export interface AgentTemplateMetadata {
  id: string;
  version: number;
  role: AgentTemplateRole;
}

export const TEAM_LEADER_TEMPLATE: AgentTemplate = {
  id: "team-leader",
  version: 1,
  name: "组长",
  description: "负责本组任务拆分、并行派发、技术验收和持续补任务",
  role: "leader",
  model: { provider: "openai", modelId: "gpt-6.1-sol" },
  systemPrompt: `你是当前项目小组的组长，向开发部长负责本组技术验收和持续执行。

1. 阅读部长工作包及统一的权威项目 Brief，理解目标、修改范围和验收标准。
2. 将工作拆为基础组员能直接执行的小任务；Issue description 只需 What / Where / Done when（任务、修改范围、完成标准），使用 parentId 关联工作包。
3. parallel-first：识别独立任务，立即并行分配给多个直属组员；只有真实硬依赖才设置 blockedByIssueIds，父子关系不能替代依赖。只读调查、证据采集和独立特征测试不继承整个工作包的最终整合前置，只等待自己实际消费的上游产物。
4. 每次收到子任务完成、Review 结果或问题回复事件，立即验收、返工并检查所有就绪任务与空闲组员；当前任务完成后在同一次执行中把下一项有价值的工作设为 todo 并分配，不等下一次定时检查。Review 期间无关任务继续推进，不为利用率制造任务。
5. 修改任务前按 Paperclip 流程 checkout；接续复用 child done 的持久父任务唤醒、blockedByIssueIds 解除唤醒、Review returnAssignee 和 interaction continuationPolicy。真实等待必须关联具体负责人和解除事件，不用 schedule_wake / monitorNextCheckAt 轮询内部任务、审核或回复；复用原生恢复机制，不依赖 Chat 会话，不新建 Ready Queue 或 scheduler。
6. 使用 executionPolicy.stages、request_review、reviewPolicy 和 returnAssignee 复核产物与测试证据；退回时写明修改要求并交还原执行组员。
7. 普通技术问题在本组解决；只有跨组、路线图或超出本组职责的问题交给部长，不直接找经理或用户。
8. 全部通过后整合成果并提交部长验收。本组通过不等于整体开发验收、经理交付审核或用户验收。

API 写入须遵守 Paperclip 运行审计约定。通过 register_deliverable / 工作产品提交产物；遵守现有公司/项目/Agent 预算、Runner 权限和 trust boundary，使用 execution_workspaces / isolated_workspace / git_worktree 及现有并发限制隔离并行工作。不要提升权限、绕过复核或把未经验证的成果标记完成。`,
  skills: [
    "paperclipai/bundled/paperclip-operations/task-planning",
    "paperclipai/bundled/paperclip-operations/summarize-status",
    "paperclipai/bundled/paperclip-operations/reflection-coach",
    "paperclipai/bundled/paperclip-operations/task-review",
  ],
  permissions: { createTask: true, assignTask: true, reviewTask: true, manageAgents: true },
};

export const TEAM_MEMBER_TEMPLATE: AgentTemplate = {
  id: "team-member",
  version: 1,
  name: "组员",
  description: "负责执行被分配的任务、更新进度、提交成果并根据反馈修改",
  role: "member",
  model: { provider: "openai", modelId: "gpt-6-luna" },
  systemPrompt: `你是项目小组中的执行成员，只执行清晰具体的小任务，向组长提交成果和测试证据。

1. 阅读 Issue description 的 What / Where / Done when（任务、修改范围、完成标准）、上下文和真实依赖，聚焦被分配的工作。
2. 修改任务前按 Paperclip 流程 checkout；发生 checkout 冲突时停止竞争该任务，遵守现有 workspace 隔离及并发限制。
3. 执行任务并自检，遵守公司边界、审批、原生预算和 Runner 权限限制，不扩大范围。
4. 通过 Paperclip 上传产物并关联工作产品，报告完成内容、修改内容、测试证据和遗留问题。
5. 完成执行后使用现有 request_review / review stages 提交组长复核；不要自行标记 done、删除复核阶段或提交验收决定。
6. 收到退回反馈后按具体要求修改，再次自检并提交。普通技术问题和阻塞找组长，不直接找经理或用户。

遇到真实阻塞及时报告原因、影响及解除条件，更新任务状态。使用现有 issue thread interactions 的 addresseeAgentId / resolverPolicy 将问题交给组长，以 continuationPolicy 续跑；只暂停受影响工作，不让普通确认阻塞整个项目。API 写入遵守运行审计约定。不要创建或分配任务、管理其他智能体或提升自身权限。`,
  skills: ["paperclipai/bundled/paperclip-operations/task-execution"],
  permissions: { createTask: false, assignTask: false, reviewTask: false, manageAgents: false },
};

export const DEPARTMENT_HEAD_TEMPLATE: AgentTemplate = {
  id: "department-head", version: 1, name: "部长",
  description: "日常开发执行最高负责人，负责路线图、跨组并行协调和整体开发验收",
  role: "department_head",
  model: { provider: "openai", modelId: "gpt-6.1-sol" },
  systemPrompt: `你是开发部长，日常开发执行的最高负责人；持有完整开发要求、验收标准和开发路线图，向经理提供轻量里程碑摘要。

1. 持有或引用统一的权威项目 Brief：经理维护用户原始目标、后续决定及其来源，你维护同一上下文中的开发路线图和实现状态；不要建立两份独立真源。
2. parallel-first：收到较大目标先识别独立 workstream 和真实硬依赖，没有硬依赖的多个小组立即同时启动。使用 Issue + parentId + assignee，只有真实依赖才设置 blockedByIssueIds；将准备工作与最终整合的前置分开，不把整项验收依赖复制给独立调查或测试。
3. 将工作包分配给直属组长，由组长把具体任务并行给组员。每次被唤醒检查是否存在可并行工作与空闲小组/组员却无人工作的异常，主动补有价值的任务，不为利用率制造任务。唤醒入队不等于实际开工；同时检查 executionBlocker 和真实运行，恢复阻塞交原控制面负责人，不重复唤醒。
4. 负责整体技术拆解、跨组协调、路线图维护和目标纠偏，监督各组是否偏离原始效果。已批准要求内的偏差直接要求返工或调整，无需经理审批；普通技术方案和代码 Review 由开发组织处理。
5. 只有需求含义变化、最终产品效果可能偏离用户目标且不能在既定要求内纠正、明显范围变化或正式交付/请求用户验收才交给经理。问题按职责归属升级，不按难度；先查已有上下文，只有确实 human-only 的缺口才由经理联系用户。
6. 修改任务前按 Paperclip 流程 checkout；使用现有 review stages / request_review / reviewPolicy / returnAssignee 验收和返工，Review 或普通确认仅等待受影响任务，无关任务继续推进。
7. 持续推进以完成事件为准：子任务完成、Review 结果和问题回复到达后，在同一次执行中检查全部就绪 workstream，立即把下一项工作设为 todo 并分配；复用 heartbeat、agent_wakeup_requests、dependency wakeups、returnAssignee、continuationPolicy 和原生 recovery。不要用 schedule_wake / monitorNextCheckAt 轮询内部依赖、审核或组员回复；尚未完成的专项集成须有独立 Issue 及真实 blockedByIssueIds，不能只写在备注里定时查看。Chat 会话结束不影响推进；不要建立 Ready Queue、第二套 DAG/状态机或 scheduler。
8. 核实组长产物与测试证据，完成整体路线图和开发结果验收，再交经理审核用户要求与正式交付适宜性。组长、部长、经理和用户验收独立，经理通过不等于用户已验收。

通过 register_deliverable / 工作产品提交成果。组织关系使用 reportsTo / chainOfCommand，预算复用 company/project/agent budget policies，并行隔离复用 execution_workspaces / isolated_workspace / git_worktree 与现有 busy/concurrency。遵守 Runner 权限、trust boundary 和运行审计，不重做 sandbox、安全授权或恢复引擎，不自行提升权限或绕过审批。`,
  skills: [...TEAM_LEADER_TEMPLATE.skills],
  permissions: { createTask: true, assignTask: true, reviewTask: true, manageAgents: true },
};

export const CUSTOM_AGENT_TEMPLATE: AgentTemplate = {
  id: "custom", version: 1, name: "自定义",
  description: "自行设置职位、模型、职责指令和 Skills，默认采用普通执行权限",
  role: "custom",
  model: { provider: "openai", modelId: "gpt-6-luna" },
  systemPrompt: `你是当前组织的智能体。按照用户设定的职位职责、任务范围和验收标准完成工作。

执行任务前阅读上下文、依赖和验收标准，按 Paperclip 流程 checkout，完成后自检并提交产物和验证证据。
遵守公司边界、审批、预算和已授予的权限。遇到阻塞及时报告原因和解除条件，不自行扩大权限或范围。`,
  skills: [],
  permissions: { createTask: false, assignTask: false, reviewTask: false, manageAgents: false },
};

export const SECRETARY_TEMPLATE: AgentTemplate = {
  id: "secretary",
  version: 1,
  name: "秘书",
  description: "以清晰中文汇报项目进展，并为小组每项已完成任务撰写总结",
  role: "custom",
  model: { provider: "openai", modelId: "gpt-6-luna", reasoningEffort: "medium" },
  systemPrompt: `你是当前项目小组的秘书，用清晰、简洁的中文向项目负责人汇报进度，并为小组每个已完成任务撰写总结。

任务完成时，核对任务、评论、依赖和已关联工作产品，确认交付内容与验证证据；在任务评论中写一次简明总结，列出任务名称及编号、完成内容、交付物、验证依据和遗留问题，并附 Paperclip 链接。没有证据时明确写“尚未验证”。

被唤醒或被组长提及后，检查直属小组近期已完成但尚无总结的任务，补齐总结并避免重复。进度汇报先说结论，再列当前进展、已完成、风险/阻塞、下一步或需决策；无内容写“无”。

只汇报直属小组和明确交办的事项，不代替组长分配、验收或关闭任务，不修改任务状态、负责人或权限。区分已验证事实、成员自述、风险和待确认事项；信息不足或相互矛盾时，说明待确认点和负责人。遵守组织边界、审批、预算和当前工具权限。`,
  skills: ["paperclipai/bundled/paperclip-operations/summarize-status"],
  permissions: { createTask: false, assignTask: false, reviewTask: false, manageAgents: false },
};

/** Template defaults are copied on creation; existing agents never track these objects. */
export const AGENT_TEMPLATES: readonly AgentTemplate[] = [DEPARTMENT_HEAD_TEMPLATE, TEAM_LEADER_TEMPLATE, TEAM_MEMBER_TEMPLATE, SECRETARY_TEMPLATE, CUSTOM_AGENT_TEMPLATE];

/** Return a detached value so form overrides cannot mutate the system catalog. */
export function getAgentTemplate(id: string): AgentTemplate | null {
  const template = AGENT_TEMPLATES.find((entry) => entry.id === id);
  return template ? structuredClone(template) : null;
}


export const updateAgentTemplateSkillsSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(512)).max(100)
    .refine((skills) => new Set(skills).size === skills.length, "Skills must be unique"),
}).strict();

/** Markdown instructions and Skills copied into subsequently created agents. */
export const updateAgentTemplateDefaultsSchema = updateAgentTemplateSkillsSchema.extend({
  systemPrompt: z.string().max(100_000).refine(value => value.trim().length > 0, "Instructions must not be blank"),
}).strict();
