import { useEffect, useState } from "react";
import type { PreviewMode, ProjectSnapshot } from "../brief-types.js";
import { previewBriefRepository } from "./brief-repository.js";

export type BriefLoadState =
  | { status: "loading"; projects: ProjectSnapshot[] }
  | { status: "error"; projects: ProjectSnapshot[]; message: string }
  | { status: "ready"; projects: ProjectSnapshot[] };

export function useBriefProjects(mode: PreviewMode) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BriefLoadState>({ status: "loading", projects: [] });

  useEffect(() => {
    let current = true;
    if (mode === "loading") {
      setState({ status: "loading", projects: [] });
      return () => { current = false; };
    }
    setState({ status: "loading", projects: [] });
    previewBriefRepository.listProjects(mode, attempt).then((projects) => {
      if (current) setState({ status: "ready", projects });
    }).catch((error: unknown) => {
      if (!current) return;
      setState({ status: "error", projects: [], message: error instanceof Error ? error.message : "Unable to load Brief data." });
    });
    return () => { current = false; };
  }, [mode, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}
