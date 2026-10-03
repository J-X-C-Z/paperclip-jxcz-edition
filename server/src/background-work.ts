/** Keep slow periodic work from queuing another copy of itself on every tick. */
export function createSingleFlightBackgroundWork(input: {
  stopped: () => boolean;
  track: (work: Promise<unknown>) => void;
}) {
  const inFlight = new Set<string>();
  return (key: string, work: () => Promise<unknown>): boolean => {
    if (input.stopped() || inFlight.has(key)) return false;
    inFlight.add(key);
    const pending = Promise.resolve()
      .then(work)
      .finally(() => inFlight.delete(key));
    input.track(pending);
    return true;
  };
}

/** Own periodic promises so shutdown can stop producers and await their writes. */
export function createBackgroundWorkCoordinator(input: {
  onError: (key: string, error: unknown) => void;
}) {
  let stopped = false;
  const inFlight = new Set<Promise<void>>();
  const start = createSingleFlightBackgroundWork({
    stopped: () => stopped,
    track: (work) => {
      let tracked: Promise<void>;
      tracked = work.then(() => undefined, () => undefined)
        .finally(() => inFlight.delete(tracked));
      inFlight.add(tracked);
    },
  });
  return {
    start(key: string, work: () => Promise<unknown>) {
      return start(key, async () => {
        try { return await work(); }
        catch (error) { input.onError(key, error); }
      });
    },
    stop() { stopped = true; },
    async drain() {
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
    },
  };
}

export function resolveBackgroundPoolMax(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.DATABASE_BACKGROUND_POOL_MAX?.trim();
  if (value === undefined || value === "") return 6;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("DATABASE_BACKGROUND_POOL_MAX must be a positive safe integer");
  }
  return Number(value);
}

/** A second transport to the same database, never a replica or another dataset. */
export function resolveBackgroundDatabaseUrl(
  activeUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.DATABASE_BACKGROUND_URL?.trim();
  if (!configured) return activeUrl;
  let primary: URL;
  let background: URL;
  try {
    primary = new URL(activeUrl);
    background = new URL(configured);
  } catch {
    // URL parser errors can include the credential-bearing input string.
    throw new Error("DATABASE_BACKGROUND_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(background.protocol)) {
    throw new Error("DATABASE_BACKGROUND_URL must use postgres or postgresql");
  }
  // Match postgres.js's database-name resolution; an omitted path uses
  // PGDATABASE, then the connection user. Hosts and users can differ when the
  // database is explicit. Preserve the original URL and all its options.
  const databaseName = (url: URL) => url.pathname.slice(1) || env.PGDATABASE
    || decodeURIComponent(url.username) || env.PGUSERNAME || env.PGUSER || "";
  if (databaseName(primary) !== databaseName(background)) {
    throw new Error("DATABASE_BACKGROUND_URL must target the same database name as the primary connection");
  }
  return configured;
}

type WarmConnectionSetting = "DATABASE_POOL_WARM_CONNECTIONS" | "DATABASE_BACKGROUND_POOL_WARM_CONNECTIONS";

export function resolvePoolWarmConnections(
  name: WarmConnectionSetting,
  maxConnections: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const value = env[name]?.trim();
  if (value === undefined || value === "") return 0;
  if (!/^(?:0|[1-9]\d*)$/.test(value)
    || !Number.isSafeInteger(Number(value))
    || Number(value) > maxConnections) {
    throw new Error(`${name} must be an integer between 0 and ${maxConnections}`);
  }
  return Number(value);
}

type WarmupConnection = {
  unsafe: (query: string) => PromiseLike<unknown>;
  release: () => void;
};

type WarmupPool = {
  options: { max: number };
  reserve: () => Promise<WarmupConnection>;
};

/** Open distinct slots before serving requests; never replay application work. */
export async function warmDatabasePool(pool: WarmupPool, count: number): Promise<void> {
  if (!Number.isSafeInteger(count) || count < 0 || count > pool.options.max) {
    throw new Error(`database pool warmup count must be an integer between 0 and ${pool.options.max}`);
  }
  if (count === 0) return;

  // Keep every acquired slot reserved until all acquisitions have settled.
  // Releasing early could let later reserves reuse the same slot; rejecting
  // early could leave a late successful reservation permanently held.
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => Promise.resolve().then(() => pool.reserve())),
  );
  const connections = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  let workFailed = false;
  try {
    const reservationFailure = results.find(result => result.status === "rejected");
    if (reservationFailure?.status === "rejected") throw reservationFailure.reason;
    const probes = await Promise.allSettled(
      connections.map(connection => Promise.resolve().then(() => connection.unsafe("SELECT 1"))),
    );
    const probeFailure = probes.find(result => result.status === "rejected");
    if (probeFailure?.status === "rejected") throw probeFailure.reason;
  } catch (error) {
    workFailed = true;
    throw error;
  } finally {
    // Try every release even if one throws; preserve the original failure.
    const releases = await Promise.allSettled(
      connections.map(connection => Promise.resolve().then(() => connection.release())),
    );
    const releaseFailure = releases.find(result => result.status === "rejected");
    if (!workFailed && releaseFailure?.status === "rejected") throw releaseFailure.reason;
  }
}
