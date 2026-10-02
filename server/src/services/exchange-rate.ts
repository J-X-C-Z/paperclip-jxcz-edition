import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { logger } from "../middleware/logger.js";

export const EXCHANGE_RATE_SOURCE = "https://api.frankfurter.dev/v2/rate/USD/CNY";
export const EXCHANGE_RATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
type CachedRate = { rate: number | null; updatedAt: string | null; checkedAt: string };
export type ExchangeRate = {
  base: "USD"; quote: "CNY"; rate: number | null; updatedAt: string | null;
  source: string; stale: boolean;
};

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** One public currency-pair request per 24 hours, including across restarts.
 * Failure retains the last known rate and is visible to callers as stale.
 */
export function createExchangeRateService(options: {
  cachePath?: string; fetch?: typeof fetch; now?: () => number;
} = {}) {
  const cachePath = options.cachePath ?? path.join(resolvePaperclipInstanceRoot(), "data", "usd-cny-rate.json");
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let cache: CachedRate | null = null;
  let loaded = false;
  let pending: Promise<ExchangeRate> | null = null;
  const snapshot = (): ExchangeRate => ({
    base: "USD", quote: "CNY", rate: cache?.rate ?? null,
    updatedAt: cache?.updatedAt ?? null, source: EXCHANGE_RATE_SOURCE,
    stale: !cache?.updatedAt || now() - Date.parse(cache.updatedAt) > 4 * EXCHANGE_RATE_INTERVAL_MS
      || (cache?.rate != null && Date.parse(cache.checkedAt) - Date.parse(cache.updatedAt!) > 4 * EXCHANGE_RATE_INTERVAL_MS),
  });
  let lastAttemptFailed = false;
  async function refresh(): Promise<ExchangeRate> {
    if (!loaded) {
      try {
        const saved = JSON.parse(await readFile(cachePath, "utf8")) as CachedRate & { failed?: boolean };
        if (validDate(saved.checkedAt) && (saved.rate === null || (Number.isFinite(saved.rate) && saved.rate > 0))
          && (saved.updatedAt === null || validDate(saved.updatedAt))) {
          cache = saved;
          lastAttemptFailed = saved.failed === true;
        }
      } catch { /* First start or damaged cache: fetch a verified rate. */ }
      loaded = true;
    }
    if (!cache || now() - Date.parse(cache.checkedAt) >= EXCHANGE_RATE_INTERVAL_MS) {
      const checkedAt = new Date(now()).toISOString();
      try {
        const response = await request(EXCHANGE_RATE_SOURCE, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Exchange rate provider returned ${response.status}`);
        const data = await response.json() as Record<string, unknown>;
        if (data.base !== "USD" || data.quote !== "CNY" || typeof data.rate !== "number"
          || !Number.isFinite(data.rate) || data.rate <= 0 || !validDate(data.date)
          || Date.parse(data.date) > now() + EXCHANGE_RATE_INTERVAL_MS) {
          throw new Error("Invalid USD/CNY exchange rate response");
        }
        cache = { rate: data.rate, updatedAt: data.date, checkedAt };
        lastAttemptFailed = false;
      } catch (err) {
        cache = { rate: cache?.rate ?? null, updatedAt: cache?.updatedAt ?? null, checkedAt };
        lastAttemptFailed = true;
        logger.warn({ err }, "Daily USD/CNY exchange rate refresh failed; retaining last known rate");
      }
      try {
        await mkdir(path.dirname(cachePath), { recursive: true });
        const tempPath = `${cachePath}.${process.pid}.tmp`;
        await writeFile(tempPath, JSON.stringify({ ...cache, failed: lastAttemptFailed }), "utf8");
        await rename(tempPath, cachePath);
      } catch (err) {
        logger.warn({ err }, "Could not persist USD/CNY exchange rate cache");
      }
    }
    return { ...snapshot(), stale: lastAttemptFailed || snapshot().stale };
  }
  return {
    get: (): Promise<ExchangeRate> => {
      if (!pending) pending = refresh().finally(() => { pending = null; });
      return pending;
    },
  };
}

export const exchangeRateService = createExchangeRateService();

export function startExchangeRateUpdates() {
  void exchangeRateService.get();
  // Hourly due check handles a cache from a previous process without moving
  // its 24-hour refresh deadline. get() never polls the provider before due.
  const timer = setInterval(() => { void exchangeRateService.get(); }, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
