import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/router";
import { issueUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { GroupAgent, OrganizationTask } from "@/api/improvementTeams";

export function OrganizationTasks({
  tasks,
  agents,
  agentIds,
}: {
  tasks: OrganizationTask[];
  agents: GroupAgent[];
  agentIds: string[];
}) {
  const eligibleIds = new Set(agentIds);
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const visibleTasks: Array<{ task: OrganizationTask; agent: GroupAgent }> = [];
  const seenTaskIds = new Set<string>();

  for (const task of tasks) {
    if (seenTaskIds.has(task.id) || !task.assigneeAgentId || !eligibleIds.has(task.assigneeAgentId)) continue;
    const agent = agentsById.get(task.assigneeAgentId);
    if (!agent) continue;
    seenTaskIds.add(task.id);
    visibleTasks.push({ task, agent });
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">进行中的任务</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" aria-label={`共 ${visibleTasks.length} 项任务`}>
          {visibleTasks.length}
        </span>
      </header>
      {visibleTasks.length ? (
        <ul className="divide-y divide-border">
          {visibleTasks.map(({ task, agent }) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={task.title}>{task.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  执行人：{agent.name} <span aria-hidden="true">·</span> {task.projectName || "未关联项目"}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={issueUrl({ id: task.id, identifier: task.identifier })}>
                  进入会话 <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-sm text-muted-foreground">暂无进行中的任务</p>
      )}
    </section>
  );
}
