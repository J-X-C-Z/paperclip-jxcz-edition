import { describe, expect, it, vi } from "vitest";
import {
  createBackgroundWorkCoordinator,
  createSingleFlightBackgroundWork,
  resolveBackgroundDatabaseUrl,
  resolveBackgroundPoolMax,
  resolvePoolWarmConnections,
  warmDatabasePool,
} from "./background-work.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("single-flight background work", () => {
  it("does not invoke a repeated lane and allows independent lanes to run", async () => {
    const tracked: Promise<unknown>[] = [];
    const start = createSingleFlightBackgroundWork({ stopped: () => false, track: p => tracked.push(p) });
    const first = deferred();
    const work = vi.fn(() => first.promise);
    const other = vi.fn(async () => undefined);
    expect(start("first", work)).toBe(true);
    expect(start("first", work)).toBe(false);
    expect(start("other", other)).toBe(true);
    expect(work).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all(tracked);
    expect(start("first", work)).toBe(true);
    await Promise.all(tracked);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("tracks a rejection and releases its lane for the next tick", async () => {
    const tracked: Promise<unknown>[] = [];
    const start = createSingleFlightBackgroundWork({ stopped: () => false, track: p => tracked.push(p) });
    const failure = new Error("connection unavailable");
    start("lane", async () => { throw failure; });
    expect(await Promise.allSettled(tracked)).toEqual([{ status: "rejected", reason: failure }]);
    expect(start("lane", async () => undefined)).toBe(true);
    await Promise.allSettled(tracked);
  });

  it("captures synchronous failures without wedging the lane", async () => {
    const tracked: Promise<unknown>[] = [];
    const start = createSingleFlightBackgroundWork({ stopped: () => false, track: p => tracked.push(p) });
    start("lane", () => { throw new Error("synchronous failure"); });
    expect((await Promise.allSettled(tracked))[0].status).toBe("rejected");
    expect(start("lane", async () => undefined)).toBe(true);
    await Promise.allSettled(tracked);
  });

  it("stops new work while preserving the tracked promise for shutdown drain", async () => {
    const tracked: Promise<unknown>[] = [];
    let stopped = false;
    const start = createSingleFlightBackgroundWork({ stopped: () => stopped, track: p => tracked.push(p) });
    const held = deferred();
    start("lane", () => held.promise);
    stopped = true;
    const later = vi.fn(async () => undefined);
    expect(start("other", later)).toBe(false);
    let drained = false;
    const drain = Promise.allSettled(tracked).then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(later).not.toHaveBeenCalled();
    held.resolve();
    await drain;
    expect(drained).toBe(true);
  });
});

describe("background work coordinator", () => {
  it("prevents overlapping periodic work and drains before shutdown continues", async () => {
    const onError = vi.fn();
    const coordinator = createBackgroundWorkCoordinator({ onError });
    const held = deferred();
    const work = vi.fn(() => held.promise);
    expect(coordinator.start("browser", work)).toBe(true);
    expect(coordinator.start("browser", work)).toBe(false);
    await Promise.resolve();
    coordinator.stop();
    const late = vi.fn(async () => undefined);
    expect(coordinator.start("feedback", late)).toBe(false);
    let drained = false;
    const draining = coordinator.drain().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    held.resolve();
    await draining;
    expect(work).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(["synchronous", "asynchronous"])("reports a %s failure and allows a later tick", async kind => {
    const onError = vi.fn();
    const coordinator = createBackgroundWorkCoordinator({ onError });
    const failure = new Error("sweep failed");
    coordinator.start("spool", () => {
      if (kind === "synchronous") throw failure;
      return Promise.reject(failure);
    });
    await coordinator.drain();
    expect(onError).toHaveBeenCalledExactlyOnceWith("spool", failure);
    const retry = vi.fn(async () => undefined);
    expect(coordinator.start("spool", retry)).toBe(true);
    await coordinator.drain();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("joins a child sweep started by a startup recovery promise", async () => {
    const coordinator = createBackgroundWorkCoordinator({ onError: vi.fn() });
    const child = deferred();
    coordinator.start("recovery", async () => {
      coordinator.start("spool", () => child.promise);
    });
    let drained = false;
    const draining = coordinator.drain().then(() => { drained = true; });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(drained).toBe(false);
    child.resolve();
    await draining;
    expect(drained).toBe(true);
  });
});

describe("background database pool limit", () => {
  it("defaults to six and accepts a positive override", () => {
    expect(resolveBackgroundPoolMax({})).toBe(6);
    expect(resolveBackgroundPoolMax({ DATABASE_BACKGROUND_POOL_MAX: " " })).toBe(6);
    expect(resolveBackgroundPoolMax({ DATABASE_BACKGROUND_POOL_MAX: " 8 " })).toBe(8);
  });

  it.each(["0", "-1", "1.5", "6connections", "9007199254740992"])("rejects invalid override %s", value => {
    expect(() => resolveBackgroundPoolMax({ DATABASE_BACKGROUND_POOL_MAX: value })).toThrow("DATABASE_BACKGROUND_POOL_MAX");
  });
});

describe("pool warmup settings", () => {
  it("defaults to zero and accepts zero, a partial pool, and the full pool", () => {
    expect(resolvePoolWarmConnections("DATABASE_POOL_WARM_CONNECTIONS", 20, {})).toBe(0);
    expect(resolvePoolWarmConnections("DATABASE_POOL_WARM_CONNECTIONS", 20, { DATABASE_POOL_WARM_CONNECTIONS: " " })).toBe(0);
    expect(resolvePoolWarmConnections("DATABASE_POOL_WARM_CONNECTIONS", 20, { DATABASE_POOL_WARM_CONNECTIONS: "0" })).toBe(0);
    expect(resolvePoolWarmConnections("DATABASE_POOL_WARM_CONNECTIONS", 20, { DATABASE_POOL_WARM_CONNECTIONS: " 10 " })).toBe(10);
    expect(resolvePoolWarmConnections("DATABASE_BACKGROUND_POOL_WARM_CONNECTIONS", 6, { DATABASE_BACKGROUND_POOL_WARM_CONNECTIONS: "6" })).toBe(6);
  });

  it.each(["-1", "1.5", "21", "1e1", "01", "NaN", "9007199254740992"])("rejects invalid warmup count %s", value => {
    expect(() => resolvePoolWarmConnections("DATABASE_POOL_WARM_CONNECTIONS", 20, { DATABASE_POOL_WARM_CONNECTIONS: value })).toThrow("DATABASE_POOL_WARM_CONNECTIONS");
  });
});

describe("background database transport", () => {
  const active = "postgres://primary:primary-secret@127.0.0.1:25433/paperclip?sslmode=disable";

  it("keeps the exact primary URL when no nonempty override is configured", () => {
    expect(resolveBackgroundDatabaseUrl(active, {})).toBe(active);
    expect(resolveBackgroundDatabaseUrl(active, { DATABASE_BACKGROUND_URL: "  " })).toBe(active);
  });

  it.each(["postgres", "postgresql"])("accepts a distinct %s transport and preserves all credentials and options", protocol => {
    const alternative = `${protocol}://background:encoded%40password@db-proxy.example:25432/paperclip?sslmode=require&connect_timeout=7&application_name=maintenance`;
    expect(resolveBackgroundDatabaseUrl(active, { DATABASE_BACKGROUND_URL: ` ${alternative} ` })).toBe(alternative);
  });

  it("rejects another database name without exposing either URL", () => {
    let caught: unknown;
    try {
      resolveBackgroundDatabaseUrl(active, { DATABASE_BACKGROUND_URL: "postgres://bg:background-secret@127.0.0.1:25432/another" });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).toContain("same database name");
    expect(String(caught)).not.toContain("primary-secret");
    expect(String(caught)).not.toContain("background-secret");
  });

  it("rejects unsupported protocols", () => {
    expect(() => resolveBackgroundDatabaseUrl(active, { DATABASE_BACKGROUND_URL: "https://db.example/paperclip" })).toThrow("postgres or postgresql");
  });

  it("sanitizes a malformed URL error", () => {
    expect(() => resolveBackgroundDatabaseUrl(active, { DATABASE_BACKGROUND_URL: "invalid-background-secret" })).toThrow("valid PostgreSQL URL");
    try {
      resolveBackgroundDatabaseUrl(active, { DATABASE_BACKGROUND_URL: "invalid-background-secret" });
    } catch (error) {
      expect(String(error)).not.toContain("invalid-background-secret");
    }
  });

  it("uses PGDATABASE for paths omitted from both transport URLs", () => {
    const alternative = "postgres://background:bg-secret@127.0.0.1:25432";
    expect(resolveBackgroundDatabaseUrl("postgres://primary:secret@127.0.0.1:25433", {
      PGDATABASE: "paperclip",
      DATABASE_BACKGROUND_URL: alternative,
    })).toBe(alternative);
  });
});

describe("database pool warmup", () => {
  function connection() {
    return { unsafe: vi.fn(async (_query: string) => []), release: vi.fn() };
  }

  it("does nothing for the default zero count", async () => {
    const reserve = vi.fn(async () => connection());
    await warmDatabasePool({ options: { max: 20 }, reserve }, 0);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("reserves distinct slots and holds all of them until every SELECT 1 settles", async () => {
    const acquireGate = deferred();
    const probeGate = deferred();
    const first = connection();
    const second = connection();
    first.unsafe.mockImplementation(async () => { await probeGate.promise; return []; });
    const reserve = vi.fn()
      .mockImplementationOnce(async () => first)
      .mockImplementationOnce(async () => { await acquireGate.promise; return second; });
    const warming = warmDatabasePool({ options: { max: 2 }, reserve }, 2);
    await vi.waitFor(() => expect(reserve).toHaveBeenCalledTimes(2));
    expect(first.unsafe).not.toHaveBeenCalled();
    expect(first.release).not.toHaveBeenCalled();
    acquireGate.resolve();
    await vi.waitFor(() => expect(second.unsafe).toHaveBeenCalledWith("SELECT 1"));
    expect(first.unsafe).toHaveBeenCalledWith("SELECT 1");
    expect(first.release).not.toHaveBeenCalled();
    expect(second.release).not.toHaveBeenCalled();
    probeGate.resolve();
    await warming;
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  it("waits for a late reservation after another fails, then releases every success", async () => {
    const lateGate = deferred();
    const reserved = connection();
    const late = connection();
    const failure = new Error("reserve failed");
    const reserve = vi.fn()
      .mockImplementationOnce(async () => reserved)
      .mockImplementationOnce(async () => { throw failure; })
      .mockImplementationOnce(async () => { await lateGate.promise; return late; });
    const warming = warmDatabasePool({ options: { max: 3 }, reserve }, 3);
    const result = Promise.allSettled([warming]);
    await vi.waitFor(() => expect(reserve).toHaveBeenCalledTimes(3));
    expect(reserved.release).not.toHaveBeenCalled();
    lateGate.resolve();
    expect(await result).toEqual([{ status: "rejected", reason: failure }]);
    expect(reserved.release).toHaveBeenCalledTimes(1);
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(reserved.unsafe).not.toHaveBeenCalled();
  });

  it("waits for every probe after one fails before releasing slots", async () => {
    const lateGate = deferred();
    const first = connection();
    const late = connection();
    const failure = new Error("probe failed");
    first.unsafe.mockRejectedValueOnce(failure);
    late.unsafe.mockImplementation(async () => { await lateGate.promise; return []; });
    const reserve = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(late);
    const result = Promise.allSettled([warmDatabasePool({ options: { max: 2 }, reserve }, 2)]);
    await vi.waitFor(() => expect(late.unsafe).toHaveBeenCalledTimes(1));
    expect(first.release).not.toHaveBeenCalled();
    expect(late.release).not.toHaveBeenCalled();
    lateGate.resolve();
    expect(await result).toEqual([{ status: "rejected", reason: failure }]);
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  it("releases successful acquisitions even when another reserve throws synchronously", async () => {
    const reserved = connection();
    const failure = new Error("synchronous reserve failure");
    const reserve = vi.fn()
      .mockImplementationOnce(async () => reserved)
      .mockImplementationOnce(() => { throw failure; });
    await expect(warmDatabasePool({ options: { max: 2 }, reserve }, 2)).rejects.toBe(failure);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(reserved.release).toHaveBeenCalledTimes(1);
  });

  it("still releases other slots if one release throws", async () => {
    const first = connection();
    const second = connection();
    const failure = new Error("release failed");
    first.release.mockImplementationOnce(() => { throw failure; });
    const reserve = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await expect(warmDatabasePool({ options: { max: 2 }, reserve }, 2)).rejects.toBe(failure);
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the original probe failure while attempting all releases", async () => {
    const first = connection();
    const second = connection();
    const failure = new Error("probe failed");
    first.unsafe.mockRejectedValueOnce(failure);
    first.release.mockImplementationOnce(() => { throw new Error("release failed"); });
    const reserve = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await expect(warmDatabasePool({ options: { max: 2 }, reserve }, 2)).rejects.toBe(failure);
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 1.5, 3, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid count %s before reserving", async count => {
    const reserve = vi.fn(async () => connection());
    await expect(warmDatabasePool({ options: { max: 2 }, reserve }, count)).rejects.toThrow("warmup count");
    expect(reserve).not.toHaveBeenCalled();
  });
});
