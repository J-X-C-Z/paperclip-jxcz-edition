import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { getPostgresDataDirectory } from "./client.js";
import { runDatabaseBackup } from "./backup-lib.js";

const mocks = vi.hoisted(() => {
  const end = vi.fn(async () => {});
  const sql = Object.assign(vi.fn(), { end });
  return { sql, end, postgres: vi.fn(() => sql) };
});

vi.mock("postgres", () => ({ default: mocks.postgres }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.end = mocks.end;
  vi.stubEnv("DATABASE_POOL_MAX", "24");
  vi.stubEnv("DATABASE_CONNECT_TIMEOUT_SECONDS", "12");
  vi.stubEnv("DATABASE_PREPARED_STATEMENTS", "false");
  vi.stubEnv("DATABASE_IDLE_TIMEOUT_SECONDS", "0");
  vi.stubEnv("DATABASE_MAX_LIFETIME_SECONDS", "3600");
  vi.stubEnv("DATABASE_APPLICATION_NAME", "remote-paperclip");
});

afterEach(() => vi.unstubAllEnvs());

describe("utility and backup connection tuning", () => {
  it("inherits tuning for utility connections while preserving max 1 and notice suppression", async () => {
    mocks.sql.mockResolvedValue([{ data_directory: "/postgres/data" }]);
    await expect(getPostgresDataDirectory("postgres://test:test@127.0.0.1:1/test"))
      .resolves.toBe("/postgres/data");
    expect(vi.mocked(postgres).mock.calls[0]?.[1]).toMatchObject({
      max: 1, connect_timeout: 12, prepare: false, idle_timeout: 0, max_lifetime: 3600,
      connection: { application_name: "remote-paperclip" }, onnotice: expect.any(Function),
    });
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("inherits tuning for backup connections while keeping their own pool size and timeout", async () => {
    // Stop at the first query, before any backup or database data can be touched.
    mocks.sql.mockRejectedValue(new Error("stop-before-backup-query"));
    const backupDir = await mkdtemp(join(tmpdir(), "paperclip-backup-options-"));
    try {
      await expect(runDatabaseBackup({
        connectionString: "postgres://test:test@127.0.0.1:1/test",
        backupDir, connectTimeoutSeconds: 7, backupEngine: "javascript",
        retention: { dailyDays: 1, weeklyWeeks: 1, monthlyMonths: 1 },
      })).rejects.toThrow("stop-before-backup-query");
      expect(vi.mocked(postgres).mock.calls[0]?.[1]).toMatchObject({
        max: 1, connect_timeout: 7, prepare: false, idle_timeout: 0, max_lifetime: 3600,
        connection: { application_name: "remote-paperclip" },
      });
      expect(mocks.end).toHaveBeenCalledOnce();
    } finally { await rm(backupDir, { recursive: true, force: true }); }
  });
});
