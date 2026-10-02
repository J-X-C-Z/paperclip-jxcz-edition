import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const cp = await importOriginal<typeof import("node:child_process")>();
  return {
    ...cp,
    spawn: (...args: Parameters<typeof cp.spawn>) => mockSpawn(...args) as ReturnType<typeof cp.spawn>,
  };
});

import { fetchCodexQuota, fetchCodexRpcQuota, getQuotaWindows } from "./quota.js";

function createChildThatErrorsOnMicrotask(err: Error): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stream = Object.assign(new EventEmitter(), {
    setEncoding: () => {},
  });
  Object.assign(child, {
    stdout: stream,
    stderr: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(),
  });
  queueMicrotask(() => {
    child.emit("error", err);
  });
  return child;
}

describe("CodexRpcClient spawn failures", () => {
  let previousCodexHome: string | undefined;
  let isolatedCodexHome: string | undefined;

  beforeEach(() => {
    mockSpawn.mockReset();
    // After the RPC path fails, getQuotaWindows() calls readCodexToken() which
    // reads $CODEX_HOME/auth.json (default ~/.codex). Point CODEX_HOME at an
    // empty temp directory so we never hit real host auth or the WHAM network.
    previousCodexHome = process.env.CODEX_HOME;
    isolatedCodexHome = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-codex-spawn-test-"));
    process.env.CODEX_HOME = isolatedCodexHome;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (isolatedCodexHome) {
      try {
        fs.rmSync(isolatedCodexHome, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      isolatedCodexHome = undefined;
    }
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it("classifies app-server refresh-token failures as quota probe auth errors", async () => {
    mockSpawn.mockImplementation(() => createChildThatErrorsOnMicrotask(new Error("OAuth failed: refresh token has expired")));

    const result = await getQuotaWindows();

    expect(result.ok).toBe(false);
    expect(result.source).toBe("codex-rpc");
    expect(result.errorFamily).toBe("refresh_token_expired");
    expect(result.error).toContain("Codex app-server");
  });

  it("falls back to WHAM after an app-server refresh-token failure", async () => {
    fs.writeFileSync(
      path.join(isolatedCodexHome!, "auth.json"),
      JSON.stringify({
        tokens: {
          access_token: "access-token-fixture-secret",
          refresh_token: "refresh-token-fixture-secret",
        },
      }),
      "utf8",
    );
    mockSpawn.mockImplementation(() => createChildThatErrorsOnMicrotask(new Error("OAuth failed: refresh token has expired")));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({
          rate_limit: {
            primary_window: { used_percent: 0.5, reset_at: 1_711_111_111 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )),
    );

    const result = await getQuotaWindows();

    expect(result.ok).toBe(true);
    expect(result.source).toBe("codex-wham");
    expect(result.errorFamily).toBeUndefined();
    expect(result.windows).toEqual([
      expect.objectContaining({
        label: "5h limit",
        usedPercent: 50,
        resetsAt: "2024-03-22T12:38:31.000Z",
      }),
    ]);
  });

  it("classifies WHAM refresh-token response bodies without returning the body text", async () => {
    fs.writeFileSync(
      path.join(isolatedCodexHome!, "auth.json"),
      JSON.stringify({
        tokens: {
          access_token: "access-token-fixture-secret",
          refresh_token: "refresh-token-fixture-secret",
        },
      }),
      "utf8",
    );
    mockSpawn.mockImplementation(() => createChildThatErrorsOnMicrotask(new Error("spawn codex ENOENT")));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("OAuth failed: invalid_grant", { status: 401 })),
    );

    const result = await getQuotaWindows();

    expect(result.ok).toBe(false);
    expect(result.source).toBe("codex-wham");
    expect(result.errorFamily).toBe("refresh_token_invalidated");
    expect(result.error).toContain("chatgpt wham api returned 401");
    expect(result.error).not.toContain("invalid_grant");
    expect(JSON.stringify(result)).not.toContain("access-token-fixture-secret");
    expect(JSON.stringify(result)).not.toContain("refresh-token-fixture-secret");
  });

  it("limits WHAM error response buffering before classifying auth failures", async () => {
    const encoder = new TextEncoder();
    const totalChunks = 20;
    let pullCount = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount > totalChunks) {
          controller.close();
          return;
        }
        const text =
          pullCount === 1
            ? `OAuth failed: invalid_grant ${"x".repeat(1_024)}`
            : "x".repeat(1_024);
        controller.enqueue(encoder.encode(text));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 401 })),
    );

    await expect(fetchCodexQuota("access-token-fixture-secret", null)).rejects.toMatchObject({
      name: "CodexQuotaAuthError",
      errorFamily: "refresh_token_invalidated",
    });
    expect(pullCount).toBeLessThan(totalChunks);
    expect(cancelled).toBe(true);
  });

  it("does not classify bare WHAM 401 quota probe failures or expose token material", async () => {
    fs.writeFileSync(
      path.join(isolatedCodexHome!, "auth.json"),
      JSON.stringify({
        tokens: {
          access_token: "access-token-fixture-secret",
          refresh_token: "refresh-token-fixture-secret",
        },
      }),
      "utf8",
    );
    mockSpawn.mockImplementation(() => createChildThatErrorsOnMicrotask(new Error("spawn codex ENOENT")));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 })),
    );

    const result = await getQuotaWindows();

    expect(result.ok).toBe(false);
    expect(result.errorFamily).toBeUndefined();
    expect(result.error).toContain("chatgpt wham api returned 401");
    expect(JSON.stringify(result)).not.toContain("access-token-fixture-secret");
    expect(JSON.stringify(result)).not.toContain("refresh-token-fixture-secret");
  });

  it("does not crash the process when codex is missing; getQuotaWindows returns ok: false", async () => {
    const enoent = Object.assign(new Error("spawn codex ENOENT"), {
      code: "ENOENT",
      errno: -2,
      syscall: "spawn codex",
      path: "codex",
    });
    mockSpawn.mockImplementation(() => createChildThatErrorsOnMicrotask(enoent));

    const result = await getQuotaWindows();

    expect(result.ok).toBe(false);
    expect(result.windows).toEqual([]);
    expect(result.error).toContain("Codex app-server");
    expect(result.error).toContain("spawn codex ENOENT");
  });
});


describe("isolated Codex RPC verification", () => {
  function respondingChild(rejectLimits: boolean): ChildProcess {
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, { stdout: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
      stderr: Object.assign(new EventEmitter(), { setEncoding: () => {} }), stdin: { write: vi.fn() }, kill: vi.fn() });
    const stdout = child.stdout!;
    Object.assign(child.stdin!, { write: (line: string) => {
      const request = JSON.parse(line);
      if (request.id == null) return;
      const response = request.method === "account/rateLimits/read"
        ? rejectLimits ? { error: { code: -32000, message: "rejected" } }
          : { result: { rateLimits: { primary: { usedPercent: 10 } } } }
        : request.method === "account/read" ? { result: { account: { type: "chatgpt", planType: "plus" } } }
        : { result: {} };
      queueMicrotask(() => stdout.emit("data", JSON.stringify({ id: request.id, ...response }) + "\n"));
    } });
    return child;
  }
  afterEach(() => vi.resetAllMocks());
  it("passes the selected login home only to the child process", async () => {
    const child = respondingChild(false);
    mockSpawn.mockReturnValue(child);
    const previous = process.env.CODEX_HOME;
    await expect(fetchCodexRpcQuota("/isolated/attempt")).resolves.toMatchObject({ planType: "plus" });
    expect(mockSpawn).toHaveBeenCalledWith("codex", ["-s", "read-only", "-a", "never", "app-server"], expect.objectContaining({
      env: expect.objectContaining({ CODEX_HOME: "/isolated/attempt" }),
    }));
    expect(process.env.CODEX_HOME).toBe(previous);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("rejects RPC error replies instead of treating them as empty success", async () => {
    const child = respondingChild(true);
    mockSpawn.mockReturnValue(child);
    await expect(fetchCodexRpcQuota("/isolated/attempt")).rejects.toThrow("could not verify");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
