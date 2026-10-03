import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import type { PluginJobStore } from "../services/plugin-job-store.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import { createPluginJobScheduler } from "../services/plugin-job-scheduler.js";

function fixture(rows: Promise<unknown[]> | unknown[] = []) {
  const where = vi.fn(() => rows);
  const db = { select: () => ({ from: () => ({ where }) }) } as unknown as Db;
  const jobStore = {
    getJobById: vi.fn(async () => ({ id: "job", pluginId: "plugin", jobKey: "refresh", status: "active" })),
    createRun: vi.fn(async () => ({ id: "run" })),
    markRunning: vi.fn(async () => undefined),
    completeRun: vi.fn(async () => undefined),
  };
  const workerManager = { isRunning: () => true, call: vi.fn(async () => undefined) };
  const scheduler = createPluginJobScheduler({
    db,
    jobStore: jobStore as unknown as PluginJobStore,
    workerManager: workerManager as unknown as PluginWorkerManager,
  });
  return { scheduler, where, jobStore, workerManager };
}

describe("plugin scheduler connection drain", () => {
  it("awaits a pending tick before the database can close", async () => {
    const rows = Promise.withResolvers<unknown[]>();
    const { scheduler } = fixture(rows.promise);
    const tick = scheduler.tick();
    let drained = false;
    const drain = scheduler.drain().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    rows.resolve([]);
    await Promise.all([tick, drain]);
    expect(drained).toBe(true);
  });

  it("awaits manual job completion even after triggerJob returned", async () => {
    const rpc = Promise.withResolvers<void>();
    const { scheduler, workerManager, jobStore } = fixture();
    workerManager.call.mockImplementation(() => rpc.promise);
    await scheduler.triggerJob("job");
    await vi.waitFor(() => expect(workerManager.call).toHaveBeenCalled());
    let drained = false;
    const drain = scheduler.drain().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(jobStore.completeRun).not.toHaveBeenCalled();
    rpc.resolve();
    await drain;
    expect(jobStore.completeRun).toHaveBeenCalledWith("run", expect.objectContaining({ status: "succeeded" }));
  });

  it("does not retain rejected work", async () => {
    const { scheduler, jobStore } = fixture();
    jobStore.getJobById.mockRejectedValue(new Error("database unavailable"));
    await expect(scheduler.triggerJob("job")).rejects.toThrow("database unavailable");
    await scheduler.drain();
  });
});
