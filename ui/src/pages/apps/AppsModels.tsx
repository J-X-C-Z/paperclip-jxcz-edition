import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Save, Trash2, Zap } from "lucide-react";
import { uiText, useTranslation } from "@/i18n";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { adaptersApi, type AdapterInfo } from "@/api/adapters";
import { agentsApi, type AdapterModel } from "@/api/agents";
import { modelSwitchApi, type ModelSwitchProfileEntry } from "@/api/model-switch";
import {
  buildTitleGroups,
  planAgentPatch,
  planProfileApply,
  profileFromGroups,
  type PlannedChange,
  type SwitchableAgent,
} from "./model-switch-plan";
import type { ModelSwitchAssignment, ModelSwitchProfile } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/pages/tools/shared";

/**
 * Models — the one-click model switch surface (连接器 area, next to Browse and
 * Review). Group agents by 头衔, replace a group's harness/model in one click,
 * and save/apply named model-switch profiles ("配置文件"). Applying goes through
 * the regular agent PATCH endpoint, one agent at a time, so every agent-config
 * guard (adapter transitions, AI connection compatibility, config revisions)
 * stays authoritative in the server.
 */
export function AppsModels() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [groupTargets, setGroupTargets] = useState<Record<string, ModelSwitchAssignment>>({});

  useEffect(() => {
    setBreadcrumbs([
      { label: t("ui.connectors"), href: "/apps" },
      { label: uiText("Models") },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, t]);

  const agentsQuery = useQuery({
    queryKey: ["model-switch", "agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const adaptersQuery = useQuery({
    queryKey: ["model-switch", "adapters"],
    queryFn: () => adaptersApi.list(),
  });
  const profilesQuery = useQuery({
    queryKey: ["model-switch", "profiles", selectedCompanyId],
    queryFn: () => modelSwitchApi.profiles(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const agents = (agentsQuery.data ?? []) as unknown as SwitchableAgent[];
  const groups = useMemo(() => buildTitleGroups(agents), [agents]);
  const modelAdapters = useMemo(
    () => (adaptersQuery.data ?? []).filter((a: AdapterInfo) => a.loaded && !a.disabled && a.modelsCount > 0),
    [adaptersQuery.data],
  );

  const runApply = async (label: string, changes: PlannedChange[]) => {
    if (changes.length === 0) {
      pushToast({ title: uiText("Everything already matches this configuration."), tone: "info" });
      return;
    }
    setApplying({ done: 0, total: changes.length });
    let done = 0;
    let failed = 0;
    for (const change of changes) {
      try {
        await agentsApi.update(
          change.agent.id,
          change.patch as unknown as Record<string, unknown>,
          selectedCompanyId ?? undefined,
        );
      } catch {
        failed += 1;
      }
      done += 1;
      setApplying({ done, total: changes.length });
    }
    setApplying(null);
    await queryClient.invalidateQueries({ queryKey: ["model-switch"] });
    if (failed > 0) {
      pushToast({
        title: uiText("{label}: {done} updated, {failed} failed.", { label, done: done - failed, failed }),
        tone: "error",
      });
    } else {
      pushToast({ title: uiText("{label}: {count} agents updated.", { label, count: done }), tone: "success" });
    }
  };

  const applyProfile = (entry: ModelSwitchProfileEntry) => {
    const profile: ModelSwitchProfile = { ...entry.profile, name: entry.name };
    void runApply(entry.name, planProfileApply(agents, profile));
  };

  const applyGroup = (title: string) => {
    const target = groupTargets[title] ?? groups.find((g) => g.title === title)?.current;
    if (!target) return;
    const members = groups.find((g) => g.title === title)?.agents ?? [];
    const changes = members
      .map((agent) => {
        const patch = planAgentPatch(agent, target);
        return patch ? { agent, patch } : null;
      })
      .filter((change): change is PlannedChange => change !== null);
    void runApply(title, changes);
  };

  const saveProfile = async () => {
    const name = saveName.trim();
    if (!name || !selectedCompanyId) return;
    const profile = profileFromGroups(groups, name);
    const { name: _name, ...data } = profile;
    await modelSwitchApi.saveProfile(selectedCompanyId, name, data);
    setSaveOpen(false);
    setSaveName("");
    await queryClient.invalidateQueries({ queryKey: ["model-switch", "profiles"] });
    pushToast({ title: uiText("Profile saved."), tone: "success" });
  };

  const deleteProfile = async (entry: ModelSwitchProfileEntry) => {
    if (!selectedCompanyId) return;
    await modelSwitchApi.deleteProfile(selectedCompanyId, entry.id);
    await queryClient.invalidateQueries({ queryKey: ["model-switch", "profiles"] });
  };

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("ui.selectOrganization")}</div>;
  }
  if (agentsQuery.isLoading) return <LoadingState />;
  if (agentsQuery.isError) return <ErrorState error={agentsQuery.error} />;

  const profileEntries = [
    ...(profilesQuery.data?.builtIns ?? []),
    ...(profilesQuery.data?.saved ?? []),
  ];

  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{uiText("Models")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {uiText("One-click model switching by title, with saved configuration profiles.")}
          </p>
        </div>
        <Button variant="outline" onClick={() => setSaveOpen(true)}>
          <Save className="size-4" />
          {uiText("Save current as profile")}
        </Button>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{uiText("Configuration profiles")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {profileEntries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />
                    <span className="font-medium">{entry.name}</span>
                    {entry.builtIn ? <Badge variant="secondary">{uiText("built-in")}</Badge> : null}
                  </div>
                  {!entry.builtIn ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={uiText("Delete profile")}
                      onClick={() => void deleteProfile(entry)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {uiText("default")}: {entry.profile.default.adapterType} · {entry.profile.default.model}
                  </Badge>
                  {Object.entries(entry.profile.titles).map(([title, assignment]) => (
                    <Badge key={title} variant="outline">
                      {title}: {assignment.model}
                    </Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={applying !== null}
                  onClick={() => applyProfile(entry)}
                >
                  <Zap className="size-4" />
                  {applying
                    ? uiText("Applying {done}/{total}…", applying)
                    : uiText("Apply to all agents")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{uiText("By title")}</h2>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {groups.map((group) => {
              const target = groupTargets[group.title] ?? group.current;
              return (
                <div
                  key={group.title}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1.6fr)_auto] items-center gap-3 p-4"
                >
                  <div>
                    <div className="font-medium">{group.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {uiText("{count} agents", { count: group.agents.length })} ·{" "}
                      {group.current.adapterType} · {group.current.model || uiText("(no model)")}
                    </div>
                  </div>
                  <AdapterModelPicker
                    adapters={modelAdapters}
                    companyId={selectedCompanyId}
                    value={target}
                    onChange={(next) =>
                      setGroupTargets((prev) => ({ ...prev, [group.title]: next }))
                    }
                  />
                  <div className="text-xs text-muted-foreground">
                    {target.adapterType} · {target.model || uiText("(no model)")}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={applying !== null}
                    onClick={() => applyGroup(group.title)}
                  >
                    <Zap className="size-4" />
                    {uiText("Replace this title")}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText("Save current as profile")}</DialogTitle>
            <DialogDescription>
              {uiText("Captures every title's current adapter and model as a reusable configuration file.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="model-profile-name">{uiText("Profile name")}</Label>
            <Input
              id="model-profile-name"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder={uiText("e.g. All Codex · GPT-6")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {uiText("Cancel")}
            </Button>
            <Button onClick={() => void saveProfile()} disabled={!saveName.trim()}>
              {uiText("Save profile")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdapterModelPicker({
  adapters,
  companyId,
  value,
  onChange,
}: {
  adapters: AdapterInfo[];
  companyId: string;
  value: ModelSwitchAssignment;
  onChange: (next: ModelSwitchAssignment) => void;
}) {
  const modelsQuery = useQuery({
    queryKey: ["model-switch", "adapter-models", companyId, value.adapterType],
    queryFn: () => agentsApi.adapterModels(companyId, value.adapterType),
    enabled: Boolean(companyId) && Boolean(value.adapterType),
  });
  const models = (modelsQuery.data ?? []) as AdapterModel[];
  return (
    <div className="flex gap-2">
      <Select
        value={value.adapterType}
        onValueChange={(adapterType) => onChange({ adapterType, model: "" })}
      >
        <SelectTrigger className="w-[10.5rem]">
          <SelectValue placeholder={uiText("Adapter")} />
        </SelectTrigger>
        <SelectContent>
          {adapters.map((adapter) => (
            <SelectItem key={adapter.type} value={adapter.type}>
              {adapter.label || adapter.type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.model}
        onValueChange={(model) => onChange({ ...value, model })}
      >
        <SelectTrigger className="w-[13rem]">
          <SelectValue placeholder={uiText("Model")} />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label || model.id}
            </SelectItem>
          ))}
          {models.length === 0 && value.model ? (
            <SelectItem value={value.model}>{value.model}</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}
