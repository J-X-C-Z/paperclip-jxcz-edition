import { execFile, type ExecFileOptions } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { disposeGitWorkspaceSnapshot, readGitWorkspaceSnapshot, runLocalGit, setExpensiveWorkspaceGitExecutor, type GitWorkspaceSnapshot } from "@paperclipai/adapter-utils/git-workspace-sync";
import { isPathManifest, workspacePaths } from "@paperclipai/adapter-utils/workspace-manifest";
import { prepareSandboxManagedRuntime, type PreparedSandboxManagedRuntime, type SandboxManagedRuntimeClient } from "@paperclipai/adapter-utils/sandbox-managed-runtime";
import { createWorkspaceGitOperationScheduler } from "./workspace-git-operation-scheduler.js";

const exec = promisify(execFile);
async function execute(command: string, args: string[], options: ExecFileOptions = {}): Promise<void> {
  try { await exec(command, args, options); }
  catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    throw new Error(`Fixture command failed: ${String(error)}\n${stderr.slice(-8192)}`, { cause: error });
  }
}
const directories: string[] = [];
const snapshots: GitWorkspaceSnapshot[] = [];
const runtimes: PreparedSandboxManagedRuntime[] = [];
afterEach(async () => {
  setExpensiveWorkspaceGitExecutor(null);
  for (const runtime of runtimes.splice(0)) await runtime.cleanupWorkspaceSnapshot();
  for (const snapshot of snapshots.splice(0)) await disposeGitWorkspaceSnapshot(snapshot);
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
}, 60_000);

function localClient(commands: string[], beforeCommand?: (command: string) => Promise<ExecFileOptions | void>): SandboxManagedRuntimeClient {
  return {
    makeDir: async (dir) => { await fs.mkdir(dir, { recursive: true }); },
    writeFile: async (file, bytes) => { await fs.writeFile(file, Buffer.from(bytes)); },
    readFile: async (file) => fs.readFile(file),
    listFiles: async (dir) => fs.readdir(dir),
    remove: async (file) => { await fs.rm(file, { recursive: true, force: true }); },
    run: async (command) => { await execute("sh", ["-c", command]); },
    syncIn: async (operations) => {
      for (const operation of operations) {
        for (const mapping of operation.files) {
          await fs.mkdir(path.dirname(mapping.targetPath), { recursive: true });
          await fs.copyFile(mapping.sourcePath, mapping.targetPath);
        }
        for (const command of operation.postUploadCommands ?? []) {
          commands.push(command.command);
          await execute("sh", ["-c", command.command], { maxBuffer: 64 * 1024, ...await beforeCommand?.(command.command) });
        }
      }
      return { operations: [] };
    },
  };
}

// macOS adds per-file process and filesystem overhead to the real deletion lane.
const realGitTimeoutMs = process.platform === "darwin" ? 300_000 : 180_000;
it("streams and stages all four real Git filename lanes above 32 MiB through the shared scheduler", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pc-stream-git-")));
  directories.push(root);
  const repo = path.join(root, "repo");
  await fs.mkdir(repo);
  const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_EMAIL: "test@example.test" };
  const git = (args: string[]) => runLocalGit(repo, args, { env, timeout: 120_000, maxBuffer: 64 * 1024 });
  await git(["init"]);
  await git(["commit", "--allow-empty", "-qm", "fixture"]);
  // Leave room for the fixture/staging root below macOS's 1,024-byte path
  // limit while keeping each 40,000-name Git lane above the 32 MiB boundary.
  const parent = path.join(repo, ...Array.from({ length: 3 }, () => "nested-".repeat(30)), "storybook-output");
  await fs.mkdir(parent, { recursive: true });
  const fileName = (index: number) => `${"asset-".repeat(36)}${index}.js`;
  const writeFiles = async (content: string) => {
    for (let start = 0; start < 40_000; start += 100) {
      await Promise.all(Array.from({ length: 100 }, (_, offset) => fs.writeFile(path.join(parent, fileName(start + offset)), content)));
    }
  };
  await writeFiles("base");
  const unusual = [" space ", "line\nbreak", "-option", "雪-💾", "wild[?]*"];
  for (const name of unusual) await fs.writeFile(path.join(repo, name), name);
  const scheduler = createWorkspaceGitOperationScheduler({ concurrency: 2, queueCapacity: 8 });
  const bindScheduler = () => setExpensiveWorkspaceGitExecutor((input) => scheduler.run({
    workspacePath: input.localDir, args: input.args, operation: input.operation,
    timeoutMs: input.timeout, onStdout: input.onStdout, signal: input.signal, cacheTtlMs: 0,
    maxStdoutBytes: 1, maxStderrBytes: 64 * 1024,
  }));
  const scan = async () => {
    const result = await readGitWorkspaceSnapshot(repo);
    expect(result).not.toBeNull();
    snapshots.push(result!);
    expect(JSON.stringify(result).length).toBeLessThan(4096);
    return result!;
  };
  const checkLargeLane = (paths: GitWorkspaceSnapshot["overlayPaths"]) => {
    let count = 0, bytes = 0;
    for (const relative of workspacePaths(paths)) {
      if (!relative.endsWith(".js")) continue;
      count++;
      bytes += Buffer.byteLength(relative) + 1;
    }
    expect(count).toBe(40_000);
    expect(bytes).toBe(34_988_890);
    expect(bytes).toBeGreaterThan(32 * 1024 * 1024);
  };
  // Standalone callers must use the same streaming semantics.
  setExpensiveWorkspaceGitExecutor(null);
  const standalone = await scan();
  checkLargeLane(standalone.overlayPaths);
  await disposeGitWorkspaceSnapshot(standalone);
  bindScheduler();
  const snapshot = await scan();
  checkLargeLane(snapshot.overlayPaths);
  await fs.writeFile(path.join(parent, "late.js"), "must not stage");
  const commands: string[] = [];
  const remote = path.join(root, "remote");
  const stage = async (gitSnapshot: GitWorkspaceSnapshot) => {
    const runtime = await prepareSandboxManagedRuntime({
      spec: { transport: "sandbox", provider: "test", sandboxId: "test", remoteCwd: remote, timeoutMs: 120_000, apiKey: null },
      client: localClient(commands), adapterKey: "stream-test", workspaceLocalDir: repo, workspaceGitSnapshot: gitSnapshot,
    });
    runtimes.push(runtime);
    return runtime;
  };
  const runtime = await stage(snapshot);
  const remoteParent = path.join(remote, path.relative(repo, parent));
  let stagedCount = 0;
  let contentChecks: Promise<void>[] = [];
  for await (const entry of await fs.opendir(remoteParent)) {
    contentChecks.push(fs.readFile(path.join(remoteParent, entry.name), "utf8").then(content => { expect(content).toBe("base"); }));
    stagedCount++;
    if (contentChecks.length === 64) { await Promise.all(contentChecks); contentChecks = []; }
  }
  await Promise.all(contentChecks);
  expect(stagedCount).toBe(40_000);
  for (const name of unusual) expect(await fs.readFile(path.join(remote, name), "utf8")).toBe(name);
  const manifestFile = isPathManifest(snapshot.overlayPaths) ? snapshot.overlayPaths.filePath : "";
  await runtime.cleanupWorkspaceSnapshot();
  await expect(fs.stat(manifestFile)).rejects.toMatchObject({ code: "ENOENT" });
  await fs.rm(path.join(parent, "late.js"));

  await fs.writeFile(path.join(repo, ".gitignore"), "*.js\n");
  const ignored = await scan();
  checkLargeLane(ignored.ignoredPaths);
  await disposeGitWorkspaceSnapshot(ignored);
  await fs.rm(path.join(repo, ".gitignore"));
  await git(["add", "--", "."]);
  await git(["commit", "-qm", "track generated files"]);
  await writeFiles("changed");
  const changed = await scan();
  checkLargeLane(changed.overlayPaths);
  await disposeGitWorkspaceSnapshot(changed);
  await fs.rm(parent, { recursive: true });
  const deleted = await scan();
  checkLargeLane(deleted.deletedPaths);
  await stage(deleted);
  let remaining = 0;
  for await (const _entry of await fs.opendir(remoteParent)) remaining++;
  expect(remaining).toBe(0);
  expect(commands.every((command) => command.length < 16 * 1024)).toBe(true);
  expect(scheduler.snapshot()).toMatchObject({ activeCount: 0, queuedCount: 0, inFlightCount: 0, cacheBytes: 0 });
}, realGitTimeoutMs);


it.each(["symlink", "file", "root_symlink", "retarget_during_rm", "rm_failure", "newline_parent"])("confines deleted manifest paths when the remote directory changes: %s", async (change) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pc-delete-boundary-")));
  directories.push(root);
  const repo = path.join(root, "repo"), remote = path.join(root, "remote"), outside = path.join(root, "outside");
  const parentName = change === "newline_parent" ? "nested\n" : "nested";
  await fs.mkdir(path.join(repo, parentName), { recursive: true });
  await fs.mkdir(outside);
  const names = [" space ", "line\nbreak", "-option", "雪-💾", "wild[?]*"];
  for (const name of names) {
    await fs.writeFile(path.join(repo, parentName, name), "tracked");
    await fs.writeFile(path.join(outside, name), "outside");
  }
  const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_EMAIL: "test@example.test" };
  await runLocalGit(repo, ["init"], { env });
  await runLocalGit(repo, ["add", "--", "."], { env });
  await runLocalGit(repo, ["commit", "-qm", "fixture"], { env });
  await fs.rm(path.join(repo, parentName), { recursive: true });
  const snapshot = await readGitWorkspaceSnapshot(repo);
  expect(snapshot).not.toBeNull();
  snapshots.push(snapshot!);
  const commands: string[] = [];
  const preparing = prepareSandboxManagedRuntime({
    spec: { transport: "sandbox", provider: "test", sandboxId: "test", remoteCwd: remote, timeoutMs: 120_000, apiKey: null },
    adapterKey: "delete-test", workspaceLocalDir: repo, workspaceGitSnapshot: snapshot!,
    client: localClient(commands, async command => {
      if (!command.includes("xargs -0") || change === "newline_parent") return;
      if (change === "symlink" || change === "file") {
        await fs.rm(path.join(remote, "nested"), { recursive: true });
        if (change === "symlink") await fs.symlink(outside, path.join(remote, "nested"));
        else await fs.writeFile(path.join(remote, "nested"), "not a directory");
      } else if (change === "root_symlink") {
        await fs.rename(remote, path.join(root, "original-remote"));
        await fs.symlink(outside, remote);
        const manifest = path.join(".paperclip-runtime", "delete-test", "deleted.nul");
        await fs.mkdir(path.dirname(path.join(outside, manifest)), { recursive: true });
        await fs.copyFile(path.join(root, "original-remote", manifest), path.join(outside, manifest));
        await fs.mkdir(path.join(outside, "nested"));
        for (const name of names) await fs.writeFile(path.join(outside, "nested", name), "outside");
      } else {
        const bin = path.join(root, "bin");
        await fs.mkdir(bin);
        const quote = (value: string) => "'" + value.replace(/'/g, "'\"'\"'") + "'";
        const script = change === "rm_failure" ? "#!/bin/sh\nexit 23\n" : `#!/bin/sh
if [ ! -L ${quote(path.join(remote, "nested"))} ]; then
/bin/mv ${quote(path.join(remote, "nested"))} ${quote(path.join(remote, "original-nested"))} || exit
/bin/ln -s ${quote(outside)} ${quote(path.join(remote, "nested"))} || exit
fi
/bin/rm "$@"
`;
        await fs.writeFile(path.join(bin, "rm"), script, { mode: 0o755 });
        return { env: { ...process.env, PATH: bin + path.delimiter + (process.env.PATH ?? "/usr/bin:/bin") } };
      }
    }),
  });
  if (change === "retarget_during_rm" || change === "newline_parent") {
    const runtime = await preparing;
    runtimes.push(runtime);
    expect(await fs.readdir(path.join(remote, change === "newline_parent" ? parentName : "original-nested"))).toEqual([]);
  } else await expect(preparing).rejects.toThrow("Fixture command failed");
  for (const name of names) {
    expect(await fs.readFile(path.join(outside, name), "utf8")).toBe("outside");
    if (change === "root_symlink") expect(await fs.readFile(path.join(outside, "nested", name), "utf8")).toBe("outside");
  }
});
