import { useQuery } from "@tanstack/react-query";
import type { Agent, AgentTemplate } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

export function isAvailableTemplateLeader(agent: Agent, companyId: string): boolean {
  const template = agent.metadata?.agentTemplate as { role?: string } | undefined;
  return agent.companyId === companyId && template?.role === "leader" &&
    ["idle", "running", "error"].includes(agent.status);
}

export function availableTemplateManagers(agents: Agent[], companyId: string, role: AgentTemplate["role"]): Agent[] {
  return agents.filter(agent => {
    if (agent.companyId !== companyId || !["idle", "running", "error"].includes(agent.status)) return false;
    const managerRole = (agent.metadata?.agentTemplate as { role?: string } | undefined)?.role;
    if (role === "member") return managerRole === "leader";
    if (role === "department_head") return agent.role === "ceo" || agent.reportsTo === null;
    return true;
  }).sort((a, b) => {
    if (role !== "leader") return 0;
    return Number((b.metadata?.agentTemplate as { role?: string } | undefined)?.role === "department_head") - Number((a.metadata?.agentTemplate as { role?: string } | undefined)?.role === "department_head");
  });
}

export function templatePermissionDefaults(template: AgentTemplate) {
  return {
    canCreateTasks: template.permissions.createTask,
    canAssignTasks: template.permissions.assignTask,
    canReviewTasks: template.permissions.reviewTask,
    canManageAgents: template.permissions.manageAgents,
    canCreateAgents: template.permissions.manageAgents,
    canCreateSkills: template.role === "leader" || template.role === "department_head",
  };
}

export function AgentTemplateSelection({ companyId, onClose, onSelect }: {
  companyId: string;
  onClose: () => void;
  onSelect: (template: AgentTemplate) => void;
}) {
  const templates = useQuery({
    queryKey: ["agent-templates", companyId],
    queryFn: () => agentsApi.templates(companyId),
    retry: false,
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogTitle>选择智能体模板</DialogTitle>
        <DialogDescription>模板提供默认模型、职责、Skills 和权限，创建前后均可修改。</DialogDescription>
        {templates.isPending ? <p role="status" className="text-sm text-muted-foreground">正在加载模板…</p> : null}
        {templates.error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">无法加载模板，请重试。</p><Button variant="outline" onClick={() => void templates.refetch()}>重试</Button></div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {(templates.data ?? []).map((template) => (
            <Button key={template.id} variant="outline" className="h-auto flex-col items-start gap-2 whitespace-normal p-4 text-left" onClick={() => onSelect(template)}>
              <span className="text-base font-semibold">{template.name}</span>
              <span className="font-mono text-xs">{template.model.modelId}</span>
              {template.model.reasoningEffort ? <span className="text-xs text-muted-foreground">思考：{template.model.reasoningEffort === "medium" ? "中度" : template.model.reasoningEffort}</span> : null}
              <span className="text-xs text-muted-foreground">{template.description}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
