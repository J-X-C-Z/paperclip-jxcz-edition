import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { uiText } from "@/i18n";
import { Button } from "@/components/ui/button";
import type { TaskChatItem } from "./task-chat-model";

/** Search visible conversation text without fetching or inspecting hidden tool logs. */
export function taskChatSearchRows(items: readonly TaskChatItem[]) {
  const rows: Array<{ anchor: string; text: string }> = [];
  for (const item of items) {
    const anchor = item.kind === "message" ? item.renderKey ?? item.id : item.id;
    if (item.kind === "message" && item.text.trim()) rows.push({ anchor, text: item.text });
    if (item.kind === "turn" && item.finalResponse?.text.trim()) rows.push({ anchor, text: item.finalResponse.text });
  }
  return rows;
}

export function TaskChatSearch({ items, scope }: {
  items: readonly TaskChatItem[];
  scope: RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lastSelection = useRef<string | null>(null);
  const rows = useMemo(() => taskChatSearchRows(items), [items]);
  const normalized = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => normalized ? rows.filter(row => row.text.toLocaleLowerCase().includes(normalized)) : [], [rows, normalized]);
  const currentIndex = matches.length ? Math.min(index, matches.length - 1) : 0;
  const selectedAnchor = open ? matches[currentIndex]?.anchor : undefined;

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!selectedAnchor) { lastSelection.current = null; return; }
    // Opaque IDs are compared directly; never interpolate them into a selector.
    const target = [...scope.current?.querySelectorAll<HTMLElement>("[data-thread-anchor]") ?? []]
      .find(row => row.dataset.threadAnchor === selectedAnchor);
    if (!target) return;
    target.dataset.chatSearchMatch = "true";
    const selection = JSON.stringify([selectedAnchor, normalized]);
    if (lastSelection.current !== selection) {
      target.scrollIntoView?.({ block: "center", behavior: "auto" });
      lastSelection.current = selection;
    }
    // Responsive layouts may replace the row DOM without changing the match.
    // Reattach the outline after renders, while leaving streaming reads still.
    return () => { delete target.dataset.chatSearchMatch; };
  });

  function move(direction: number) {
    if (matches.length) setIndex((currentIndex + direction + matches.length) % matches.length);
  }
  function close() {
    setOpen(false);
    setQuery("");
    setIndex(0);
    trigger.current?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-(--tc-shell-max-w) shrink-0 px-1 md:px-0" data-testid="task-chat-search">
      {!open ? <div className="flex justify-end"><Button ref={trigger} size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" aria-expanded={false} onClick={() => setOpen(true)}><Search className="size-3.5" aria-hidden />{uiText("Find in conversation")}</Button></div> : (
        <form role="search" aria-label={uiText("Find in loaded messages")} className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5" onSubmit={event => { event.preventDefault(); move(1); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
          if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); move(-1); }
        }}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input ref={input} value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} aria-label={uiText("Find in loaded messages")} placeholder={uiText("Find in loaded messages")} className="min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{normalized ? matches.length ? `${currentIndex + 1} / ${matches.length}` : uiText("No matching messages") : uiText("Loaded messages only")}</span>
          <Button type="button" size="icon-xs" variant="ghost" disabled={!matches.length} aria-label={uiText("Previous matching message")} onClick={() => move(-1)}><ChevronUp className="size-4" /></Button>
          <Button type="button" size="icon-xs" variant="ghost" disabled={!matches.length} aria-label={uiText("Next matching message")} onClick={() => move(1)}><ChevronDown className="size-4" /></Button>
          <Button type="button" size="icon-xs" variant="ghost" aria-label={uiText("Close conversation search")} onClick={close}><X className="size-4" /></Button>
        </form>
      )}
    </div>
  );
}
