import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExchangeRateService, EXCHANGE_RATE_INTERVAL_MS } from "../services/exchange-rate.js";

const folders: string[] = [];
async function cachePath() {
  const folder = await mkdtemp(path.join(tmpdir(), "paperclip-fx-test-"));
  folders.push(folder);
  return path.join(folder, "rate.json");
}
afterEach(async () => { await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))); });
const response = (rate = 6.7, date = "2026-10-02") => new Response(JSON.stringify({ base: "USD", quote: "CNY", rate, date }));

describe("daily exchange rate cache", () => {
  it("deduplicates requests, persists across restarts, and refreshes only after 24 hours", async () => {
    let time = Date.parse("2026-10-02T12:00:00Z");
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const file = await cachePath();
    const options = { fetch: request, cachePath: file, now: () => time };
    const service = createExchangeRateService(options);
    const values = await Promise.all([service.get(), service.get(), service.get()]);
    expect(values[0]).toMatchObject({ rate: 6.7, stale: false, updatedAt: "2026-10-02" });
    expect(request).toHaveBeenCalledTimes(1);
    const restarted = createExchangeRateService(options);
    await restarted.get();
    expect(request).toHaveBeenCalledTimes(1);
    time += EXCHANGE_RATE_INTERVAL_MS;
    request.mockResolvedValue(response(6.8, "2026-10-03"));
    expect(await restarted.get()).toMatchObject({ rate: 6.8, stale: false });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("retains the last rate on failure and persists failure status without request storms", async () => {
    let time = Date.parse("2026-10-02T12:00:00Z");
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const options = { fetch: request, cachePath: await cachePath(), now: () => time };
    const service = createExchangeRateService(options);
    await service.get();
    time += EXCHANGE_RATE_INTERVAL_MS;
    request.mockRejectedValue(new Error("offline"));
    expect(await service.get()).toMatchObject({ rate: 6.7, stale: true });
    expect(await createExchangeRateService(options).get()).toMatchObject({ rate: 6.7, stale: true });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed rates instead of inventing a conversion", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(-1));
    const service = createExchangeRateService({ fetch: request, cachePath: await cachePath(), now: () => Date.parse("2026-10-02T12:00:00Z") });
    expect(await service.get()).toMatchObject({ rate: null, updatedAt: null, stale: true });
  });
  it("flags old reference dates while allowing weekends and short holidays", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(6.7, "2026-09-25"));
    const service = createExchangeRateService({ fetch: request, cachePath: await cachePath(), now: () => Date.parse("2026-10-02T12:00:00Z") });
    expect(await service.get()).toMatchObject({ rate: 6.7, stale: true });
  });
});
