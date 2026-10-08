import { useState } from "react";
import { useHostNavigation, type PluginDetailTabProps, type PluginPageProps, type PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
import { briefCompanyId, briefSnapshotAt, taskBriefs, type TaskBrief, type Verdict } from "../repository/task-brief.js";
import briefStyles from "./styles.css";

const styleId = "orialis-brief-plugin-styles";
if (typeof document !== "undefined") {
  const style = document.getElementById(styleId) ?? document.createElement("style");
  style.id = styleId;
  style.textContent = briefStyles;
  if (!style.parentNode) document.head.append(style);
}
const verdicts: Record<Verdict, string> = { met: "已达成", partial: "部分达成", unverified: "尚未验收" };
type Filter = "all" | "mine" | "open" | "met";

export function BriefSidebarLink(_props: PluginSidebarProps) {
  const navigation = useHostNavigation();
  return <a {...navigation.linkProps("/brief")} className="orialis-brief__nav-link"><span aria-hidden="true">◷</span><span>简报</span></a>;
}
export function BriefPage({ context }: PluginPageProps) {
  return <BriefExperience companyId={context.companyId} />;
}
export function ProjectBriefTab({ context }: PluginDetailTabProps) {
  const navigation = useHostNavigation();
  return <main className="orialis-brief"><div className="orialis-brief__shell"><h1>项目简报</h1><p>此项目尚未绑定简报。可到公司简报查看已整理的任务与验收情况。</p><a {...navigation.linkProps("/brief")}>查看公司简报</a></div></main>;
}
function BriefExperience({ companyId }: { companyId: string | null }) {
  const navigation = useHostNavigation();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  if (companyId !== briefCompanyId) return <main className="orialis-brief"><div className="orialis-brief__shell"><h1>任务简报</h1><p>此公司尚未发布可展示的任务简报。</p><p className="orialis-brief__muted">秘书需按任务整理原始要求、当前进展、达成证据和需你处理的事项。</p></div></main>;
  const interventions = taskBriefs.filter(task => task.intervention);
  const met = taskBriefs.filter(task => task.verdict === "met").length;
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "全部任务", count: taskBriefs.length },
    { key: "mine", label: "需我处理", count: interventions.length },
    { key: "open", label: "尚未达成", count: taskBriefs.length - met },
    { key: "met", label: "已达成", count: met },
  ];
  const visible = taskBriefs.filter(task => {
    const matches = filter === "all" || (filter === "mine" && task.intervention) || (filter === "open" && task.verdict !== "met") || (filter === "met" && task.verdict === "met");
    return matches && `${task.id} ${task.title} ${task.requirement} ${task.current}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const openTask = (id: string) => {
    setExpanded(current => current.includes(id) ? current : [...current, id]);
    setFilter("all");
    setQuery("");
    requestAnimationFrame(() => document.getElementById(`brief-${id}`)?.scrollIntoView({ behavior: "instant", block: "start" }));
  };
  const toggleTask = (id: string) => setExpanded(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  return <main className="orialis-brief" aria-label="Orialis 任务简报">
    <div className="orialis-brief__shell">
      <header className="orialis-brief__header">
        <div><h1>任务简报</h1><p className="orialis-brief__subtitle">Orialis · 看进展，对要求，处理需要你的事。</p></div>
        <a className="orialis-brief__source-link" {...navigation.linkProps("/issues/ORI-71#document-project-brief")}>查看秘书原文</a>
      </header>
      <div className="orialis-brief__snapshot" role="note"><span>工作记录快照 · {briefSnapshotAt}</span><span>本页为人工核对摘要，尚未自动同步秘书报告；仅覆盖下列 {taskBriefs.length} 项重点任务。</span></div>
      <section className="orialis-brief__priorities" aria-labelledby="brief-needs-you">
        <div className="orialis-brief__section-title"><h2 id="brief-needs-you">需要你处理</h2><span>{interventions.length} 项</span></div>
        <p className="orialis-brief__muted">先准备设备，再按展开的步骤验收。缺少的开发与排查工作仍由代理继续。</p>
        <div className="orialis-brief__actions">
          {interventions.map(task => <article className="orialis-brief__action-item" key={task.id}>
            <div className="orialis-brief__action-copy"><span className="orialis-brief__task-id">{task.id}</span><h3>{task.intervention!.title}</h3><p>{task.intervention!.reason}</p></div>
            <button type="button" className="orialis-brief__button" onClick={() => openTask(task.id)}>查看操作步骤<span className="orialis-brief__sr-only">：{task.title}</span></button>
          </article>)}
          {interventions.length === 0 && <p>当前没有需要你亲自处理的事项。</p>}
        </div>
      </section>
      <section aria-labelledby="brief-task-list">
        <div className="orialis-brief__section-title"><h2 id="brief-task-list">你安排的任务</h2><p className="orialis-brief__muted">{met} 项达成，{taskBriefs.length - met} 项仍有缺口或待验收</p></div>
        <div className="orialis-brief__controls">
          <div className="orialis-brief__filters" role="group" aria-label="筛选任务">{filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}<span>{item.count}</span></button>)}</div>
          <input aria-label="搜索任务" type="search" placeholder="搜索任务或要求" value={query} onChange={event => setQuery(event.currentTarget.value)} />
        </div>
        <div className="orialis-brief__table-head" aria-hidden="true"><span>任务 / 当前阶段</span><span>当初的要求</span><span>目前做到哪了</span><span>是否达成</span></div>
        <div className="orialis-brief__tasks" aria-live="polite">
          {visible.map(task => <TaskRow key={task.id} task={task} expanded={expanded.includes(task.id)} onToggle={() => toggleTask(task.id)} />)}
          {visible.length === 0 && <div className="orialis-brief__empty"><h3>没有符合条件的任务</h3><p>试试其他关键词，或查看全部任务。</p><button className="orialis-brief__button" onClick={() => { setQuery(""); setFilter("all"); }}>清除筛选</button></div>}
        </div>
      </section>
      <footer className="orialis-brief__footer"><strong>达成结论以验收证据为准。</strong> 任务被标为完成、测试通过或安装成功，不会自动变成“用户要求已达成”。展开任务可查看依据、未完成部分与下一步。</footer>
    </div>
  </main>;
}
function TaskRow({ task, expanded, onToggle }: { task: TaskBrief; expanded: boolean; onToggle: () => void }) {
  return <article id={`brief-${task.id}`} className="orialis-brief__task">
    <div className="orialis-brief__task-row">
      <div><span className="orialis-brief__task-id">{task.id} · {task.stage}</span><h3>{task.title}</h3>{task.intervention && <span className="orialis-brief__personal">需要你配合</span>}</div>
      <p><span className="orialis-brief__mobile-label">当初的要求</span>{task.requirement}</p>
      <p><span className="orialis-brief__mobile-label">目前做到哪了</span>{task.current}</p>
      <div className="orialis-brief__verdict-cell"><span className={`orialis-brief__verdict orialis-brief__verdict--${task.verdict}`}>{verdicts[task.verdict]}</span><button type="button" className="orialis-brief__text-button" aria-expanded={expanded} aria-controls={`brief-detail-${task.id}`} onClick={onToggle}>{expanded ? "收起详情" : "查看缺口与依据"}<span className="orialis-brief__sr-only">：{task.title}</span></button></div>
    </div>
    {expanded && <div id={`brief-detail-${task.id}`} className="orialis-brief__detail">
      <div className="orialis-brief__evidence-grid"><section><h4>{task.verdict === "met" ? "验收边界" : "还差什么"}</h4><p>{task.gap}</p></section><section><h4>已有证据</h4><ul>{task.evidence.map(item => <li key={item}>{item}</li>)}</ul></section></div>
      {task.intervention && <section className="orialis-brief__debug"><h4>你可以怎么验收</h4><p><strong>准备：</strong>{task.intervention.setup}</p><ol>{task.intervention.steps.map(step => <li key={step}>{step}</li>)}</ol><p><strong>通过标准：</strong>{task.intervention.pass}</p><p><strong>请回传：</strong>{task.intervention.returnEvidence}</p></section>}
      <p className="orialis-brief__next"><strong>代理下一步：</strong>{task.next}</p>
      <details className="orialis-brief__sources"><summary>查看记录来源</summary><p>Orialis 工作区，相对于项目根目录；摘要核对时间：{briefSnapshotAt}。</p><ul>{task.sources.map(source => <li key={source}>{source}</li>)}</ul></details>
    </div>}
  </article>;
}
