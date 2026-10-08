// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../context/ToastContext";
import { uiText } from "@/i18n";
import { Projects } from "./Projects";

const mockProjectsApi = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
}));

const mockResourceMembershipsApi = vi.hoisted(() => ({
  listMine: vi.fn(),
  updateProject: vi.fn(),
}));

const mockOpenNewProject = vi.hoisted(() => vi.fn());
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../context/DialogContext", () => ({
  useDialogActions: () => ({ openNewProject: mockOpenNewProject }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));

vi.mock("../api/projects", () => ({
  projectsApi: mockProjectsApi,
}));

vi.mock("../api/resourceMemberships", () => ({
  resourceMembershipsApi: mockResourceMembershipsApi,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (!globalThis.PointerEvent) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = MouseEvent;
}

async function act(callback: () => void | Promise<void>) {
  let result: void | Promise<void> = undefined;
  flushSync(() => {
    result = callback();
  });
  await result;
}

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: "project-a",
    companyId: "company-1",
    urlKey: "alpha",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Alpha",
    description: null,
    status: "in_progress",
    leadAgentId: null,
    targetDate: null,
    color: "#ef4444",
    icon: null,
    env: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project-a",
      effectiveLocalFolder: "/tmp/project-a",
      origin: "local_folder",
    },
    workspaces: [],
    primaryWorkspace: null,
    managedByPlugin: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("Projects", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let queryClient: QueryClient;
  let projectRows: Project[];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    projectRows = [
      makeProject({
        id: "project-c",
        urlKey: "charlie",
        name: "Charlie",
        updatedAt: new Date("2026-01-10T00:00:00Z"),
      }),
      makeProject({
        id: "project-b",
        urlKey: "bravo",
        name: "Bravo",
        updatedAt: new Date("2026-01-05T00:00:00Z"),
      }),
      makeProject({
        id: "project-a",
        urlKey: "alpha",
        name: "Alpha",
        description: "First project",
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      makeProject({
        id: "project-archived",
        urlKey: "archived",
        name: "Archived project",
        archivedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    ];
    mockProjectsApi.list.mockImplementation(async () => projectRows);
    mockProjectsApi.update.mockImplementation(async (projectId: string, patch: { archivedAt: Date | string | null }) => {
      projectRows = projectRows.map((project) => project.id === projectId ? { ...project, archivedAt: patch.archivedAt ? new Date(patch.archivedAt) : null } : project);
      return projectRows.find((project) => project.id === projectId);
    });
    mockResourceMembershipsApi.listMine.mockResolvedValue({
      projectMemberships: { "project-b": "left" },
      starredProjectIds: ["project-c"],
      agentMemberships: {},
      updatedAt: null,
    });
    mockResourceMembershipsApi.updateProject.mockResolvedValue({
      resourceType: "project",
      resourceId: "project-b",
      state: "joined",
      updatedAt: new Date("2026-01-05T00:00:00Z"),
    });
  });

  afterEach(async () => {
    const currentRoot = root;
    if (currentRoot) {
      await act(async () => {
        currentRoot.unmount();
      });
    }
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function renderProjects() {
    const currentRoot = createRoot(container);
    root = currentRoot;

    await act(async () => {
      currentRoot.render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Projects />
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
  }

  async function openSortMenu() {
    const trigger = container.querySelector<HTMLButtonElement>(`button[title="${uiText("Sort")}"]`);
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
  }

  async function chooseSortField(label: string) {
    const item = Array.from(document.body.querySelectorAll("button"))
      .find((element) => element.textContent?.includes(label));
    expect(item).toBeTruthy();

    await act(async () => {
      item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
  }

  it("groups joined projects above left projects and defaults sorting by name", async () => {
    await renderProjects();

    const content = container.textContent ?? "";
    expect(container.querySelector(`button[title="${uiText("Sort")}"]`)?.textContent).toContain(`${uiText("Sort:")} ${uiText("Name")}`);
    expect(content.indexOf(uiText("My Projects"))).toBeLessThan(content.indexOf("Alpha"));
    expect(content.indexOf("Charlie")).toBeLessThan(content.indexOf("Alpha"));
    expect(content.indexOf("Alpha")).toBeLessThan(content.indexOf(uiText("Other Projects")));
    expect(content.indexOf(uiText("Other Projects"))).toBeLessThan(content.indexOf("Bravo"));
    expect(content).toContain(uiText("In Progress"));
  });

  it("sorts grouped projects by the selected field", async () => {
    await renderProjects();
    await openSortMenu();
    await chooseSortField(uiText("Updated"));

    const content = container.textContent ?? "";
    expect(content.indexOf(uiText("My Projects"))).toBeLessThan(content.indexOf("Charlie"));
    expect(content.indexOf("Charlie")).toBeLessThan(content.indexOf("Alpha"));
    expect(content.indexOf("Alpha")).toBeLessThan(content.indexOf(uiText("Other Projects")));
  });

  it("reserves description line height for projects without descriptions", async () => {
    await renderProjects();

    const bravoLink = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((link) =>
      link.textContent?.includes("Bravo"),
    );
    const hiddenDescriptionLine = bravoLink?.querySelector("p[aria-hidden='true']");

    expect(hiddenDescriptionLine).not.toBeNull();
    expect(hiddenDescriptionLine?.className).toContain("min-h-4");
  });

  it("archives from the project list and restores from the archived view", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderProjects();
    expect(container.textContent).not.toContain("Archived project");

    const archiveButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${uiText("Archive")} Alpha"]`);
    expect(archiveButton).not.toBeNull();
    await act(async () => archiveButton?.click());
    await flushReact();
    expect(mockProjectsApi.update).toHaveBeenCalledWith("project-a", expect.objectContaining({ archivedAt: expect.any(String) }), "company-1");
    expect(container.textContent).not.toContain("Alpha");

    const showArchivedButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(uiText("Show archived projects")));
    await act(async () => showArchivedButton?.click());
    await flushReact();
    expect(container.textContent).toContain("Archived project");
    expect(container.textContent).toContain("Alpha");

    const restoreButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${uiText("Unarchive")} Alpha"]`);
    await act(async () => restoreButton?.click());
    await flushReact();
    expect(mockProjectsApi.update).toHaveBeenLastCalledWith("project-a", { archivedAt: null }, "company-1");
    expect(container.textContent).not.toContain("Alpha");
  });
});
