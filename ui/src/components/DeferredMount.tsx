import { Suspense, useEffect, useState, type ReactNode } from "react";

/** Load on first use, then retain state and close animations across reopenings. */
export function DeferredMount({ active, children, fallback = null }: {
  active: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [opened, setOpened] = useState(active);
  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);
  return active || opened ? <Suspense fallback={fallback}>{children}</Suspense> : null;
}
