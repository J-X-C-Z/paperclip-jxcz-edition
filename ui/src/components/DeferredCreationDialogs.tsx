import { lazy } from "react";
import { useDialogState } from "../context/DialogContext";
import { DeferredMount } from "./DeferredMount";

const NewIssueDialog = lazy(() => import("./NewIssueDialog").then(m => ({ default: m.NewIssueDialog })));
const NewProjectDialog = lazy(() => import("./NewProjectDialog").then(m => ({ default: m.NewProjectDialog })));
const NewGoalDialog = lazy(() => import("./NewGoalDialog").then(m => ({ default: m.NewGoalDialog })));
const NewAgentDialog = lazy(() => import("./NewAgentDialog").then(m => ({ default: m.NewAgentDialog })));

export function DeferredCreationDialogs() {
  const state = useDialogState();
  return <>
    <DeferredMount active={state.newIssueOpen}><NewIssueDialog /></DeferredMount>
    <DeferredMount active={state.newProjectOpen}><NewProjectDialog /></DeferredMount>
    <DeferredMount active={state.newGoalOpen}><NewGoalDialog /></DeferredMount>
    <DeferredMount active={state.newAgentOpen}><NewAgentDialog /></DeferredMount>
  </>;
}
