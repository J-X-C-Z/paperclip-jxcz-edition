export type ProjectStatus = "active" | "waiting" | "blocked" | "stale" | "completed" | "archived";
export type BriefSourceKind = "workspace-preview" | "synthetic-example";

export interface BriefSource {
  kind: BriefSourceKind;
  label: string;
  note: string;
  records: string[];
}

export interface BriefEntry {
  text: string;
  sourceRef: string;
}

export interface BriefAttentionItem extends BriefEntry {
  id: string;
  severity: "blocked" | "warning" | "info";
  title: string;
}

export interface BriefTimelineEvent extends BriefEntry {
  id: string;
  date: string;
  label: string;
}

export interface Brief {
  schemaVersion: "1.0";
  date: string;
  currentFocus: string;
  completed: BriefEntry[];
  inProgress: BriefEntry[];
  decisions: BriefEntry[];
  issues: BriefEntry[];
  next: BriefEntry[];
  important: string;
  attention: BriefAttentionItem[];
  timeline: BriefTimelineEvent[];
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  status: ProjectStatus;
  summary: string;
  snapshotDate: string;
  source: BriefSource;
  brief: Brief | null;
}

export type PreviewMode = "workspace" | "examples" | "empty" | "loading" | "error";
