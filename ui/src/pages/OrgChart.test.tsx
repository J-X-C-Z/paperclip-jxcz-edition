// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uiText } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { OrgChart } from "./OrgChart";

const navigateMock = vi.fn();
const orgMock = vi.fn();
const listMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => navigateMock,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../api/agents", () => ({
  agentsApi: {
    org: () => orgMock(),
    list: () => listMock(),
    update: (id: string, data: unknown) => updateMock(id, data),
  },
}));

vi.mock("../components/AgentIconPicker", () => ({
  AgentIcon: () => <span data-testid="agent-icon" />,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const orgTree = [
  {
    id: "agent-1",
    name: "CEO",
    role: "ceo",
    status: "active",
    reports: [
      {
        id: "agent-2",
        name: "Engineer",
        role: "engineer",
        status: "active",
        reports: [],
      },
    ],
  },
];

const agents = [
  {
    id: "agent-1",
    companyId: "company-1",
    name: "CEO",
    role: "ceo",
    title: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    contextMode: "thin",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    lastHeartbeatAt: null,
    icon: "briefcase",
    metadata: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    urlKey: "ceo",
    pauseReason: null,
    pausedAt: null,
    permissions: null,
  },
  {
    id: "agent-2",
    companyId: "company-1",
    name: "Engineer",
    role: "engineer",
    title: null,
    status: "active",
    reportsTo: "agent-1",
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    contextMode: "thin",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    lastHeartbeatAt: null,
    icon: "code",
    metadata: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    urlKey: "engineer",
    pauseReason: null,
    pausedAt: null,
    permissions: null,
  },
];

function createTouchEvent(type: string, touches: Array<{ clientX: number; clientY: number }>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: touches,
  });
  Object.defineProperty(event, "changedTouches", {
    value: touches,
  });
  return event;
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("OrgChart mobile gestures", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;
  let viewportWidth: number;
  let viewportHeight: number;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    viewportWidth = 360;
    viewportHeight = 520;
    orgMock.mockResolvedValue(orgTree);
    listMock.mockResolvedValue(agents);
    updateMock.mockImplementation(async (id: string, data: object) => ({ ...agents[1], id, ...data }));

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "org-chart-viewport" ? viewportWidth : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "org-chart-viewport" ? viewportHeight : 0;
      },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getRect(this: HTMLElement) {
      if (this.getAttribute("data-testid") === "org-chart-viewport") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: viewportWidth,
          bottom: viewportHeight,
          width: viewportWidth,
          height: viewportHeight,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function renderOrgChart() {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OrgChart />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
    return {
      viewport: container.querySelector('[data-testid="org-chart-viewport"]') as HTMLDivElement,
      layer: container.querySelector('[data-testid="org-chart-card-layer"]') as HTMLDivElement,
    };
  }

  function pointerEvent(type: string, point: { x: number; y: number }, pointerType = "mouse") {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: pointerType },
      isPrimary: { value: true },
    });
    return event;
  }

  function card(id: string) {
    return container.querySelector(`[data-org-card="${id}"]`) as HTMLDivElement;
  }

  function center(id: string) {
    const element = card(id);
    const layer = container.querySelector('[data-testid="org-chart-card-layer"]') as HTMLDivElement;
    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(layer.style.transform)!;
    return {
      x: Number(match[1]) + (parseFloat(element.style.left) + 100) * Number(match[3]),
      y: Number(match[2]) + (parseFloat(element.style.top) + 50) * Number(match[3]),
    };
  }

  async function holdCard(id: string) {
    vi.useFakeTimers();
    await act(async () => {
      card(id).dispatchEvent(pointerEvent("pointerdown", center(id)));
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();
  }

  async function renderMovableTeam() {
    orgMock.mockResolvedValue([
      { ...orgTree[0], reports: [{ ...orgTree[0].reports[0], reports: [
        { id: "agent-3", name: "Member", role: "engineer", status: "active", reports: [] },
      ] }] },
      { id: "agent-4", name: "Other leader", role: "manager", status: "active", reports: [] },
    ]);
    listMock.mockResolvedValue([
      ...agents,
      { ...agents[1], id: "agent-3", name: "Member", reportsTo: "agent-2" },
      { ...agents[0], id: "agent-4", name: "Other leader", reportsTo: null },
    ]);
    return renderOrgChart();
  }

  it("moves a leader and its descendants together and persists only the leader's new manager", async () => {
    const { viewport } = await renderMovableTeam();
    const target = center("agent-4");
    await holdCard("agent-2");
    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointermove", target));
    });

    expect(card("agent-2").style.transform).not.toBe("");
    expect(card("agent-3").style.transform).toBe(card("agent-2").style.transform);
    expect(card("agent-1").style.transform).toBe("");
    expect(card("agent-4").style.transform).toBe("");

    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointerup", target));
    });
    await flushReact();

    expect(updateMock).toHaveBeenCalledExactlyOnceWith("agent-2", { reportsTo: "agent-4" });
    expect(orgMock.mock.calls.length).toBeGreaterThan(1);
    expect(listMock.mock.calls.length).toBeGreaterThan(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("rejects a drop onto a descendant to prevent reporting cycles", async () => {
    const { viewport } = await renderMovableTeam();
    const descendant = center("agent-3");
    await holdCard("agent-2");
    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointermove", descendant));
    });
    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointerup", descendant));
    });
    await flushReact();

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("cancels a held drag without saving or navigating", async () => {
    const { viewport } = await renderMovableTeam();
    const target = center("agent-4");
    await holdCard("agent-2");
    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointermove", target));
    });
    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointercancel", target));
      card("agent-2").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(card("agent-2").style.transform).toBe("");
    expect(card("agent-3").style.transform).toBe("");
  });

  it("keeps a short pointer press as ordinary card navigation", async () => {
    const { viewport } = await renderOrgChart();
    const point = center("agent-2");
    await act(async () => {
      card("agent-2").dispatchEvent(pointerEvent("pointerdown", point));
      viewport.dispatchEvent(pointerEvent("pointerup", point));
      card("agent-2").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/agents/engineer");
  });

  it("shows a failed save and restores the unmoved chart", async () => {
    updateMock.mockRejectedValue(new Error("Unable to update manager"));
    const { viewport } = await renderMovableTeam();
    const target = center("agent-4");
    await holdCard("agent-2");
    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointermove", target));
    });
    await act(async () => {
      viewport.dispatchEvent(pointerEvent("pointerup", target));
    });
    await flushReact();

    expect(updateMock).toHaveBeenCalledExactlyOnceWith("agent-2", { reportsTo: "agent-4" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to update manager");
    expect(card("agent-2").style.transform).toBe("");
    expect(card("agent-3").style.transform).toBe("");
  });

  it("pans the chart with one-finger touch drag", async () => {
    const { viewport, layer } = await renderOrgChart();

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      viewport.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 130, clientY: 145 }]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
    });

    expect(layer.style.transform).toBe("translate(50px, 105px) scale(1)");
  });

  it("suppresses card navigation after a touch pan", async () => {
    const { viewport } = await renderOrgChart();
    const card = container.querySelector("[data-org-card]") as HTMLDivElement;

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      viewport.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 130, clientY: 145 }]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
      card.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("allows card navigation after a touch tap without movement", async () => {
    const { viewport } = await renderOrgChart();
    const card = container.querySelector("[data-org-card]") as HTMLDivElement;

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
      card.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(navigateMock).toHaveBeenCalledWith("/agents/ceo");
  });
  it("pinch-zooms toward the touch center", async () => {
    const { viewport, layer } = await renderOrgChart();

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ]));
      viewport.dispatchEvent(createTouchEvent("touchmove", [
        { clientX: 75, clientY: 100 },
        { clientX: 225, clientY: 100 },
      ]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
    });

    expect(layer.style.transform).toBe("translate(-45px, 40px) scale(1.5)");
  });

  it("does not produce a negative zoom while the viewport has no usable height", async () => {
    viewportHeight = 2;
    const { layer } = await renderOrgChart();

    expect(layer.style.transform).toBe("translate(0px, 0px) scale(1)");

    await act(async () => {
      (container.querySelector(`[aria-label="${uiText("Fit chart to screen")}"]`) as HTMLButtonElement).click();
    });

    expect(layer.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("shows both portability buttons on self-hosted instances", async () => {
    await renderOrgChart();

    expect(container.textContent).toContain(uiText("Import organization"));
    expect(container.textContent).toContain(uiText("Export organization"));
  });

  it("hides the Import button but keeps Export on a Cloud-managed instance", async () => {
    queryClient.setQueryData(queryKeys.health, { status: "ok", cloud: { managed: true } });
    await renderOrgChart();

    expect(container.textContent).not.toContain(uiText("Import organization"));
    expect(container.textContent).toContain(uiText("Export organization"));
  });
});
