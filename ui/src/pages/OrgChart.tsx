import { uiText } from "@/i18n";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompanyLiveEvent } from "../context/LiveUpdatesProvider";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl, issueUrl } from "../lib/utils";
import { usePublishSharedQueryData, useSharedPollingQuery } from "../hooks/useSharedPolling";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Download, Maximize2, Minus, Network, Plus, Upload } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import { useCloudInstance } from "@/hooks/useCloudInstance";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";

// Layout constants
const CARD_W = 200;
const CARD_H = 160;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const FIT_PADDING = 40;
const TOUCH_MOVE_THRESHOLD = 6;

// ── Tree layout types ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

interface Point {
  x: number;
  y: number;
}

interface TouchGesture {
  mode: "pan" | "pinch" | null;
  startPoint: Point;
  startPan: Point;
  startZoom: number;
  startDistance: number;
  startCenter: Point;
  moved: boolean;
}

// ── Layout algorithm ────────────────────────────────────────────────────

/** Compute the width each subtree needs. */
function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

/** Recursively assign x,y positions. */
function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    x: x + (totalW - CARD_W) / 2,
    y,
    children: layoutChildren,
  };
}

/** Layout all root nodes side by side. */
function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  const totalW = roots.reduce((sum, r) => sum + subtreeWidth(r), 0);
  const gaps = (roots.length - 1) * GAP_X;
  let x = PADDING;
  const y = PADDING;

  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, y));
    x += w + GAP_X;
  }

  // Compute bounds and return
  return result;
}

/** Flatten layout tree to list of nodes. */
function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Collect all parent→child edges. */
function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

function clampZoom(value: number): number {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

function fitChartToViewport(
  containerWidth: number,
  containerHeight: number,
  bounds: { width: number; height: number },
): { zoom: number; pan: Point } | null {
  if (containerWidth <= FIT_PADDING || containerHeight <= FIT_PADDING) return null;

  const scaleX = (containerWidth - FIT_PADDING) / bounds.width;
  const scaleY = (containerHeight - FIT_PADDING) / bounds.height;
  const zoom = clampZoom(Math.min(scaleX, scaleY, 1));
  const chartWidth = bounds.width * zoom;
  const chartHeight = bounds.height * zoom;

  return {
    zoom,
    pan: {
      x: (containerWidth - chartWidth) / 2,
      y: (containerHeight - chartHeight) / 2,
    },
  };
}

function touchPoint(touch: React.Touch): Point {
  return { x: touch.clientX, y: touch.clientY };
}

function touchDistance(a: React.Touch, b: React.Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchCenter(a: React.Touch, b: React.Touch, container: HTMLDivElement): Point {
  const rect = container.getBoundingClientRect();
  return {
    x: (a.clientX + b.clientX) / 2 - rect.left,
    y: (a.clientY + b.clientY) / 2 - rect.top,
  };
}

// ── Status dot colors (raw hex for SVG) ─────────────────────────────────

import { getAdapterLabel } from "../adapters/adapter-display-registry";

const statusDotColor: Record<string, string> = {
  running: "var(--status-agent-running)",
  queued: "var(--status-agent-paused)",
  active: "var(--status-agent-idle)",
  paused: "var(--status-agent-paused)",
  pending_approval: "var(--status-agent-paused)",
  idle: "var(--status-agent-idle)",
  error: "var(--status-agent-error)",
  terminated: "var(--status-agent-idle)",
};
const defaultDotColor = "var(--hex-a3a3a3)";

// ── Main component ──────────────────────────────────────────────────────

export interface OrgChartProps {
  /** Pre-filtered tree for embedding the chart in another collection page. */
  orgTree?: OrgNode[];
  /** Agent records paired with a pre-filtered embedded tree. */
  agents?: Agent[];
  /** Hides page-level actions and breadcrumb ownership. */
  embedded?: boolean;
  /** Project group overlays supplied by a trusted host integration. */
  orgGroups?: Array<{ id: string; name: string; agentIds: string[] }>;
}

export function OrgChart({ orgTree: providedOrgTree, agents: providedAgents, embedded = false, orgGroups = [] }: OrgChartProps = {}) {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [moveError, setMoveError] = useState<string | null>(null);
  const moveAgent = useMutation({
    mutationFn: ({ id, reportsTo }: { id: string; reportsTo: string }) => agentsApi.update(id, { reportsTo }),
    onSuccess: async (agent) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org(agent.companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(agent.companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) }),
      ]);
    },
    onError: (error: Error) => setMoveError(`${uiText("Could not update reporting relationship.")} ${error.message}`),
  });
  // Import is floored server-side on cloud-managed instances (403 cloud_managed), so the
  // button is hidden rather than dead-ending. Export stays available. Both
  // buttons also respect the operator-hidden settings registry.
  const isCloud = Boolean(useCloudInstance());
  const { hidden: hiddenSettings } = useHiddenSettings();
  const showImport = !isCloud && !hiddenSettings.has("company.import");
  const showExport = !hiddenSettings.has("company.export");

  const { data: queriedOrgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId && providedOrgTree === undefined,
  });

  const { data: queriedAgents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && providedAgents === undefined,
  });
  const orgTree = providedOrgTree ?? queriedOrgTree;
  const agents = providedAgents ?? queriedAgents;

  const runsQueryKey = [...queryKeys.liveRuns(selectedCompanyId!), "org-chart", { all: true }] as const;
  const sharedRuns = useSharedPollingQuery<LiveRunForIssue[]>({
    companyId: selectedCompanyId,
    resourceKey: "live-runs:org-chart",
    queryKey: runsQueryKey,
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });
  const runsQuery = useQuery({
    queryKey: runsQueryKey,
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!, { all: true }),
    enabled: sharedRuns.enabled,
    refetchInterval: sharedRuns.refetchInterval,
  });
  usePublishSharedQueryData(sharedRuns, runsQuery.data, runsQuery.dataUpdatedAt);
  useCompanyLiveEvent((event) => {
    if (event.companyId !== selectedCompanyId) return;
    if (event.type === "heartbeat.run.status" || event.type === "heartbeat.run.queued") {
      void queryClient.invalidateQueries({ queryKey: runsQueryKey });
    }
  });
  const visibleAgentIds = useMemo(() => new Set(flattenLayout(layoutForest(orgTree ?? [])).map((node) => node.id)), [orgTree]);
  const runsByAgent = new Map<string, LiveRunForIssue[]>();
  for (const run of runsQuery.data ?? []) {
    if (!visibleAgentIds.has(run.agentId) || (run.status !== "running" && run.status !== "queued")) continue;
    const current = runsByAgent.get(run.agentId) ?? [];
    current.push(run);
    runsByAgent.set(run.agentId, current);
  }
  const issueIds = [...new Set([...runsByAgent.values()].flat().flatMap((run) => run.issueId ? [run.issueId] : []))];
  const issueQueries = useQueries({
    queries: issueIds.map((id) => ({
      queryKey: queryKeys.issues.detail(id),
      queryFn: () => issuesApi.get(id),
      staleTime: 30_000,
      retry: false,
    })),
  });
  const issueById = new Map(issueQueries.flatMap((query) => query.data?.companyId === selectedCompanyId ? [[query.data.id, query.data] as const] : []));

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  useEffect(() => {
    if (!embedded) setBreadcrumbs([{ label: uiText("Org Chart") }]);
  }, [embedded, setBreadcrumbs]);

  // Layout computation
  const layout = useMemo(() => layoutForest(orgTree ?? []), [orgTree]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);
  const groupLayouts = useMemo(() => {
    const nodesById = new Map(allNodes.map((node) => [node.id, node]));
    return orgGroups.flatMap((group) => {
      const members = group.agentIds.flatMap((id) => {
        const node = nodesById.get(id);
        return node ? [node] : [];
      });
      if (members.length === 0) return [];
      const left = Math.min(...members.map((node) => node.x));
      const top = Math.min(...members.map((node) => node.y));
      const right = Math.max(...members.map((node) => node.x + CARD_W));
      const bottom = Math.max(...members.map((node) => node.y + CARD_H));
      return [{ ...group, left, top, width: right - left, height: bottom - top }];
    });
  }, [allNodes, orgGroups]);

  // Compute SVG bounds
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Pan & zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const touchGesture = useRef<TouchGesture>({
    mode: null,
    startPoint: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
    startZoom: 1,
    startDistance: 0,
    startCenter: { x: 0, y: 0 },
    moved: false,
  });
  const suppressNextCardClick = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    };
  }, []);

  const holdRef = useRef<{
    id: string; pointerId: number; start: Point; active: boolean;
    timer: ReturnType<typeof setTimeout> | null; companyId: string;
  } | null>(null);
  const [agentDrag, setAgentDrag] = useState<{ id: string; dx: number; dy: number; targetId: string | null } | null>(null);
  const movingIds = useMemo(() => {
    const ids = new Set<string>();
    if (!agentDrag) return ids;
    // Use the full agent list so filtering cannot permit a cycle through a hidden report.
    ids.add(agentDrag.id);
    let added = true;
    while (added) {
      added = false;
      for (const agent of agents ?? []) {
        if (agent.reportsTo && ids.has(agent.reportsTo) && !ids.has(agent.id)) {
          ids.add(agent.id);
          added = true;
        }
      }
    }
    const node = allNodes.find((item) => item.id === agentDrag.id);
    if (node) flattenLayout([node]).forEach((item) => ids.add(item.id));
    return ids;
  }, [agentDrag?.id, agents, allNodes]);

  function cancelAgentDrag() {
    if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
    holdRef.current = null;
    setAgentDrag(null);
  }
  useEffect(() => {
    cancelAgentDrag();
    setMoveError(null);
    return () => { if (holdRef.current?.timer) clearTimeout(holdRef.current.timer); };
  }, [selectedCompanyId]);

  function suppressCardClick() {
    suppressNextCardClick.current = true;
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressNextCardClick.current = false;
      suppressClickTimerRef.current = null;
    }, 400);
  }

  function startAgentHold(e: React.PointerEvent, id: string) {
    if (holdRef.current || moveAgent.isPending || !selectedCompanyId || e.button !== 0) return;
    const hold = { id, pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, active: false,
      timer: null as ReturnType<typeof setTimeout> | null, companyId: selectedCompanyId };
    holdRef.current = hold;
    // Capture immediately so releasing outside the viewport also clears a pending hold.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    hold.timer = setTimeout(() => {
      if (holdRef.current !== hold) return;
      hold.active = true;
      touchGesture.current.mode = null;
      setDragging(false);
      setMoveError(null);
      suppressNextCardClick.current = true;
      setAgentDrag({ id, dx: 0, dy: 0, targetId: null });
    }, 450);
  }

  function moveAgentPointer(e: React.PointerEvent) {
    const hold = holdRef.current;
    if (!hold || hold.pointerId !== e.pointerId) return;
    const dx = e.clientX - hold.start.x;
    const dy = e.clientY - hold.start.y;
    if (!hold.active) {
      if (Math.hypot(dx, dy) > TOUCH_MOVE_THRESHOLD) { cancelAgentDrag(); suppressCardClick(); }
      return;
    }
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    const target = allNodes.find((node) => !movingIds.has(node.id)
      && node.id !== agentMap.get(hold.id)?.reportsTo
      && x >= node.x && x <= node.x + CARD_W && y >= node.y && y <= node.y + CARD_H);
    setAgentDrag({ id: hold.id, dx: dx / zoom, dy: dy / zoom, targetId: target?.id ?? null });
  }

  function finishAgentPointer(e: React.PointerEvent, cancelled = false) {
    const hold = holdRef.current;
    if (!hold || hold.pointerId !== e.pointerId) return;
    const targetId = agentDrag?.targetId;
    if (hold.active) suppressCardClick();
    cancelAgentDrag();
    if (!cancelled && hold.active && targetId && hold.companyId === selectedCompanyId) {
      moveAgent.mutate({ id: hold.id, reportsTo: targetId });
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && holdRef.current) { suppressCardClick(); cancelAgentDrag(); }
    }
    function onBlur() { if (holdRef.current) { suppressCardClick(); cancelAgentDrag(); } }
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", onBlur); };
  }, []);

  // Center the chart on first load
  const hasInitialized = useRef(false);
  useEffect(() => {
    hasInitialized.current = false;
  }, [orgTree]);

  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    const container = containerRef.current;
    const fitted = fitChartToViewport(container.clientWidth, container.clientHeight, bounds);
    if (!fitted) return;

    hasInitialized.current = true;
    setZoom(fitted.zoom);
    setPan(fitted.pan);
  }, [allNodes, bounds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't drag if clicking a card
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (holdRef.current?.active) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = clampZoom(zoom * factor);

    // Zoom toward mouse position
    const scale = newZoom / zoom;
    setPan({
      x: mouseX - scale * (mouseX - pan.x),
      y: mouseY - scale * (mouseY - pan.y),
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  const zoomTowardPoint = useCallback((newZoom: number, point: Point) => {
    const clampedZoom = clampZoom(newZoom);
    const scale = clampedZoom / zoom;
    setPan({
      x: point.x - scale * (point.x - pan.x),
      y: point.y - scale * (point.y - pan.y),
    });
    setZoom(clampedZoom);
  }, [zoom, pan]);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const fitted = fitChartToViewport(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
      bounds,
    );
    if (!fitted) return;

    setZoom(fitted.zoom);
    setPan(fitted.pan);
  }, [bounds]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2) cancelAgentDrag();
    if (holdRef.current?.active) return;
    if (e.touches.length >= 2 && containerRef.current) {
      const [first, second] = [e.touches[0]!, e.touches[1]!];
      touchGesture.current = {
        mode: "pinch",
        startPoint: { x: 0, y: 0 },
        startPan: pan,
        startZoom: zoom,
        startDistance: touchDistance(first, second),
        startCenter: touchCenter(first, second, containerRef.current),
        moved: false,
      };
      return;
    }

    const touch = e.touches[0];
    if (!touch) return;
    touchGesture.current = {
      mode: "pan",
      startPoint: touchPoint(touch),
      startPan: pan,
      startZoom: zoom,
      startDistance: 0,
      startCenter: { x: 0, y: 0 },
      moved: false,
    };
  }, [pan, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (holdRef.current?.active) return;
    const container = containerRef.current;
    if (!container || !touchGesture.current.mode) return;

    if (e.touches.length >= 2) {
      const [first, second] = [e.touches[0]!, e.touches[1]!];
      const distance = touchDistance(first, second);
      const center = touchCenter(first, second, container);

      if (touchGesture.current.mode !== "pinch" || touchGesture.current.startDistance === 0) {
        touchGesture.current = {
          mode: "pinch",
          startPoint: { x: 0, y: 0 },
          startPan: pan,
          startZoom: zoom,
          startDistance: distance,
          startCenter: center,
          moved: false,
        };
        return;
      }

      const gesture = touchGesture.current;
      const nextZoom = clampZoom(gesture.startZoom * (distance / gesture.startDistance));
      const scale = nextZoom / gesture.startZoom;
      const dx = center.x - gesture.startCenter.x;
      const dy = center.y - gesture.startCenter.y;
      gesture.moved =
        gesture.moved ||
        Math.abs(distance - gesture.startDistance) > TOUCH_MOVE_THRESHOLD ||
        Math.hypot(dx, dy) > TOUCH_MOVE_THRESHOLD;
      setZoom(nextZoom);
      setPan({
        x: center.x - scale * (gesture.startCenter.x - gesture.startPan.x),
        y: center.y - scale * (gesture.startCenter.y - gesture.startPan.y),
      });
      return;
    }

    const touch = e.touches[0];
    if (!touch || touchGesture.current.mode !== "pan") return;
    const dx = touch.clientX - touchGesture.current.startPoint.x;
    const dy = touch.clientY - touchGesture.current.startPoint.y;
    touchGesture.current.moved = touchGesture.current.moved || Math.hypot(dx, dy) > TOUCH_MOVE_THRESHOLD;
    setPan({
      x: touchGesture.current.startPan.x + dx,
      y: touchGesture.current.startPan.y + dy,
    });
  }, [pan, zoom]);

  const handleTouchEnd = useCallback(() => {
    if (touchGesture.current.moved) {
      suppressNextCardClick.current = true;
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressNextCardClick.current = false;
        suppressClickTimerRef.current = null;
      }, 400);
    }
    touchGesture.current = {
      mode: null,
      startPoint: { x: 0, y: 0 },
      startPan: pan,
      startZoom: zoom,
      startDistance: 0,
      startCenter: { x: 0, y: 0 },
      moved: false,
    };
  }, [pan, zoom]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select an organization to view the org chart." />;
  }

  if (providedOrgTree === undefined && isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (orgTree && orgTree.length === 0) {
    return <EmptyState icon={Network} message="No organizational hierarchy defined." />;
  }

  return (
    <div
      className={embedded
        ? "flex min-h-(--sz-420px) flex-1 flex-col md:min-h-0"
        : "flex h-(--sz-calc-38) min-h-(--sz-420px) flex-col md:h-full md:min-h-0"}
    >
      {!embedded && (showImport || showExport) ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-start gap-2">
        {showImport ? (
          <Link to="/company/import">
            <Button variant="outline" size="sm">
              <Upload className="mr-1.5 h-3.5 w-3.5" />{uiText("Import organization")}</Button>
          </Link>
        ) : null}
        {showExport ? (
          <Link to="/company/export">
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" />{uiText("Export organization")}</Button>
          </Link>
        ) : null}
        </div>
      ) : null}
      <p role={moveError ? "alert" : "status"} className={moveError ? "mb-2 text-sm text-destructive" : "mb-2 text-xs text-muted-foreground"}>
        {moveError ?? (moveAgent.isPending ? uiText("Saving reporting relationship…")
          : agentDrag ? uiText("Release on the highlighted agent to set its manager. Escape cancels.")
          : uiText("Long press an agent, then drag it onto its new manager. Its team moves with it."))}
      </p>
      <div
        ref={containerRef}
        data-testid="org-chart-viewport"
        className="w-full flex-1 min-h-0 overflow-hidden relative bg-muted/20 border border-border rounded-lg"
        style={{
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          overscrollBehavior: "contain",
        }}
        onPointerMove={moveAgentPointer}
        onPointerUp={(e) => finishAgentPointer(e)}
        onPointerCancel={(e) => finishAgentPointer(e, true)}
        onLostPointerCapture={(e) => finishAgentPointer(e, true)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <button
            className="flex size-9 items-center justify-center rounded border border-border bg-background text-sm transition-colors hover:bg-accent sm:size-7"
            onClick={() => {
              const container = containerRef.current;
              if (container) {
                zoomTowardPoint(zoom * 1.2, {
                  x: container.clientWidth / 2,
                  y: container.clientHeight / 2,
                });
              }
            }}
            title={uiText("Zoom in")}
            aria-label={uiText("Zoom in")}
          >
            <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
          <button
            className="flex size-9 items-center justify-center rounded border border-border bg-background text-sm transition-colors hover:bg-accent sm:size-7"
            onClick={() => {
              const container = containerRef.current;
              if (container) {
                zoomTowardPoint(zoom * 0.8, {
                  x: container.clientWidth / 2,
                  y: container.clientHeight / 2,
                });
              }
            }}
            title={uiText("Zoom out")}
            aria-label={uiText("Zoom out")}
          >
            <Minus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
          <button
            className="flex size-9 items-center justify-center rounded border border-border bg-background text-(length:--text-nano) transition-colors hover:bg-accent sm:size-7"
            onClick={fitToScreen}
            title={uiText("Fit to screen")}
            aria-label={uiText("Fit chart to screen")}
          >
            <Maximize2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>

        {/* SVG layer for edges */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{
            width: "100%",
            height: "100%",
          }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map(({ parent, child }) => {
              if (agentDrag && child.id === agentDrag.id) return null;
              const x1 = parent.x + CARD_W / 2 + (movingIds.has(parent.id) ? agentDrag!.dx : 0);
              const y1 = parent.y + CARD_H + (movingIds.has(parent.id) ? agentDrag!.dy : 0);
              const x2 = child.x + CARD_W / 2 + (movingIds.has(child.id) ? agentDrag!.dx : 0);
              const y2 = child.y + (movingIds.has(child.id) ? agentDrag!.dy : 0);
              const midY = (y1 + y2) / 2;

              return (
                <path
                  key={`${parent.id}-${child.id}`}
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        </svg>

        {/* Card layer */}
        <div
          data-testid="org-chart-card-layer"
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {groupLayouts.map((group) => (
            <div
              key={group.id}
              data-testid={`org-group-overlay-${group.id}`}
              aria-label={`${group.name} group`}
              className="pointer-events-none absolute rounded-md border border-dashed border-primary/60 bg-primary/5"
              style={{
                left: `calc(${group.left}px - var(--sz-8px))`,
                top: `calc(${group.top}px - var(--sz-8px))`,
                width: `calc(${group.width}px + var(--sz-8px) * 2)`,
                height: `calc(${group.height}px + var(--sz-8px) * 2)`,
              }}
            >
              <span className="absolute top-0 left-2 max-w-(--sz-240px) truncate rounded bg-background px-1.5 text-(length:--text-nano) font-medium text-primary">
                {group.name}
              </span>
            </div>
          ))}
          {allNodes.map((node) => {
            const agent = agentMap.get(node.id);
            const agentRuns = runsByAgent.get(node.id) ?? [];
            const running = agentRuns.some((run) => run.status === "running");
            const status = running ? "running" : agentRuns.length ? "queued" : (agent?.status ?? node.status);
            const statusLabel = runsQuery.isError ? uiText("Work status unavailable")
              : !runsQuery.data ? uiText("Loading work status…")
              : status === "running" ? uiText("Working")
              : status === "queued" ? uiText("Queued")
              : status === "paused" ? uiText("Paused")
              : status === "error" ? uiText("Error")
              : status === "terminated" ? uiText("Terminated")
              : status === "pending_approval" ? uiText("Pending approval") : uiText("Idle");
            const dotColor = runsQuery.isError || !runsQuery.data ? defaultDotColor : statusDotColor[status] ?? defaultDotColor;
            const taskIds = [...new Set(agentRuns.flatMap((run) => run.issueId ? [run.issueId] : []))];

            return (
              <Card
                key={node.id}
                data-org-card={node.id}
                onPointerDown={(e) => startAgentHold(e, node.id)}
                onContextMenu={(e) => e.preventDefault()}
                className={`block absolute py-0 hover:shadow-md hover:border-foreground/20 transition-(--tp-box-shadow-border-color) duration-150 select-none ${movingIds.has(node.id) ? "cursor-grabbing shadow-md" : "cursor-pointer"} ${agentDrag?.targetId === node.id ? "ring-2 ring-primary border-primary" : ""}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: CARD_W,
                  minHeight: CARD_H,
                  transform: movingIds.has(node.id) ? `translate(${agentDrag!.dx}px, ${agentDrag!.dy}px)` : undefined,
                  zIndex: movingIds.has(node.id) ? 1 : undefined,
                }}
                onClick={() => navigate(agent ? agentUrl(agent) : `/agents/${node.id}`)}
                onClickCapture={(e) => {
                  if (!suppressNextCardClick.current) return;
                  suppressNextCardClick.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <div className="flex items-center px-4 py-3 gap-3">
                  {/* Agent icon + status dot */}
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                      <AgentAvatar agent={agent} size={16} className="h-4.5 w-4.5 text-foreground/70"/>
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>
                  {/* Name + role + adapter type */}
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-sm font-semibold text-foreground leading-tight">
                      {node.name}
                    </span>
                    <span className="text-(length:--text-micro) text-muted-foreground leading-tight mt-0.5">
                      {agent?.title ?? roleLabel(node.role)}
                    </span>
                    {agent && (
                      <span className="text-(length:--text-nano) text-muted-foreground/60 font-mono leading-tight mt-1">
                        {getAdapterLabel(agent.adapterType)}
                      </span>
                    )}
                    {agent && agent.capabilities && (
                      <span className="text-(length:--text-nano) text-muted-foreground/80 leading-tight mt-1 line-clamp-2">
                        {agent.capabilities}
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-3 flex flex-col gap-1" data-testid={`org-work-${node.id}`}>
                  <span className="text-xs font-medium" style={{ color: dotColor }}>{statusLabel}</span>
                  {taskIds.length ? (
                    <div className="flex flex-wrap gap-1">
                      {taskIds.map((id) => {
                        const issue = issueById.get(id);
                        const query = issueQueries[issueIds.indexOf(id)];
                        return (
                          <Link key={id} to={issue ? issueUrl(issue) : `/issues/${id}`}
                            className="text-xs font-mono text-primary hover:underline"
                            title={issue?.title ?? uiText("Current task")}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}>
                            {issue?.identifier ?? (query?.isError ? uiText("Task code unavailable") : uiText("Loading task code…"))}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {runsQuery.isError || !runsQuery.data ? uiText("Current task unknown") : status === "running" || status === "queued" ? uiText("No linked task") : uiText("No current task")}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const roleLabels: Record<string, string> = AGENT_ROLE_LABELS;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}
