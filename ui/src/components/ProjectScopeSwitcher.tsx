import { useOptionalDialogActions } from "../context/DialogContext";
import { uiText } from "@/i18n";
import { Check, ChevronDown, LoaderCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptionalProjectScope } from "@/context/ProjectScopeContext";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useResourceMemberships } from "@/hooks/useResourceMemberships";

export function ProjectScopeSwitcher() {
  const scope = useOptionalProjectScope();
  const { enabled, projectId, projects, loading, error, setProjectId } = scope ?? {
    enabled: false, projectId: null, projects: [], loading: false, error: null, setProjectId: () => undefined,
  };
  const { selectedCompanyId, selectedCompany } = useCompany();
  const memberships = useResourceMemberships(selectedCompanyId);
  const dialogActions = useOptionalDialogActions();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => {
    const activeProjects = projects
      .filter((project) => !project.archivedAt)
      .sort((left, right) => {
        const priority = (project: (typeof projects)[number]) =>
          memberships.data?.projectMemberships[project.id] === "left" ? 2
            : memberships.data?.starredProjectIds?.includes(project.id) ? 0 : 1;
        return priority(left) - priority(right);
      });
    return [
      { id: null as string | null, name: uiText("All Company") },
      ...activeProjects.map((project) => ({ id: project.id, name: project.name ?? project.id })),
    ].filter((option) => option.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [memberships.data, projects, search]);
  if (!enabled) return null;
  const active = projects.find((project) => project.id === projectId);

  return (
    <div className="relative px-3 pb-2">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-left text-sm text-foreground hover:bg-accent"
      >
        <span className="min-w-0 truncate">{active?.name ?? uiText("All Company")}</span>
        {loading ? <LoaderCircle aria-label={uiText("Loading projects")} className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {open ? (
        <div className="absolute left-3 right-3 top-full z-50 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md">
          <label className="flex items-center gap-2 rounded-sm border border-input px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              aria-label={uiText("Search projects")}
              value={search}
              onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, options.length - 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
                if (event.key === "Enter" && options[activeIndex]) { setProjectId(options[activeIndex].id); setOpen(false); }
                if (event.key === "Escape") setOpen(false);
              }}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={uiText("Search projects")}
            />
          </label>
          {loading ? <p role="status" className="px-2 py-3 text-sm text-muted-foreground">{uiText("Loading projects…")}</p> : null}
          {error ? (
            <div className="px-2 py-3 text-sm text-destructive">
              <p>{uiText("Could not load projects.")}</p>
              <button type="button" className="mt-1 underline" onClick={() => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings });
                if (selectedCompanyId) void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId, { includeArchived: true }) });
              }}>{uiText("Retry")}</button>
            </div>
          ) : null}
          {!loading && !error && options.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{uiText("No projects found.")}</p> : null}
          {!loading && !error ? (
            <ul role="listbox" aria-label={uiText("Project scope")} className="mt-1 max-h-60 overflow-auto">
              {options.map((option, index) => (
                <li key={option.id ?? "all"} role="option" aria-selected={projectId === option.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => { setProjectId(option.id); setOpen(false); setSearch(""); }}
                    className={cn("flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-accent", index === activeIndex && "bg-accent")}
                  >
                    <span className="truncate">{option.name}</span>
                    {projectId === option.id ? <Check className="ml-2 h-4 w-4" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
            {dialogActions && <button type="button" className="rounded-sm px-2 py-2 text-left hover:bg-accent" onClick={() => { setOpen(false); dialogActions.openNewProject(); }}>{uiText("New Project")}</button>}
            <a className="rounded-sm px-2 py-2 text-left hover:bg-accent" href={`${selectedCompany?.issuePrefix ? `/${selectedCompany.issuePrefix}` : ""}/projects`}>{uiText("Manage Projects")}</a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
