import { uiText } from "@/i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { readThreadScrollAnchor, threadScrollAnchorDelta, type ThreadScrollAnchor } from "./scroll-anchor";
import { cn } from "@/lib/utils";
import { useStreamlinedTaskChatPresentation } from "./presentation-mode";
import { ArrowDown } from "lucide-react";
import { parseCssTimeMs } from "./motion-tokens";
import { useTaskChatScrollNavigation } from "./scroll-navigation";

const PIN_THRESHOLD_PX = 48;

/** Visibility lifecycle of the scroll-to-latest pill. */
type PillPhase = "hidden" | "in" | "out";

/**
 * True when animations are disabled (prefers-reduced-motion, or environments
 * without matchMedia such as jsdom). In that case the pill's exit animation
 * never fires animationend, so we must unmount immediately.
 */
function motionDisabled(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface TaskMessageScrollerProps {
  children: ReactNode;
  /** Value that changes whenever content that could grow the thread updates. */
  contentKey: unknown;
  className?: string;
}

/**
 * Scroll container that owns the redesign's auto-follow vs. hold-position rule.
 *
 * Explicit rule: while the viewport is pinned to the bottom (within a small
 * threshold) new content auto-follows with INSTANT scroll; the moment the user
 * scrolls up we hold their position and surface a scroll-to-latest pill
 * instead of yanking them down.
 *
 * Re-follow is easing-aware: clicking the pill glides down smoothly, and while
 * that glide is in flight (`easingRef`) the scroll handler must not unpin —
 * the smooth scroll fires intermediate scroll events that would otherwise
 * re-show the pill mid-glide (the known stick-to-bottom failure mode). Arrival
 * within the pin threshold re-pins and hides the pill; a wheel/touch during
 * the glide cancels it and treats the user as unpinned. Content-driven follow
 * while pinned stays instant, so no reflow/jump happens during streaming.
 */
export function TaskMessageScroller({ children, contentKey, className }: TaskMessageScrollerProps) {
  const streamlined = useStreamlinedTaskChatPresentation();
  const navigation = useTaskChatScrollNavigation();
  const initialPositionApplied = useRef(false);
  const appliedNavigation = useRef({ key: navigation.key, hash: navigation.hash });
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<ThreadScrollAnchor | null>(null);
  const anchorScrollTopRef = useRef<number | null>(null);
  const pinnedRef = useRef(true);
  const easingRef = useRef(false);
  const clientHeightRef = useRef<number | null>(null);
  const scrollbarIdleTimerRef = useRef<number | null>(null);
  const scrollbarIdleDelayRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const cancelFrameRef = useRef<(() => void) | null>(null);
  const pendingRememberRef = useRef(false);
  const pendingReconcileRef = useRef(false);
  const [pillPhase, setPillPhase] = useState<PillPhase>("hidden");

  const showScrollbarWhileScrolling = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.scrollActive = "true";
    if (scrollbarIdleTimerRef.current !== null) {
      window.clearTimeout(scrollbarIdleTimerRef.current);
    }
    const idleDelay = scrollbarIdleDelayRef.current ?? parseCssTimeMs(
      getComputedStyle(document.documentElement).getPropertyValue("--motion-scrollbar-idle-delay"),
    );
    scrollbarIdleDelayRef.current = idleDelay;
    scrollbarIdleTimerRef.current = window.setTimeout(() => {
      delete el.dataset.scrollActive;
      scrollbarIdleTimerRef.current = null;
      scrollbarIdleDelayRef.current = null;
    }, idleDelay);
  }, []);

  const showPill = useCallback(() => {
    setPillPhase("in");
  }, []);

  const hidePill = useCallback(() => {
    // Keep rendering through the exit animation; unmount on animationend.
    // Without animations (reduced motion / no matchMedia) unmount immediately.
    setPillPhase((phase) => (phase === "hidden" ? phase : motionDisabled() ? "hidden" : "out"));
  }, []);

  const isPinned = useCallback(() => {
    const el = ref.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight; // instant, never smooth
  }, []);

  const followViewportResize = useCallback(() => {
    const el = ref.current;
    if (!el) return false;
    const previousClientHeight = clientHeightRef.current;
    const nextClientHeight = el.clientHeight;
    clientHeightRef.current = nextClientHeight;
    if (
      previousClientHeight == null ||
      previousClientHeight <= 0 ||
      previousClientHeight === nextClientHeight ||
      !pinnedRef.current
    ) {
      return false;
    }
    scrollToBottom();
    return true;
  }, [scrollToBottom]);

  const rememberAnchor = useCallback((knownRect?: DOMRect) => {
    const el = ref.current;
    if (!el) return;
    const rect = knownRect ?? el.getBoundingClientRect();
    anchorRef.current = readThreadScrollAnchor(el, rect.top, rect.bottom);
    anchorScrollTopRef.current = el.scrollTop;
    if (initialPositionApplied.current) navigation.remember(el.scrollTop, anchorRef.current);
  }, [navigation.key, navigation.hash, navigation.ready]);

  const reconcileContent = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Clicking latest is an explicit follow intent. If content or the composer
    // changes during its glide, finish at the new bottom instead of restoring
    // the old reading anchor and cancelling the browser's smooth scroll.
    if (easingRef.current) {
      easingRef.current = false;
      pinnedRef.current = true;
      hidePill();
    }
    let rect: DOMRect | undefined;
    if (pinnedRef.current) scrollToBottom();
    else {
      rect = el.getBoundingClientRect();
      const delta = threadScrollAnchorDelta(el, anchorRef.current, rect.top);
      if (delta) el.scrollTop += delta;
    }
    rememberAnchor(rect);
  }, [rememberAnchor, scrollToBottom, hidePill]);

  const scheduleFrameWork = useCallback((work: "remember" | "reconcile") => {
    if (work === "reconcile") pendingReconcileRef.current = true;
    else pendingRememberRef.current = true;
    if (frameRef.current !== null) return;

    const run = () => {
      frameRef.current = null;
      cancelFrameRef.current = null;
      const reconcile = pendingReconcileRef.current;
      const remember = pendingRememberRef.current;
      pendingReconcileRef.current = false;
      pendingRememberRef.current = false;
      if (reconcile) {
        if (followViewportResize()) hidePill();
        // Reconciliation also records the resulting anchor, so a scroll event
        // and one or more observer notifications share the same geometry read.
        reconcileContent();
      } else if (remember) {
        rememberAnchor();
      }
    };

    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(run);
      frameRef.current = frame;
      cancelFrameRef.current = () => window.cancelAnimationFrame(frame);
    } else {
      const timer = window.setTimeout(run, 0);
      frameRef.current = timer;
      cancelFrameRef.current = () => window.clearTimeout(timer);
    }
  }, [followViewportResize, hidePill, reconcileContent, rememberAnchor]);

  const handleScroll = useCallback(() => {
    showScrollbarWhileScrolling();
    const el = ref.current;
    if (el) {
      const scrollTop = el.scrollTop;
      const previousScrollTop = anchorScrollTopRef.current;
      if (anchorRef.current && previousScrollTop !== null) {
        // The saved row may no longer be on screen after a large wheel/touch
        // delta, but its coordinate remains valid. Shift it algebraically so
        // an immediate content commit can preserve this reading position
        // without synchronously walking the DOM in every scroll event.
        anchorRef.current = {
          ...anchorRef.current,
          top: anchorRef.current.top + previousScrollTop - scrollTop,
        };
      }
      anchorScrollTopRef.current = scrollTop;
    }
    // A growing composer shrinks this viewport. Some browsers dispatch the
    // resulting scroll event before ResizeObserver, so preserve the previous
    // pinned state here instead of mistaking the layout change for a user
    // scroll away from the bottom.
    if (followViewportResize()) {
      // Keep the composer-resize safeguard synchronous: a scroll event can be
      // delivered before ResizeObserver and must not unpin the reader.
      pendingReconcileRef.current = false;
      hidePill();
      scheduleFrameWork("remember");
      return;
    }
    const pinned = isPinned();
    if (easingRef.current) {
      // Smooth re-follow in flight: intermediate scroll events must not
      // unpin/re-show the pill. Only act once we arrive within the threshold.
      if (pinned) {
        easingRef.current = false;
        pinnedRef.current = true;
        hidePill();
      }
      scheduleFrameWork("remember");
      return;
    }
    pinnedRef.current = pinned;
    if (pinned) hidePill();
    else showPill();
    // Pinned state above changes in the scroll event itself. Only the more
    // expensive anchor traversal waits for the shared animation frame.
    pendingReconcileRef.current = false;
    scheduleFrameWork("remember");
  }, [
    followViewportResize,
    isPinned,
    hidePill,
    showPill,
    scheduleFrameWork,
    showScrollbarWhileScrolling,
  ]);

  const handleJumpToLatest = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (isPinned()) {
      // Already at (or within threshold of) the bottom: no glide needed.
      pinnedRef.current = true;
      hidePill();
      return;
    }
    easingRef.current = true;
    if (typeof el.scrollTo === "function" && !motionDisabled()) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      // Environments without scrollTo (older jsdom): fall back to instant.
      el.scrollTop = el.scrollHeight;
      easingRef.current = false;
      pinnedRef.current = true;
      hidePill();
    }
  }, [isPinned, hidePill]);

  // A user gesture during the smooth glide cancels the re-follow: stop
  // treating scroll events as easing and consider the user unpinned.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancelEasing = () => {
      if (!easingRef.current) return;
      easingRef.current = false;
      pinnedRef.current = false;
      showPill();
    };
    el.addEventListener("wheel", cancelEasing, { passive: true });
    el.addEventListener("touchstart", cancelEasing, { passive: true });
    return () => {
      el.removeEventListener("wheel", cancelEasing);
      el.removeEventListener("touchstart", cancelEasing);
    };
  }, [showPill]);

  useEffect(() => () => {
    if (scrollbarIdleTimerRef.current !== null) {
      window.clearTimeout(scrollbarIdleTimerRef.current);
    }
    cancelFrameRef.current?.();
    frameRef.current = null;
    cancelFrameRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    clientHeightRef.current = el.clientHeight;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      scheduleFrameWork("reconcile");
    });
    observer.observe(el);
    // The viewport itself does not resize when an image or historical row
    // grows. Observe the content box too, before the browser paints it.
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [scheduleFrameWork]);

  // Follow new content only when already pinned; otherwise hold position.
  useLayoutEffect(() => {
    const el = ref.current;
    if (appliedNavigation.current.key !== navigation.key || appliedNavigation.current.hash !== navigation.hash) {
      appliedNavigation.current = { key: navigation.key, hash: navigation.hash };
      initialPositionApplied.current = false;
      // A pending scroll read belongs to the previous navigation entry. The
      // new hash/history position below is authoritative for this entry.
      pendingRememberRef.current = false;
      pendingReconcileRef.current = false;
      cancelFrameRef.current?.();
      frameRef.current = null;
      cancelFrameRef.current = null;
    }
    if (el && navigation.ready && !initialPositionApplied.current) {
      const top = navigation.initialPosition(el, el.getBoundingClientRect().top, el.scrollTop);
      if (top !== null) {
        el.scrollTop = top;
        pinnedRef.current = isPinned();
        rememberAnchor();
      }
      initialPositionApplied.current = true;
    }
    // The adjusted logical anchor lets this synchronous commit preserve
    // scroll position even when a prepend or expansion changed content above
    // the viewport. Reconciliation also captures the new visible anchor, so it
    // subsumes pending scroll and observer work.
    pendingRememberRef.current = false;
    pendingReconcileRef.current = false;
    cancelFrameRef.current?.();
    frameRef.current = null;
    cancelFrameRef.current = null;
    reconcileContent();
  }, [contentKey, reconcileContent, navigation.key, navigation.hash, navigation.ready]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={handleScroll}
        // Keep the viewport tied to the flex-sized wrapper vertically —
        // percentage heights don't reliably resolve against flex-determined
        // block heights, which let the thread overflow the page. In the
        // streamlined shell, extend only the scroll box through the page's
        // right gutter; matching padding preserves the message column while
        // placing the scrollbar against the properties-panel boundary.
        className={cn(
          "task-chat-scroll-viewport scrollbar-while-scrolling absolute inset-y-0 left-0 overflow-y-auto",
          streamlined
            ? "-right-4 overflow-x-hidden pr-4 md:-right-6 md:pr-6"
            : "right-0",
          className,
        )}
        data-testid="task-chat-scroller"
      >
        {children}
      </div>
      {pillPhase !== "hidden" ? (
        <button
          type="button"
          aria-label={uiText("Scroll to latest")}
          onClick={handleJumpToLatest}
          onAnimationEnd={() => {
            if (pillPhase === "out") setPillPhase("hidden");
          }}
          // The tc-scroll-pill-* keyframes carry the translate(-50%) X-centering
          // (fill: both keeps it after the animation) — no -translate-x-1/2 here.
          className={cn(
            "absolute left-1/2 flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-muted",
            streamlined ? "bottom-7" : "bottom-3",
            pillPhase === "out" ? "tc-scroll-pill-out" : "tc-scroll-pill-in",
          )}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
