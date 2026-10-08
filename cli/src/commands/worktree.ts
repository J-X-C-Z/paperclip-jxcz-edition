import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  promises as fsPromises,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  resolveCanonicalWorktreeSeedSource,
  resolveRegisteredWorktreeSeedSource,
} from "@paperclipai/shared/worktree-seed-source";
import {
  readWorktreePortRegistry,
  withWorktreePortRegistryLock,
  writeWorktreePortRegistry,
} from "@paperclipai/shared/worktree-port-registry";
import {
  applyPendingMigrations,
  agents,
  authAccounts,
  authUsers,
  assets,
  companies,
  companyMemberships,
  createDb,
  documentRevisions,
  documents,
  ensurePostgresDatabase,
  executionWorkspaces,
  formatDatabaseBackupResult,
  goals,
  heartbeatRuns,
  inspectMigrations,
  issueAttachments,
  issueComments,
  issueDocuments,
  issues,
  instanceUserRoles,
  projectWorkspaces,
  projects,
  routines,
  routineTriggers,
  runDatabaseBackup,
  runDatabaseRestore,
  resetPostgresDatabase,
  workspaceRuntimeServices,
  createEmbeddedPostgresLogBuffer,
  formatEmbeddedPostgresError,
  loadWithoutEmbeddedPostgresExitHooks,
  prepareEmbeddedPostgresNativeRuntime,
} from "@paperclipai/db";
import type { Command } from "commander";
import { ensureAgentJwtSecret, ensureToolActionSigningSecret, loadPaperclipEnvFile, mergePaperclipEnvEntries, readPaperclipEnvEntries, resolvePaperclipEnvFile } from "../config/env.js";
import { expandHomePrefix } from "../config/home.js";
import type { PaperclipConfig } from "../config/schema.js";
import { readConfig, resolveConfigPath, writeConfig } from "../config/store.js";
import { printPaperclipCliBanner } from "../utils/banner.js";
import { resolveRuntimeLikePath } from "../utils/path-resolver.js";
import {
  buildWorktreeConfig,
  buildWorktreeEnvEntries,
  DEFAULT_WORKTREE_HOME,
  formatShellExports,
  generateWorktreeColor,
  isWorktreeSeedMode,
  WORKTREE_SEED_PHASES,
  resolveSuggestedWorktreeName,
  resolveWorktreeSeedPlan,
  resolveWorktreeSeedMarkerPaths,
  resolveWorktreeLocalPaths,
  sanitizeWorktreeInstanceId,
  type WorktreeSeedPlan,
  type WorktreeSeedManifest,
  type WorktreeSeedMode,
  type WorktreeSeedPhase,
  type WorktreeLocalPaths,
} from "./worktree-lib.js";
import {
  buildWorktreeMergePlan,
  parseWorktreeMergeScopes,
  type IssueAttachmentRow,
  type IssueDocumentRow,
  type DocumentRevisionRow,
  type PlannedAttachmentInsert,
  type PlannedCommentInsert,
  type PlannedIssueDocumentInsert,
  type PlannedIssueDocumentMerge,
  type PlannedIssueInsert,
} from "./worktree-merge-history-lib.js";
import { detectGitWorkspaceInfo } from "./git-workspace.js";

type WorktreeInitOptions = {
  name?: string;
  color?: string;
  instance?: string;
  home?: string;
  fromConfig?: string;
  fromDataDir?: string;
  fromInstance?: string;
  sourceConfigPathOverride?: string;
  serverPort?: number;
  dbPort?: number;
  seed?: boolean;
  seedMode?: string;
  preserveLiveWork?: boolean;
  force?: boolean;
};

type WorktreeMakeOptions = WorktreeInitOptions & {
  startPoint?: string;
};

type WorktreeEnvOptions = {
  config?: string;
  json?: boolean;
};

type WorktreeListOptions = {
  json?: boolean;
};

type WorktreeMergeHistoryOptions = {
  from?: string;
  to?: string;
  company?: string;
  scope?: string;
  apply?: boolean;
  dry?: boolean;
  yes?: boolean;
};

type WorktreeReseedOptions = {
  from?: string;
  to?: string;
  fromConfig?: string;
  fromDataDir?: string;
  fromInstance?: string;
  seedMode?: string;
  preserveLiveWork?: boolean;
  yes?: boolean;
  allowLiveTarget?: boolean;
  backupTarget?: boolean;
};

type WorktreeRepairOptions = {
  branch?: string;
  home?: string;
  fromConfig?: string;
  fromDataDir?: string;
  fromInstance?: string;
  seedMode?: string;
  preserveLiveWork?: boolean;
  noSeed?: boolean;
  allowLiveTarget?: boolean;
};

type WorktreeEnsureSeededOptions = {
  config?: string;
  fromConfig?: string;
  fromDataDir?: string;
  fromInstance?: string;
  preserveLiveWork?: boolean;
  registeredBaseWorkspaceCwd?: string;
  registeredProjectWorkspaceId?: string;
  expectedCompanyId?: string;
};

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
  initdbFlags?: string[];
  onLog?: (message: unknown) => void;
  onError?: (message: unknown) => void;
}) => EmbeddedPostgresInstance;

type EmbeddedPostgresHandle = {
  port: number;
  startedByThisProcess: boolean;
  stop: () => Promise<void>;
};

type CopiedGitHooksResult = {
  sourceHooksPath: string;
  targetHooksPath: string;
  copied: boolean;
};

type SeedWorktreeDatabaseResult = {
  backupSummary: string;
  snapshotAt: string;
  migrationRevision: string;
  pausedScheduledRoutines: number;
  executionQuarantine: SeededWorktreeExecutionQuarantineSummary;
  reboundWorkspaces: Array<{
    name: string;
    fromCwd: string;
    toCwd: string;
  }>;
  validation: WorktreeSeedValidationSummary;
};

export type WorktreeSeedValidationSummary = {
  authUserCount: number;
  credentialAccountCount: number;
  instanceAdminCount: number;
  activeMembershipCount: number;
  companyCount: number;
  issueCount: number;
  representativeCompanyId: string;
  representativeIssueId: string;
  migrationRevision: string;
};

type SeedWorktreeDatabase = typeof seedWorktreeDatabase;

export type EnsureWorktreeSeededResult = {
  seeded: boolean;
  reason:
    | "seeded"
    | "verified_manifest"
    | "complete_marker"
    | "legacy_unmarked"
    | "legacy_database";
  details?: SeedWorktreeDatabaseResult;
};

export type LegacyWorktreeDatabaseEvidence = {
  migrationRevision: string;
};

export type SeededWorktreeExecutionQuarantineSummary = {
  disabledTimerHeartbeats: number;
  resetRunningAgents: number;
  quarantinedInProgressIssues: number;
  unassignedTodoIssues: number;
  unassignedReviewIssues: number;
  stoppedProjectWorkspaceRuntimes: number;
  stoppedExecutionWorkspaceRuntimes: number;
  stoppedRuntimeServices: number;
};

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isCurrentSourceConfigPath(sourceConfigPath: string): boolean {
  const currentConfigPath = process.env.PAPERCLIP_CONFIG;
  if (!currentConfigPath || currentConfigPath.trim().length === 0) {
    return false;
  }
  return path.resolve(currentConfigPath) === path.resolve(sourceConfigPath);
}

function formatSeededWorktreeExecutionQuarantineSummary(
  summary: SeededWorktreeExecutionQuarantineSummary,
): string {
  return [
    `disabled timer heartbeats: ${summary.disabledTimerHeartbeats}`,
    `reset running agents: ${summary.resetRunningAgents}`,
    `quarantined in-progress issues: ${summary.quarantinedInProgressIssues}`,
    `unassigned todo issues: ${summary.unassignedTodoIssues}`,
    `unassigned review issues: ${summary.unassignedReviewIssues}`,
    `stopped project workspace runtimes: ${summary.stoppedProjectWorkspaceRuntimes}`,
    `stopped execution workspace runtimes: ${summary.stoppedExecutionWorkspaceRuntimes}`,
    `stopped runtime services: ${summary.stoppedRuntimeServices}`,
  ].join(", ");
}

const WORKTREE_NAME_PREFIX = "paperclip-";

function resolveWorktreeMakeName(name: string): string {
  const value = nonEmpty(name);
  if (!value) {
    throw new Error("必须提供 worktree 名称。");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(
      "worktree 名称只能包含字母、数字、点、下划线或短横线。",
    );
  }
  return value.startsWith(WORKTREE_NAME_PREFIX) ? value : `${WORKTREE_NAME_PREFIX}${value}`;
}

function resolveWorktreeHome(explicit?: string): string {
  return explicit ?? process.env.PAPERCLIP_WORKTREES_DIR ?? DEFAULT_WORKTREE_HOME;
}

function resolveWorktreeStartPoint(explicit?: string): string | undefined {
  return explicit ?? nonEmpty(process.env.PAPERCLIP_WORKTREE_START_POINT) ?? undefined;
}

type ConfiguredStorage = {
  getObject(companyId: string, objectKey: string): Promise<Buffer>;
  putObject(companyId: string, objectKey: string, body: Buffer, contentType: string): Promise<void>;
};

function assertStorageCompanyPrefix(companyId: string, objectKey: string): void {
  if (!objectKey.startsWith(`${companyId}/`) || objectKey.includes("..")) {
    throw new Error(`公司 ${companyId} 的对象键无效。`);
  }
}

function normalizeStorageObjectKey(objectKey: string): string {
  const normalized = objectKey.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/")) {
    throw new Error("对象键无效。");
  }
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("对象键无效。");
  }
  return parts.join("/");
}

function resolveLocalStoragePath(baseDir: string, objectKey: string): string {
  const resolved = path.resolve(baseDir, normalizeStorageObjectKey(objectKey));
  const root = path.resolve(baseDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("对象键路径无效。");
  }
  return resolved;
}

async function s3BodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error("未找到对象。");
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Readable) {
    return await streamToBuffer(body);
  }

  const candidate = body as {
    transformToWebStream?: () => ReadableStream<Uint8Array>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof candidate.transformToWebStream === "function") {
    const webStream = candidate.transformToWebStream();
    const reader = webStream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }
  if (typeof candidate.arrayBuffer === "function") {
    return Buffer.from(await candidate.arrayBuffer());
  }

  throw new Error("不支持的存储响应内容。");
}

function normalizeS3Prefix(prefix: string | undefined): string {
  if (!prefix) return "";
  return prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function buildS3ObjectKey(prefix: string, objectKey: string): string {
  return prefix ? `${prefix}/${objectKey}` : objectKey;
}

const dynamicImport = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<any>;

function createConfiguredStorageFromPaperclipConfig(config: PaperclipConfig): ConfiguredStorage {
  if (config.storage.provider === "local_disk") {
    const baseDir = expandHomePrefix(config.storage.localDisk.baseDir);
    return {
      async getObject(companyId: string, objectKey: string) {
        assertStorageCompanyPrefix(companyId, objectKey);
        return await fsPromises.readFile(resolveLocalStoragePath(baseDir, objectKey));
      },
      async putObject(companyId: string, objectKey: string, body: Buffer) {
        assertStorageCompanyPrefix(companyId, objectKey);
        const filePath = resolveLocalStoragePath(baseDir, objectKey);
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        await fsPromises.writeFile(filePath, body);
      },
    };
  }

  const prefix = normalizeS3Prefix(config.storage.s3.prefix);
  let s3ClientPromise: Promise<any> | null = null;
  async function getS3Client() {
    if (!s3ClientPromise) {
      s3ClientPromise = (async () => {
        const sdk = await dynamicImport("@aws-sdk/client-s3");
        return {
          sdk,
          client: new sdk.S3Client({
            region: config.storage.s3.region,
            endpoint: config.storage.s3.endpoint,
            forcePathStyle: config.storage.s3.forcePathStyle,
          }),
        };
      })();
    }
    return await s3ClientPromise;
  }
  const bucket = config.storage.s3.bucket;
  return {
    async getObject(companyId: string, objectKey: string) {
      assertStorageCompanyPrefix(companyId, objectKey);
      const { sdk, client } = await getS3Client();
      const response = await client.send(
        new sdk.GetObjectCommand({
          Bucket: bucket,
          Key: buildS3ObjectKey(prefix, objectKey),
        }),
      );
      return await s3BodyToBuffer(response.Body);
    },
    async putObject(companyId: string, objectKey: string, body: Buffer, contentType: string) {
      assertStorageCompanyPrefix(companyId, objectKey);
      const { sdk, client } = await getS3Client();
      await client.send(
        new sdk.PutObjectCommand({
          Bucket: bucket,
          Key: buildS3ObjectKey(prefix, objectKey),
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
        }),
      );
    },
  };
}

function openConfiguredStorage(configPath: string): ConfiguredStorage {
  const config = readConfig(configPath);
  if (!config) {
    throw new Error(`未在 ${configPath} 找到配置文件。`);
  }
  return createConfiguredStorageFromPaperclipConfig(config);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function isMissingStorageObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
  return candidate.code === "ENOENT"
    || candidate.status === 404
    || candidate.name === "NoSuchKey"
    || candidate.name === "NotFound"
    || candidate.message === "Object not found.";
}

export async function readSourceAttachmentBody(
  sourceStorages: Array<Pick<ConfiguredStorage, "getObject">>,
  companyId: string,
  objectKey: string,
): Promise<Buffer | null> {
  for (const sourceStorage of sourceStorages) {
    try {
      return await sourceStorage.getObject(companyId, objectKey);
    } catch (error) {
      if (isMissingStorageObjectError(error)) {
        continue;
      }
      throw error;
    }
  }
  return null;
}

export function resolveWorktreeMakeTargetPath(name: string): string {
  return path.resolve(os.homedir(), resolveWorktreeMakeName(name));
}

function extractExecSyncErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : null;
  }

  const stderr = "stderr" in error ? error.stderr : null;
  if (typeof stderr === "string") {
    return nonEmpty(stderr);
  }
  if (stderr instanceof Buffer) {
    return nonEmpty(stderr.toString("utf8"));
  }

  return error instanceof Error ? nonEmpty(error.message) : null;
}

function localBranchExists(cwd: string, branchName: string): boolean {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
      cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function resolveGitWorktreeAddArgs(input: {
  branchName: string;
  targetPath: string;
  branchExists: boolean;
  startPoint?: string;
}): string[] {
  if (input.branchExists && !input.startPoint) {
    return ["worktree", "add", input.targetPath, input.branchName];
  }
  const commitish = input.startPoint ?? "HEAD";
  return ["worktree", "add", "-b", input.branchName, input.targetPath, commitish];
}

function readPidFilePort(postmasterPidFile: string): number | null {
  if (!existsSync(postmasterPidFile)) return null;
  try {
    const lines = readFileSync(postmasterPidFile, "utf8").split("\n");
    const port = Number(lines[3]?.trim());
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function readRunningPostmasterPid(postmasterPidFile: string): number | null {
  if (!existsSync(postmasterPidFile)) return null;
  try {
    const pid = Number(readFileSync(postmasterPidFile, "utf8").split("\n")[0]?.trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(preferredPort: number, reserved = new Set<number>()): Promise<number> {
  let port = Math.max(1, Math.trunc(preferredPort));
  while (reserved.has(port) || !(await isPortAvailable(port))) {
    port += 1;
  }
  return port;
}

function resolveRepoManagedWorktreesRoot(cwd: string): string | null {
  const normalized = path.resolve(cwd);
  const marker = `${path.sep}.paperclip${path.sep}worktrees${path.sep}`;
  const index = normalized.indexOf(marker);
  if (index === -1) return null;
  const repoRoot = normalized.slice(0, index);
  return path.resolve(repoRoot, ".paperclip", "worktrees");
}

function collectClaimedWorktreePorts(
  homeDir: string,
  currentInstanceId: string,
  cwd: string,
  registeredConfigPaths: Iterable<string> = [],
): {
  serverPorts: Set<number>;
  databasePorts: Set<number>;
} {
  const serverPorts = new Set<number>();
  const databasePorts = new Set<number>();
  const configPaths = new Set<string>();
  for (const configPath of registeredConfigPaths) {
    const resolvedConfigPath = path.resolve(configPath);
    if (resolvedConfigPath !== path.resolve(cwd, ".paperclip", "config.json") && existsSync(resolvedConfigPath)) {
      configPaths.add(resolvedConfigPath);
    }
  }
  const instancesDir = path.resolve(homeDir, "instances");
  if (existsSync(instancesDir)) {
    for (const entry of readdirSync(instancesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === currentInstanceId) continue;

      const configPath = path.resolve(instancesDir, entry.name, "config.json");
      if (existsSync(configPath)) {
        configPaths.add(configPath);
      }
    }
  }

  const repoManagedWorktreesRoot = resolveRepoManagedWorktreesRoot(cwd);
  if (repoManagedWorktreesRoot && existsSync(repoManagedWorktreesRoot)) {
    for (const entry of readdirSync(repoManagedWorktreesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const configPath = path.resolve(repoManagedWorktreesRoot, entry.name, ".paperclip", "config.json");
      if (existsSync(configPath)) {
        configPaths.add(configPath);
      }
    }
  }

  for (const configPath of configPaths) {
    try {
      const config = readConfig(configPath);
      if (config?.server.port) {
        serverPorts.add(config.server.port);
      }
      const databasePort = config?.database.embeddedPostgresPort;
      if (
        typeof databasePort === "number" &&
        Number.isInteger(databasePort) &&
        databasePort > 0
      ) {
        databasePorts.add(databasePort);
      }
    } catch {
      // Ignore malformed sibling configs.
    }
  }

  return { serverPorts, databasePorts };
}

function detectGitBranchName(cwd: string): string | null {
  try {
    const value = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return nonEmpty(value);
  } catch {
    return null;
  }
}

function validateGitBranchName(cwd: string, branchName: string): string {
  const value = nonEmpty(branchName);
  if (!value) {
    throw new Error("必须提供分支名称。");
  }
  try {
    execFileSync("git", ["check-ref-format", "--branch", value], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`分支名称“${branchName}”无效：${extractExecSyncErrorMessage(error) ?? String(error)}`);
  }
  return value;
}

function isPrimaryGitWorktree(cwd: string): boolean {
  const workspace = detectGitWorkspaceInfo(cwd);
  return Boolean(workspace && workspace.gitDir === workspace.commonDir);
}

function resolvePrimaryGitRepoRoot(cwd: string): string {
  const workspace = detectGitWorkspaceInfo(cwd);
  if (!workspace) {
    throw new Error("当前目录不在 Git 仓库中。");
  }
  if (workspace.gitDir === workspace.commonDir) {
    return workspace.root;
  }
  return path.resolve(workspace.commonDir, "..");
}

function resolveRepairWorktreeDirName(branchName: string): string {
  const normalized = branchName.trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return normalized || "worktree";
}

function copyDirectoryContents(sourceDir: string, targetDir: string): boolean {
  if (!existsSync(sourceDir)) return false;

  const entries = readdirSync(sourceDir, { withFileTypes: true });
  if (entries.length === 0) return false;

  mkdirSync(targetDir, { recursive: true });

  let copied = false;
  for (const entry of entries) {
    const sourcePath = path.resolve(sourceDir, entry.name);
    const targetPath = path.resolve(targetDir, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyDirectoryContents(sourcePath, targetPath);
      copied = true;
      continue;
    }

    if (entry.isSymbolicLink()) {
      rmSync(targetPath, { recursive: true, force: true });
      symlinkSync(readlinkSync(sourcePath), targetPath);
      copied = true;
      continue;
    }

    copyFileSync(sourcePath, targetPath);
    try {
      chmodSync(targetPath, statSync(sourcePath).mode & 0o777);
    } catch {
      // best effort
    }
    copied = true;
  }

  return copied;
}

export function copyGitHooksToWorktreeGitDir(cwd: string): CopiedGitHooksResult | null {
  const workspace = detectGitWorkspaceInfo(cwd);
  if (!workspace) return null;

  const sourceHooksPath = workspace.hooksPath;
  const targetHooksPath = path.resolve(workspace.gitDir, "hooks");

  if (sourceHooksPath === targetHooksPath) {
    return {
      sourceHooksPath,
      targetHooksPath,
      copied: false,
    };
  }

  return {
    sourceHooksPath,
    targetHooksPath,
    copied: copyDirectoryContents(sourceHooksPath, targetHooksPath),
  };
}

export function rebindWorkspaceCwd(input: {
  sourceRepoRoot: string;
  targetRepoRoot: string;
  workspaceCwd: string;
}): string | null {
  const sourceRepoRoot = path.resolve(input.sourceRepoRoot);
  const targetRepoRoot = path.resolve(input.targetRepoRoot);
  const workspaceCwd = path.resolve(input.workspaceCwd);
  const relative = path.relative(sourceRepoRoot, workspaceCwd);
  if (!relative || relative === "") {
    return targetRepoRoot;
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return path.resolve(targetRepoRoot, relative);
}

async function rebindSeededProjectWorkspaces(input: {
  targetConnectionString: string;
  currentCwd: string;
}): Promise<SeedWorktreeDatabaseResult["reboundWorkspaces"]> {
  const targetRepo = detectGitWorkspaceInfo(input.currentCwd);
  if (!targetRepo) return [];

  const db = createDb(input.targetConnectionString);
  const closableDb = db as typeof db & {
    $client?: { end?: (opts?: { timeout?: number }) => Promise<void> };
  };

  try {
    const rows = await db
      .select({
        id: projectWorkspaces.id,
        name: projectWorkspaces.name,
        cwd: projectWorkspaces.cwd,
      })
      .from(projectWorkspaces);

    const rebound: SeedWorktreeDatabaseResult["reboundWorkspaces"] = [];
    for (const row of rows) {
      const workspaceCwd = nonEmpty(row.cwd);
      if (!workspaceCwd) continue;

      const sourceRepo = detectGitWorkspaceInfo(workspaceCwd);
      if (!sourceRepo) continue;
      if (sourceRepo.commonDir !== targetRepo.commonDir) continue;

      const reboundCwd = rebindWorkspaceCwd({
        sourceRepoRoot: sourceRepo.root,
        targetRepoRoot: targetRepo.root,
        workspaceCwd,
      });
      if (!reboundCwd) continue;

      const normalizedCurrent = path.resolve(workspaceCwd);
      if (reboundCwd === normalizedCurrent) continue;
      if (!existsSync(reboundCwd)) continue;

      await db
        .update(projectWorkspaces)
        .set({
          cwd: reboundCwd,
          updatedAt: new Date(),
        })
        .where(eq(projectWorkspaces.id, row.id));

      rebound.push({
        name: row.name,
        fromCwd: normalizedCurrent,
        toCwd: reboundCwd,
      });
    }

    return rebound;
  } finally {
    await closableDb.$client?.end?.({ timeout: 5 }).catch(() => undefined);
  }
}

export function resolveSourceConfigPath(opts: WorktreeInitOptions): string {
  if (opts.sourceConfigPathOverride) return path.resolve(opts.sourceConfigPathOverride);
  if (opts.fromConfig) return path.resolve(opts.fromConfig);
  if (!opts.fromDataDir && !opts.fromInstance) {
    return resolveConfigPath();
  }
  const sourceHome = path.resolve(expandHomePrefix(opts.fromDataDir ?? "~/.paperclip"));
  const sourceInstanceId = sanitizeWorktreeInstanceId(opts.fromInstance ?? "default");
  return path.resolve(sourceHome, "instances", sourceInstanceId, "config.json");
}

export function resolveWorktreeReseedSource(input: WorktreeReseedOptions): ResolvedWorktreeReseedSource {
  const fromSelector = nonEmpty(input.from);
  const fromConfig = nonEmpty(input.fromConfig);
  const fromDataDir = nonEmpty(input.fromDataDir);
  const fromInstance = nonEmpty(input.fromInstance);
  const hasExplicitConfigSource = Boolean(fromConfig || fromDataDir || fromInstance);

  if (fromSelector && hasExplicitConfigSource) {
    throw new Error(
      "--from <worktree> 与 --from-config/--from-data-dir/--from-instance 只能选择一种。",
    );
  }

  if (fromSelector) {
    const endpoint = resolveWorktreeEndpointFromSelector(fromSelector, { allowCurrent: true });
    return {
      configPath: endpoint.configPath,
      label: endpoint.label,
    };
  }

  if (hasExplicitConfigSource) {
    const configPath = resolveSourceConfigPath({
      fromConfig: fromConfig ?? undefined,
      fromDataDir: fromDataDir ?? undefined,
      fromInstance: fromInstance ?? undefined,
    });
    return {
      configPath,
      label: configPath,
    };
  }

  throw new Error(
    "请明确传入 --from <worktree> 或 --from-config/--from-instance，以指定唯一的种子数据来源。",
  );
}

function resolveWorktreeRepairSource(input: WorktreeRepairOptions): ResolvedWorktreeReseedSource {
  const fromConfig = nonEmpty(input.fromConfig);
  const fromDataDir = nonEmpty(input.fromDataDir);
  const fromInstance = nonEmpty(input.fromInstance) ?? "default";
  const configPath = resolveSourceConfigPath({
    fromConfig: fromConfig ?? undefined,
    fromDataDir: fromDataDir ?? undefined,
    fromInstance,
  });
  return {
    configPath,
    label: configPath,
  };
}

export function resolveWorktreeReseedTargetPaths(input: {
  configPath: string;
  rootPath: string;
}): WorktreeLocalPaths {
  const envEntries = readPaperclipEnvEntries(resolvePaperclipEnvFile(input.configPath));
  const homeDir = nonEmpty(envEntries.PAPERCLIP_HOME);
  const instanceId = nonEmpty(envEntries.PAPERCLIP_INSTANCE_ID);

  if (!homeDir || !instanceId) {
    throw new Error(
      `目标配置 ${input.configPath} 似乎不是 worktree 本地 Paperclip 实例。相邻的 .env 中应包含 PAPERCLIP_HOME 和 PAPERCLIP_INSTANCE_ID。`,
    );
  }

  return resolveWorktreeLocalPaths({
    cwd: input.rootPath,
    homeDir,
    instanceId,
  });
}

function resolveExistingGitWorktree(selector: string, cwd: string): MergeSourceChoice | null {
  const trimmed = selector.trim();
  if (trimmed.length === 0) return null;

  const directPath = path.resolve(trimmed);
  if (existsSync(directPath)) {
    return {
      worktree: directPath,
      branch: null,
      branchLabel: path.basename(directPath),
      hasPaperclipConfig: existsSync(path.resolve(directPath, ".paperclip", "config.json")),
      isCurrent: directPath === path.resolve(cwd),
    };
  }

  return toMergeSourceChoices(cwd).find((choice) =>
    choice.worktree === directPath
    || path.basename(choice.worktree) === trimmed
    || choice.branchLabel === trimmed
    || choice.branch === trimmed,
  ) ?? null;
}

async function ensureRepairTargetWorktree(input: {
  selector?: string;
  seedMode: WorktreeSeedMode;
  opts: WorktreeRepairOptions;
}): Promise<ResolvedWorktreeRepairTarget | null> {
  const cwd = process.cwd();
  const currentRoot = path.resolve(cwd);
  const currentConfigPath = path.resolve(currentRoot, ".paperclip", "config.json");

  if (!input.selector) {
    if (isPrimaryGitWorktree(cwd)) {
      return null;
    }
    return {
      rootPath: currentRoot,
      configPath: currentConfigPath,
      label: path.basename(currentRoot),
      branchName: detectGitBranchName(cwd),
      created: false,
    };
  }

  const existing = resolveExistingGitWorktree(input.selector, cwd);
  if (existing) {
    return {
      rootPath: existing.worktree,
      configPath: path.resolve(existing.worktree, ".paperclip", "config.json"),
      label: existing.branchLabel,
      branchName: existing.branchLabel === "(detached)" ? null : existing.branchLabel,
      created: false,
    };
  }

  const repoRoot = resolvePrimaryGitRepoRoot(cwd);
  const branchName = validateGitBranchName(repoRoot, input.selector);
  const targetPath = path.resolve(
    repoRoot,
    ".paperclip",
    "worktrees",
    resolveRepairWorktreeDirName(branchName),
  );

  if (existsSync(targetPath)) {
    throw new Error(`目标路径已存在，但不是已注册的 Git worktree：${targetPath}`);
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });

  const spinner = p.spinner();
  spinner.start(`Creating git worktree for ${branchName}...`);
  try {
    execFileSync("git", resolveGitWorktreeAddArgs({
      branchName,
      targetPath,
      branchExists: localBranchExists(repoRoot, branchName),
    }), {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    spinner.stop(`Created git worktree at ${targetPath}.`);
  } catch (error) {
    spinner.stop(pc.red("创建 Git worktree 失败。"));
    throw new Error(extractExecSyncErrorMessage(error) ?? String(error));
  }

  installDependenciesBestEffort(targetPath);

  return {
    rootPath: targetPath,
    configPath: path.resolve(targetPath, ".paperclip", "config.json"),
    label: branchName,
    branchName,
    created: true,
  };
}

function resolveSourceConnectionString(config: PaperclipConfig, envEntries: Record<string, string>, portOverride?: number): string {
  if (config.database.mode === "postgres") {
    const connectionString = nonEmpty(envEntries.DATABASE_URL) ?? nonEmpty(config.database.connectionString);
    if (!connectionString) {
      throw new Error(
        "源实例使用 postgres 模式，但配置文件和相邻 .env 中都没有连接字符串。",
      );
    }
    return connectionString;
  }

  const port = portOverride ?? config.database.embeddedPostgresPort;
  return `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
}

export function copySeededSecretsKey(input: {
  sourceConfigPath: string;
  sourceConfig: PaperclipConfig;
  sourceEnvEntries: Record<string, string>;
  targetKeyFilePath: string;
}): void {
  if (input.sourceConfig.secrets.provider !== "local_encrypted") {
    return;
  }

  mkdirSync(path.dirname(input.targetKeyFilePath), { recursive: true });

  const allowProcessEnvFallback = isCurrentSourceConfigPath(input.sourceConfigPath);
  const sourceInlineMasterKey =
    nonEmpty(input.sourceEnvEntries.PAPERCLIP_SECRETS_MASTER_KEY) ??
    (allowProcessEnvFallback ? nonEmpty(process.env.PAPERCLIP_SECRETS_MASTER_KEY) : null);
  if (sourceInlineMasterKey) {
    writeFileSync(input.targetKeyFilePath, sourceInlineMasterKey, {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      chmodSync(input.targetKeyFilePath, 0o600);
    } catch {
      // best effort
    }
    return;
  }

  const sourceKeyFileOverride =
    nonEmpty(input.sourceEnvEntries.PAPERCLIP_SECRETS_MASTER_KEY_FILE) ??
    (allowProcessEnvFallback ? nonEmpty(process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE) : null);
  const sourceConfiguredKeyPath = sourceKeyFileOverride ?? input.sourceConfig.secrets.localEncrypted.keyFilePath;
  const sourceKeyFilePath = resolveRuntimeLikePath(sourceConfiguredKeyPath, input.sourceConfigPath);

  if (!existsSync(sourceKeyFilePath)) {
    throw new Error(
      `找不到源实例的 local_encrypted 密钥文件：${sourceKeyFilePath}，无法为 worktree 数据库写入种子数据。`,
    );
  }

  copyFileSync(sourceKeyFilePath, input.targetKeyFilePath);
  try {
    chmodSync(input.targetKeyFilePath, 0o600);
  } catch {
    // best effort
  }
}

export async function ensureEmbeddedPostgres(
  dataDir: string,
  preferredPort: number,
  options: { allowExisting?: boolean } = {},
): Promise<EmbeddedPostgresHandle> {
  const moduleName = "embedded-postgres";
  let EmbeddedPostgres: EmbeddedPostgresCtor;
  try {
    const mod = await loadWithoutEmbeddedPostgresExitHooks(() => import(moduleName));
    EmbeddedPostgres = mod.default as EmbeddedPostgresCtor;
  } catch {
    throw new Error(
      "嵌入式 PostgreSQL 需要 `embedded-postgres` 依赖。请重新安装依赖后重试。",
    );
  }
  await prepareEmbeddedPostgresNativeRuntime();

  const postmasterPidFile = path.resolve(dataDir, "postmaster.pid");
  const runningPid = readRunningPostmasterPid(postmasterPidFile);
  if (runningPid) {
    if (options.allowExisting === false) {
      throw new Error(
        `目标内嵌 PostgreSQL 已在运行（数据目录 ${dataDir}，pid=${runningPid}）。`
        + "请停止使用此数据库的 worktree 服务，然后重试种子数据操作。",
      );
    }
    return {
      port: readPidFilePort(postmasterPidFile) ?? preferredPort,
      startedByThisProcess: false,
      stop: async () => {},
    };
  }

  const port = await findAvailablePort(preferredPort);
  const logBuffer = createEmbeddedPostgresLogBuffer();
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "paperclip",
    password: "paperclip",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: logBuffer.append,
    onError: logBuffer.append,
  });

  if (!existsSync(path.resolve(dataDir, "PG_VERSION"))) {
    try {
      await instance.initialise();
    } catch (error) {
      throw formatEmbeddedPostgresError(error, {
        fallbackMessage: `在 ${dataDir} 初始化嵌入式 PostgreSQL 集群失败（端口 ${port}）`,
        recentLogs: logBuffer.getRecentLogs(),
      });
    }
  }
  if (existsSync(postmasterPidFile)) {
    rmSync(postmasterPidFile, { force: true });
  }
  try {
    await instance.start();
  } catch (error) {
    throw formatEmbeddedPostgresError(error, {
      fallbackMessage: `在端口 ${port} 启动嵌入式 PostgreSQL 失败`,
      recentLogs: logBuffer.getRecentLogs(),
    });
  }

  return {
    port,
    startedByThisProcess: true,
    stop: async () => {
      await instance.stop();
    },
  };
}

export async function pauseSeededScheduledRoutines(connectionString: string): Promise<number> {
  const db = createDb(connectionString);
  try {
    const scheduledRoutineIds = await db
      .selectDistinct({ routineId: routineTriggers.routineId })
      .from(routineTriggers)
      .where(and(eq(routineTriggers.kind, "schedule"), eq(routineTriggers.enabled, true)));
    const idsToPause = scheduledRoutineIds
      .map((row) => row.routineId)
      .filter((value): value is string => Boolean(value));

    if (idsToPause.length === 0) {
      return 0;
    }

    const paused = await db
      .update(routines)
      .set({
        status: "paused",
        updatedAt: new Date(),
      })
      .where(and(inArray(routines.id, idsToPause), sql`${routines.status} <> 'paused'`, sql`${routines.status} <> 'archived'`))
      .returning({ id: routines.id });

    return paused.length;
  } finally {
    await db.$client?.end?.({ timeout: 5 }).catch(() => undefined);
  }
}

const EMPTY_SEEDED_WORKTREE_EXECUTION_QUARANTINE_SUMMARY: SeededWorktreeExecutionQuarantineSummary = {
  disabledTimerHeartbeats: 0,
  resetRunningAgents: 0,
  quarantinedInProgressIssues: 0,
  unassignedTodoIssues: 0,
  unassignedReviewIssues: 0,
  stoppedProjectWorkspaceRuntimes: 0,
  stoppedExecutionWorkspaceRuntimes: 0,
  stoppedRuntimeServices: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEnabledValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeWorktreeRuntimeConfig(runtimeConfig: unknown): {
  runtimeConfig: Record<string, unknown>;
  disabledTimerHeartbeat: boolean;
  changed: boolean;
} {
  const nextRuntimeConfig = isRecord(runtimeConfig) ? { ...runtimeConfig } : {};
  const heartbeat = isRecord(nextRuntimeConfig.heartbeat) ? { ...nextRuntimeConfig.heartbeat } : null;
  if (!heartbeat) {
    return { runtimeConfig: nextRuntimeConfig, disabledTimerHeartbeat: false, changed: false };
  }

  const disabledTimerHeartbeat = isEnabledValue(heartbeat.enabled);
  if (heartbeat.enabled !== false) {
    heartbeat.enabled = false;
    nextRuntimeConfig.heartbeat = heartbeat;
    return { runtimeConfig: nextRuntimeConfig, disabledTimerHeartbeat, changed: true };
  }

  return { runtimeConfig: nextRuntimeConfig, disabledTimerHeartbeat: false, changed: false };
}

function stopSeededWorkspaceRuntime(
  metadata: unknown,
  configKey: "config" | "runtimeConfig",
): { metadata: Record<string, unknown>; changed: boolean } {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {};
  const currentConfig = isRecord(nextMetadata[configKey])
    ? { ...(nextMetadata[configKey] as Record<string, unknown>) }
    : null;
  if (!currentConfig) return { metadata: nextMetadata, changed: false };

  let changed = false;
  if (currentConfig.desiredState === "running") {
    currentConfig.desiredState = "stopped";
    changed = true;
  }

  if (isRecord(currentConfig.serviceStates)) {
    const nextServiceStates = { ...currentConfig.serviceStates };
    for (const [serviceIndex, state] of Object.entries(nextServiceStates)) {
      if (state !== "running") continue;
      nextServiceStates[serviceIndex] = "stopped";
      changed = true;
    }
    if (changed) currentConfig.serviceStates = nextServiceStates;
  }

  if (changed) nextMetadata[configKey] = currentConfig;
  return { metadata: nextMetadata, changed };
}

export async function quarantineSeededWorktreeExecutionState(
  connectionString: string,
): Promise<SeededWorktreeExecutionQuarantineSummary> {
  const db = createDb(connectionString);
  const summary = { ...EMPTY_SEEDED_WORKTREE_EXECUTION_QUARANTINE_SUMMARY };
  try {
    await db.transaction(async (tx) => {
      const seededAgents = await tx
        .select({
          id: agents.id,
          status: agents.status,
          runtimeConfig: agents.runtimeConfig,
        })
        .from(agents);

      for (const agent of seededAgents) {
        const normalized = normalizeWorktreeRuntimeConfig(agent.runtimeConfig);
        const nextStatus = agent.status === "running" ? "idle" : agent.status;
        if (normalized.disabledTimerHeartbeat) {
          summary.disabledTimerHeartbeats += 1;
        }
        if (agent.status === "running") {
          summary.resetRunningAgents += 1;
        }
        if (normalized.changed || nextStatus !== agent.status) {
          await tx
            .update(agents)
            .set({
              runtimeConfig: normalized.runtimeConfig,
              status: nextStatus,
              updatedAt: new Date(),
            })
            .where(eq(agents.id, agent.id));
        }
      }

      const affectedIssues = await tx
        .select({
          id: issues.id,
          companyId: issues.companyId,
          status: issues.status,
        })
        .from(issues)
        .where(
          and(
            sql`${issues.assigneeAgentId} is not null`,
            sql`${issues.assigneeUserId} is null`,
            inArray(issues.status, ["todo", "in_progress", "in_review"]),
          ),
        );

      for (const issue of affectedIssues) {
        const nextStatus = issue.status === "in_progress" ? "blocked" : issue.status;
        await tx
          .update(issues)
          .set({
            status: nextStatus,
            assigneeAgentId: null,
            checkoutRunId: null,
            executionRunId: null,
            executionAgentNameKey: null,
            executionLockedAt: null,
            executionWorkspaceId: null,
            updatedAt: new Date(),
          })
          .where(eq(issues.id, issue.id));

        if (issue.status === "in_progress") {
          summary.quarantinedInProgressIssues += 1;
          await tx.insert(issueComments).values({
            companyId: issue.companyId,
            issueId: issue.id,
            body:
              "Quarantined during worktree seed so copied in-flight work does not auto-run in this isolated instance. " +
              "Reassign or unblock here only if you intentionally want the worktree instance to own this task.",
          });
        } else if (issue.status === "todo") {
          summary.unassignedTodoIssues += 1;
        } else if (issue.status === "in_review") {
          summary.unassignedReviewIssues += 1;
        }
      }

      const seededProjectWorkspaces = await tx
        .select({ id: projectWorkspaces.id, metadata: projectWorkspaces.metadata })
        .from(projectWorkspaces);
      for (const workspace of seededProjectWorkspaces) {
        const stopped = stopSeededWorkspaceRuntime(workspace.metadata, "runtimeConfig");
        if (!stopped.changed) continue;
        await tx
          .update(projectWorkspaces)
          .set({ metadata: stopped.metadata, updatedAt: new Date() })
          .where(eq(projectWorkspaces.id, workspace.id));
        summary.stoppedProjectWorkspaceRuntimes += 1;
      }

      const seededExecutionWorkspaces = await tx
        .select({ id: executionWorkspaces.id, metadata: executionWorkspaces.metadata })
        .from(executionWorkspaces);
      for (const workspace of seededExecutionWorkspaces) {
        const stopped = stopSeededWorkspaceRuntime(workspace.metadata, "config");
        if (!stopped.changed) continue;
        await tx
          .update(executionWorkspaces)
          .set({ metadata: stopped.metadata, updatedAt: new Date() })
          .where(eq(executionWorkspaces.id, workspace.id));
        summary.stoppedExecutionWorkspaceRuntimes += 1;
      }

      const now = new Date();
      const stoppedRuntimeServices = await tx
        .update(workspaceRuntimeServices)
        .set({
          status: "stopped",
          healthStatus: "unknown",
          providerRef: null,
          ownerAgentId: null,
          startedByRunId: null,
          port: null,
          url: null,
          stoppedAt: now,
          lastUsedAt: now,
          updatedAt: now,
        })
        .returning({ id: workspaceRuntimeServices.id });
      summary.stoppedRuntimeServices = stoppedRuntimeServices.length;
    });

    return summary;
  } finally {
    await db.$client?.end?.({ timeout: 5 }).catch(() => undefined);
  }
}

type WorktreeSeedValidationExpectation = {
  adminUserId: string;
  representativeCompanyId: string;
  representativeIssueId: string;
};

export function requiresWorktreeSeedCredentialAccount(
  deploymentMode: PaperclipConfig["server"]["deploymentMode"],
): boolean {
  return deploymentMode === "authenticated";
}

export function resolveWorktreeSeedMigrationRevision(
  migrationState: Awaited<ReturnType<typeof inspectMigrations>>,
  requirement: "sourcePrefix" | "upToDate",
): string {
  const expectedAppliedPrefix = migrationState.availableMigrations.slice(
    0,
    migrationState.appliedMigrations.length,
  );
  const appliedMigrationNames = new Set(migrationState.appliedMigrations);
  if (
    appliedMigrationNames.size !== expectedAppliedPrefix.length ||
    expectedAppliedPrefix.some((migration) => !appliedMigrationNames.has(migration))
  ) {
    throw new Error("迁移日志不是此 Paperclip 检出版本迁移日志的前缀。");
  }

  if (requirement === "upToDate" && migrationState.status !== "upToDate") {
    throw new Error(
      `迁移日志尚未更新（有 ${migrationState.pendingMigrations.length} 个迁移待处理）。`,
    );
  }

  const migrationRevision = expectedAppliedPrefix.at(-1);
  if (!migrationRevision) {
    throw new Error("迁移日志中没有已应用的版本。");
  }
  return migrationRevision;
}

/**
 * Markerless worktrees predate the versioned seed manifest. Adopt one only
 * after proving that its configured database already has a compatible
 * migration journal and the core Paperclip tables. The physical PG_VERSION
 * check prevents this read-only probe from initializing a missing embedded
 * database and then mistaking that empty cluster for legacy evidence.
 */
export async function inspectLegacyWorktreeDatabase(
  configPath: string,
): Promise<LegacyWorktreeDatabaseEvidence | null> {
  const config = readConfig(configPath);
  if (!config) return null;

  const envEntries = readPaperclipEnvEntries(resolvePaperclipEnvFile(configPath));
  let embeddedHandle: EmbeddedPostgresHandle | null = null;
  let db: ReturnType<typeof createDb> | null = null;
  try {
    if (config.database.mode === "embedded-postgres") {
      const dataDir = resolveRuntimeLikePath(config.database.embeddedPostgresDataDir, configPath);
      if (!existsSync(path.join(dataDir, "PG_VERSION"))) return null;
      embeddedHandle = await ensureEmbeddedPostgres(dataDir, config.database.embeddedPostgresPort);
    }

    const connectionString = resolveSourceConnectionString(config, envEntries, embeddedHandle?.port);
    const migrationRevision = resolveWorktreeSeedMigrationRevision(
      await inspectMigrations(connectionString),
      "sourcePrefix",
    );
    db = createDb(connectionString);
    await Promise.all([
      db.select({ id: authUsers.id }).from(authUsers).limit(1),
      db.select({ id: companies.id }).from(companies).limit(1),
      db.select({ id: issues.id }).from(issues).limit(1),
    ]);
    return { migrationRevision };
  } catch {
    return null;
  } finally {
    await db?.$client?.end?.({ timeout: 5 }).catch(() => undefined);
    if (embeddedHandle?.startedByThisProcess) {
      await embeddedHandle.stop().catch(() => undefined);
    }
  }
}

async function inspectVerifiedSeedDatabase(
  connectionString: string,
  options: {
    deploymentMode: PaperclipConfig["server"]["deploymentMode"];
    expected?: WorktreeSeedValidationExpectation;
    migrationRequirement?: "sourcePrefix" | "upToDate";
    requiredCompanyId?: string;
  },
): Promise<{ summary: WorktreeSeedValidationSummary; expectation: WorktreeSeedValidationExpectation }> {
  const {
    deploymentMode,
    expected,
    migrationRequirement = "upToDate",
    requiredCompanyId,
  } = options;
  const requiresCredentialAccount = requiresWorktreeSeedCredentialAccount(deploymentMode);
  const migrationState = await inspectMigrations(connectionString);
  const migrationRevision = resolveWorktreeSeedMigrationRevision(
    migrationState,
    migrationRequirement,
  );

  const db = createDb(connectionString);
  try {
    const [counts] = await db
      .select({
        authUserCount: sql<number>`count(distinct ${authUsers.id})::int`,
        credentialAccountCount: sql<number>`count(distinct ${authAccounts.id})::int`,
        instanceAdminCount: sql<number>`count(distinct ${instanceUserRoles.userId})::int`,
        activeMembershipCount: sql<number>`count(distinct ${companyMemberships.id})::int`,
        companyCount: sql<number>`count(distinct ${companies.id})::int`,
        issueCount: sql<number>`count(distinct ${issues.id})::int`,
      })
      .from(authUsers)
      .leftJoin(authAccounts, eq(authAccounts.userId, authUsers.id))
      .leftJoin(
        instanceUserRoles,
        and(eq(instanceUserRoles.userId, authUsers.id), eq(instanceUserRoles.role, "instance_admin")),
      )
      .leftJoin(
        companyMemberships,
        and(
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, authUsers.id),
          eq(companyMemberships.status, "active"),
        ),
      )
      .leftJoin(companies, eq(companies.id, companyMemberships.companyId))
      .leftJoin(issues, eq(issues.companyId, companies.id));

    const admin = await db
      .select({ userId: authUsers.id })
      .from(authUsers)
      .innerJoin(
        instanceUserRoles,
        and(eq(instanceUserRoles.userId, authUsers.id), eq(instanceUserRoles.role, "instance_admin")),
      )
      .leftJoin(
        authAccounts,
        eq(authAccounts.userId, authUsers.id),
      )
      .innerJoin(
        companyMemberships,
        and(
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, authUsers.id),
          eq(companyMemberships.status, "active"),
        ),
      )
      .where(and(
        expected ? eq(authUsers.id, expected.adminUserId) : undefined,
        requiredCompanyId ? eq(companyMemberships.companyId, requiredCompanyId) : undefined,
        requiresCredentialAccount
          ? and(
              sql`length(trim(${authAccounts.providerId})) > 0`,
              sql`length(trim(${authAccounts.accountId})) > 0`,
            )
          : undefined,
      ))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!admin) {
      throw new Error(
        requiresCredentialAccount
          ? "没有用户同时具备有效凭据、instance-admin 角色和有效公司成员资格。authenticated worktree 写入种子数据需要具备凭据的实例管理员。"
          : "No auth user has an instance-admin role and active company membership for local-trusted worktree seeding.",
      );
    }

    const representative = await db
      .select({ companyId: companies.id, issueId: issues.id })
      .from(companies)
      .innerJoin(issues, eq(issues.companyId, companies.id))
      .where(
        and(
          expected ? eq(companies.id, expected.representativeCompanyId) : undefined,
          expected ? eq(issues.id, expected.representativeIssueId) : undefined,
          requiredCompanyId ? eq(companies.id, requiredCompanyId) : undefined,
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!representative) {
      throw new Error("无法读取可用的克隆公司和任务示例。");
    }

    const summary: WorktreeSeedValidationSummary = {
      authUserCount: counts?.authUserCount ?? 0,
      credentialAccountCount: counts?.credentialAccountCount ?? 0,
      instanceAdminCount: counts?.instanceAdminCount ?? 0,
      activeMembershipCount: counts?.activeMembershipCount ?? 0,
      companyCount: counts?.companyCount ?? 0,
      issueCount: counts?.issueCount ?? 0,
      representativeCompanyId: representative.companyId,
      representativeIssueId: representative.issueId,
      migrationRevision,
    };
    if (
      summary.authUserCount < 1
      || (requiresCredentialAccount && summary.credentialAccountCount < 1)
      || summary.instanceAdminCount < 1
      || summary.activeMembershipCount < 1
      || summary.companyCount < 1
      || summary.issueCount < 1
    ) {
      throw new Error("种子数据校验发现身份验证、成员关系、公司或任务数据不完整。");
    }

    return {
      summary,
      expectation: {
        adminUserId: admin.userId,
        representativeCompanyId: representative.companyId,
        representativeIssueId: representative.issueId,
      },
    };
  } finally {
    await db.$client?.end?.({ timeout: 5 }).catch(() => undefined);
  }
}

async function seedWorktreeDatabase(input: {
  sourceConfigPath: string;
  sourceConfig: PaperclipConfig;
  targetConfig: PaperclipConfig;
  targetPaths: WorktreeLocalPaths;
  instanceId: string;
  seedMode: WorktreeSeedMode;
  preserveLiveWork?: boolean;
  expectedCompanyId?: string;
  onPhase?: (phase: WorktreeSeedPhase, status: "started" | "succeeded", message?: string) => void;
}): Promise<SeedWorktreeDatabaseResult> {
  const seedPlan = resolveWorktreeSeedPlan(input.seedMode);
  const sourceEnvFile = resolvePaperclipEnvFile(input.sourceConfigPath);
  const sourceEnvEntries = readPaperclipEnvEntries(sourceEnvFile);
  let sourceHandle: EmbeddedPostgresHandle | null = null;
  let targetHandle: EmbeddedPostgresHandle | null = null;

  try {
    if (input.sourceConfig.database.mode === "embedded-postgres") {
      sourceHandle = await ensureEmbeddedPostgres(
        input.sourceConfig.database.embeddedPostgresDataDir,
        input.sourceConfig.database.embeddedPostgresPort,
      );
      const sourceAdminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${sourceHandle.port}/postgres`;
      await ensurePostgresDatabase(sourceAdminConnectionString, "paperclip");
    }
    const sourceConnectionString = resolveSourceConnectionString(
      input.sourceConfig,
      sourceEnvEntries,
      sourceHandle?.port,
    );
    input.onPhase?.("source_validation", "started");
    const sourceValidation = await inspectVerifiedSeedDatabase(
      sourceConnectionString,
      {
        deploymentMode: input.sourceConfig.server.deploymentMode,
        migrationRequirement: "sourcePrefix",
        requiredCompanyId: input.expectedCompanyId,
      },
    );
    input.onPhase?.(
      "source_validation",
      "succeeded",
      `Validated migration ${sourceValidation.summary.migrationRevision}, ${sourceValidation.summary.companyCount} company record(s), and ${sourceValidation.summary.issueCount} issue record(s).`,
    );
    copySeededSecretsKey({
      sourceConfigPath: input.sourceConfigPath,
      sourceConfig: input.sourceConfig,
      sourceEnvEntries,
      targetKeyFilePath: input.targetPaths.secretsKeyFilePath,
    });

    const snapshotAt = new Date().toISOString();
    input.onPhase?.("snapshot", "started");
    const backup = await runDatabaseBackup({
      connectionString: sourceConnectionString,
      backupDir: path.resolve(input.targetPaths.backupDir, "seed"),
      retention: { dailyDays: 7, weeklyWeeks: 4, monthlyMonths: 1 },
      filenamePrefix: `${input.instanceId}-seed`,
      backupEngine: resolveWorktreeSeedBackupEngine(seedPlan),
      includeMigrationJournal: true,
      excludeTables: seedPlan.excludedTables,
      nullifyColumns: seedPlan.nullifyColumns,
    });
    input.onPhase?.("snapshot", "succeeded", `Created ${path.basename(backup.backupFile)}.`);

    input.onPhase?.("restore", "started");
    targetHandle = await ensureEmbeddedPostgres(
      input.targetConfig.database.embeddedPostgresDataDir,
      input.targetConfig.database.embeddedPostgresPort,
      { allowExisting: false },
    );

    const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${targetHandle.port}/postgres`;
    await resetPostgresDatabase(adminConnectionString, "paperclip");
    const targetConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${targetHandle.port}/paperclip`;
    await runDatabaseRestore({
      connectionString: targetConnectionString,
      backupFile: backup.backupFile,
    });
    input.onPhase?.("restore", "succeeded");
    input.onPhase?.("migrations", "started");
    await applyPendingMigrations(targetConnectionString);
    input.onPhase?.("migrations", "succeeded");
    input.onPhase?.("execution_quarantine", "started");
    const executionQuarantine = input.preserveLiveWork
      ? { ...EMPTY_SEEDED_WORKTREE_EXECUTION_QUARANTINE_SUMMARY }
      : await quarantineSeededWorktreeExecutionState(targetConnectionString);
    input.onPhase?.(
      "execution_quarantine",
      "succeeded",
      input.preserveLiveWork
        ? "Preserved copied live work by explicit request."
        : formatSeededWorktreeExecutionQuarantineSummary(executionQuarantine),
    );
    input.onPhase?.("routine_pause", "started");
    const pausedScheduledRoutines = await pauseSeededScheduledRoutines(targetConnectionString);
    input.onPhase?.("routine_pause", "succeeded", `Paused ${pausedScheduledRoutines} scheduled routine(s).`);
    input.onPhase?.("workspace_rebind", "started");
    const reboundWorkspaces = await rebindSeededProjectWorkspaces({
      targetConnectionString,
      currentCwd: input.targetPaths.cwd,
    });
    input.onPhase?.("workspace_rebind", "succeeded", `Rebound ${reboundWorkspaces.length} workspace path(s).`);
    input.onPhase?.("post_restore_validation", "started");
    const targetValidation = await inspectVerifiedSeedDatabase(
      targetConnectionString,
      {
        deploymentMode: input.targetConfig.server.deploymentMode,
        expected: sourceValidation.expectation,
      },
    );
    input.onPhase?.(
      "post_restore_validation",
      "succeeded",
      `Validated migration ${targetValidation.summary.migrationRevision}.`,
    );

    return {
      backupSummary: formatDatabaseBackupResult(backup),
      snapshotAt,
      migrationRevision: targetValidation.summary.migrationRevision,
      pausedScheduledRoutines,
      executionQuarantine,
      reboundWorkspaces,
      validation: targetValidation.summary,
    };
  } finally {
    if (targetHandle?.startedByThisProcess) {
      await targetHandle.stop();
    }
    if (sourceHandle?.startedByThisProcess) {
      await sourceHandle.stop();
    }
  }
}

const WORKTREE_SEED_DIAGNOSTIC_LIMIT = 32;
const WORKTREE_SEED_DIAGNOSTIC_MESSAGE_LIMIT = 512;
const activeSeedInterruptHandlers = new Map<string, (signal: NodeJS.Signals) => void>();

export function formatWorktreeSeedFailureDiagnostic(
  phase: WorktreeSeedPhase,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    phase === "restore"
    && /database system is shutting down|terminating connection due to administrator command/i.test(message)
  ) {
    return "恢复期间目标内嵌 PostgreSQL 已关闭。请停止其他 worktree 服务后重试种子数据导入。";
  }
  if (phase === "restore" && /Cannot seed target embedded PostgreSQL.+already running/i.test(message)) {
    return "目标内嵌 PostgreSQL 正由运行中的 worktree 服务使用。请停止该服务后重试种子数据导入。";
  }
  if (
    /No auth user has a non-empty credential account, instance-admin role, and active company membership/i.test(
      message,
    )
  ) {
    return "种子数据校验未找到具备凭据且拥有有效公司成员资格的实例管理员。authenticated 实例须先创建管理员或登录后才能导入种子数据。";
  }
  return `种子数据操作在 ${phase} 阶段失败。`;
}

function dispatchSeedInterruption(signal: NodeJS.Signals): void {
  for (const handler of activeSeedInterruptHandlers.values()) {
    try {
      handler(signal);
    } catch {
      // Continue terminalizing the other active manifests before exiting.
    }
  }
  process.exit(signal === "SIGINT" ? 130 : 143);
}

const dispatchSeedSigint = () => dispatchSeedInterruption("SIGINT");
const dispatchSeedSigterm = () => dispatchSeedInterruption("SIGTERM");

function registerSeedInterruptHandler(handler: (signal: NodeJS.Signals) => void): () => void {
  const id = randomUUID();
  if (activeSeedInterruptHandlers.size === 0) {
    process.once("SIGINT", dispatchSeedSigint);
    process.once("SIGTERM", dispatchSeedSigterm);
  }
  activeSeedInterruptHandlers.set(id, handler);
  return () => {
    activeSeedInterruptHandlers.delete(id);
    if (activeSeedInterruptHandlers.size === 0) {
      process.off("SIGINT", dispatchSeedSigint);
      process.off("SIGTERM", dispatchSeedSigterm);
    }
  };
}

type LegacyWorktreeSeedPendingMarker = {
  version: 1;
  state: "pending";
  sourceConfigPath: string;
};

function resolveSeedInstanceId(configPath: string): string {
  const envEntries = readPaperclipEnvEntries(resolvePaperclipEnvFile(configPath));
  return nonEmpty(envEntries.PAPERCLIP_INSTANCE_ID)
    ?? sanitizeWorktreeInstanceId(path.basename(path.dirname(path.resolve(configPath))));
}

function writeWorktreeSeedManifest(filePath: string, manifest: WorktreeSeedManifest): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

export function readWorktreeSeedManifest(configPath: string): WorktreeSeedManifest | null {
  const manifestPath = resolveWorktreeSeedMarkerPaths(configPath).manifest;
  if (!existsSync(manifestPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid worktree seed manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const value = parsed as Partial<WorktreeSeedManifest>;
  const diagnosticsValid = Array.isArray(value.diagnostics) && value.diagnostics.every((diagnostic) => (
    diagnostic
    && typeof diagnostic === "object"
    && WORKTREE_SEED_PHASES.includes(diagnostic.phase)
    && ["started", "succeeded", "failed"].includes(diagnostic.status)
    && typeof diagnostic.at === "string"
    && (diagnostic.message === undefined || typeof diagnostic.message === "string")
  ));
  const verifiedTerminalValid = value.state !== "verified" || (
    value.phase === "complete"
    && typeof value.snapshotAt === "string"
    && value.snapshotAt.length > 0
    && typeof value.migrationRevision === "string"
    && value.migrationRevision.length > 0
    && typeof value.startedAt === "string"
    && typeof value.finishedAt === "string"
    && value.diagnostics?.some((diagnostic) => (
      diagnostic.phase === "complete" && diagnostic.status === "succeeded"
    )) === true
  );
  if (
    !value
    || typeof value !== "object"
    || value.version !== 2
    || !value.source
    || typeof value.source.instanceId !== "string"
    || typeof value.source.configPath !== "string"
    || typeof value.targetInstanceId !== "string"
    || value.targetInstanceId.length === 0
    || !isWorktreeSeedMode(String(value.seedMode ?? ""))
    || !WORKTREE_SEED_PHASES.includes(value.phase as WorktreeSeedPhase)
    || !["pending", "running", "verified", "failed"].includes(String(value.state ?? ""))
    || typeof value.attemptId !== "string"
    || value.attemptId.length === 0
    || !diagnosticsValid
    || !verifiedTerminalValid
  ) {
    throw new Error(`worktree 种子清单无效：${manifestPath}。`);
  }
  return value as WorktreeSeedManifest;
}

export function markWorktreeSeedPending(input: {
  configPath: string;
  sourceConfigPath: string;
  targetInstanceId?: string;
  seedMode?: WorktreeSeedMode;
  now?: Date;
  diagnosticMessage?: string;
}): void {
  const markers = resolveWorktreeSeedMarkerPaths(input.configPath);
  const at = (input.now ?? new Date()).toISOString();
  writeWorktreeSeedManifest(markers.manifest, {
    version: 2,
    source: {
      instanceId: resolveSeedInstanceId(input.sourceConfigPath),
      configPath: path.resolve(input.sourceConfigPath),
    },
    snapshotAt: null,
    seedMode: input.seedMode ?? "minimal",
    migrationRevision: null,
    targetInstanceId: input.targetInstanceId ?? resolveSeedInstanceId(input.configPath),
    phase: "pending",
    state: "pending",
    attemptId: randomUUID(),
    startedAt: null,
    finishedAt: null,
    diagnostics: [{
      phase: "pending",
      status: "succeeded",
      at,
      ...(input.diagnosticMessage
        ? { message: input.diagnosticMessage.slice(0, WORKTREE_SEED_DIAGNOSTIC_MESSAGE_LIMIT) }
        : {}),
    }],
  });
  // New manifests are authoritative. Legacy files are removed so no caller can
  // mistake a stale binary marker for current verified seed state.
  rmSync(markers.complete, { force: true });
  rmSync(markers.pending, { force: true });
}

function updateWorktreeSeedManifest(input: {
  configPath: string;
  phase: WorktreeSeedPhase;
  status: "started" | "succeeded" | "failed";
  state?: WorktreeSeedManifest["state"];
  message?: string;
  snapshotAt?: string | null;
  migrationRevision?: string | null;
  now?: Date;
}): WorktreeSeedManifest {
  const markers = resolveWorktreeSeedMarkerPaths(input.configPath);
  const current = readWorktreeSeedManifest(input.configPath);
  if (!current) throw new Error(`worktree 种子清单不存在：${markers.manifest}。`);
  const at = (input.now ?? new Date()).toISOString();
  const nextState = input.state ?? current.state;
  const diagnostic = {
    phase: input.phase,
    status: input.status,
    at,
    ...(input.message
      ? { message: input.message.slice(0, WORKTREE_SEED_DIAGNOSTIC_MESSAGE_LIMIT) }
      : {}),
  };
  const next: WorktreeSeedManifest = {
    ...current,
    phase: input.phase,
    state: nextState,
    snapshotAt: input.snapshotAt === undefined ? current.snapshotAt : input.snapshotAt,
    migrationRevision:
      input.migrationRevision === undefined ? current.migrationRevision : input.migrationRevision,
    startedAt: current.startedAt ?? (input.status === "started" ? at : null),
    finishedAt: nextState === "verified" || nextState === "failed" ? at : null,
    diagnostics: [...current.diagnostics, diagnostic].slice(-WORKTREE_SEED_DIAGNOSTIC_LIMIT),
  };
  writeWorktreeSeedManifest(markers.manifest, next);
  return next;
}

function readLegacyWorktreeSeedPendingMarker(filePath: string): LegacyWorktreeSeedPendingMarker {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid worktree seed-pending marker at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    !parsed
    || typeof parsed !== "object"
    || (parsed as { version?: unknown }).version !== 1
    || (parsed as { state?: unknown }).state !== "pending"
    || typeof (parsed as { sourceConfigPath?: unknown }).sourceConfigPath !== "string"
    || !(parsed as { sourceConfigPath: string }).sourceConfigPath.trim()
  ) {
    throw new Error(`worktree 待初始化标记无效：${filePath}。`);
  }

  return parsed as LegacyWorktreeSeedPendingMarker;
}

const WORKTREE_SEED_LOCK_POLL_MS = 50;
const WORKTREE_SEED_LOCK_MALFORMED_STALE_MS = 60_000;

type WorktreeSeedLockOwner = {
  version: 1;
  pid: number;
  token: string;
  createdAt: string;
};

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function parseWorktreeSeedLockOwner(raw: string): WorktreeSeedLockOwner | null {
  try {
    const value = JSON.parse(raw) as Partial<WorktreeSeedLockOwner>;
    if (
      value.version !== 1
      || !Number.isInteger(value.pid)
      || (value.pid ?? 0) <= 0
      || typeof value.token !== "string"
      || !value.token
      || typeof value.createdAt !== "string"
      || !value.createdAt
    ) {
      return null;
    }
    return value as WorktreeSeedLockOwner;
  } catch {
    return null;
  }
}

async function acquireWorktreeSeedLock(lockPath: string): Promise<() => Promise<void>> {
  while (true) {
    const owner: WorktreeSeedLockOwner = {
      version: 1,
      pid: process.pid,
      token: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    try {
      const handle = await fsPromises.open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
      } catch (error) {
        await handle.close();
        await fsPromises.rm(lockPath, { force: true });
        throw error;
      }
      await handle.close();
      return async () => {
        const current = await fsPromises.readFile(lockPath, "utf8").catch(() => null);
        if (current && parseWorktreeSeedLockOwner(current)?.token === owner.token) {
          await fsPromises.rm(lockPath, { force: true });
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    const [rawOwner, lockStat] = await Promise.all([
      fsPromises.readFile(lockPath, "utf8").catch(() => null),
      fsPromises.stat(lockPath).catch(() => null),
    ]);
    const currentOwner = rawOwner ? parseWorktreeSeedLockOwner(rawOwner) : null;
    const malformedLockIsStale = Boolean(
      lockStat && Date.now() - lockStat.mtimeMs >= WORKTREE_SEED_LOCK_MALFORMED_STALE_MS,
    );
    if (currentOwner && !processIsAlive(currentOwner.pid)) {
      throw new Error(
        `Worktree 种子数据锁 ${lockPath} 属于已退出的进程 ${currentOwner.pid}。`
        + "请确认没有种子数据操作正在运行，然后删除过期锁并重试。",
      );
    }
    if (!currentOwner && malformedLockIsStale) {
      throw new Error(
        `Worktree 种子数据锁 ${lockPath} 已过期或格式错误。`
        + "请确认没有种子数据操作正在运行，然后删除过期锁并重试。",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, WORKTREE_SEED_LOCK_POLL_MS));
  }
}

function startWorktreeSeedAttempt(configPath: string, now = new Date()): WorktreeSeedManifest {
  const markers = resolveWorktreeSeedMarkerPaths(configPath);
  const current = readWorktreeSeedManifest(configPath);
  if (!current) throw new Error(`worktree 种子清单不存在：${markers.manifest}。`);
  const at = now.toISOString();
  const next: WorktreeSeedManifest = {
    ...current,
    state: "running",
    phase: "pending",
    attemptId: randomUUID(),
    snapshotAt: null,
    migrationRevision: null,
    startedAt: at,
    finishedAt: null,
    diagnostics: [
      ...current.diagnostics,
      { phase: "pending" as const, status: "started" as const, at },
    ].slice(-WORKTREE_SEED_DIAGNOSTIC_LIMIT),
  };
  writeWorktreeSeedManifest(markers.manifest, next);
  return next;
}

async function runVerifiedWorktreeSeed(input: {
  configPath: string;
  sourceConfigPath: string;
  sourceConfig: PaperclipConfig;
  targetConfig: PaperclipConfig;
  targetPaths: WorktreeLocalPaths;
  instanceId: string;
  seedMode: WorktreeSeedMode;
  preserveLiveWork?: boolean;
  expectedCompanyId?: string;
  seedDatabase: SeedWorktreeDatabase;
}): Promise<SeedWorktreeDatabaseResult> {
  let activePhase: WorktreeSeedPhase = "pending";
  const previous = readWorktreeSeedManifest(input.configPath);
  if (previous?.state === "running") {
    updateWorktreeSeedManifest({
      configPath: input.configPath,
      phase: previous.phase,
      status: "failed",
      state: "failed",
      message: "上一次种子数据尝试结束时没有最终结果。",
    });
  }
  startWorktreeSeedAttempt(input.configPath);

  const unregisterInterruption = registerSeedInterruptHandler((signal) => {
    updateWorktreeSeedManifest({
      configPath: input.configPath,
      phase: activePhase,
      status: "failed",
      state: "failed",
      message: `种子数据操作在 ${activePhase} 阶段被 ${signal} 中断。`,
    });
  });

  try {
    const details = await input.seedDatabase({
      sourceConfigPath: input.sourceConfigPath,
      sourceConfig: input.sourceConfig,
      targetConfig: input.targetConfig,
      targetPaths: input.targetPaths,
      instanceId: input.instanceId,
      seedMode: input.seedMode,
      preserveLiveWork: input.preserveLiveWork,
      expectedCompanyId: input.expectedCompanyId,
      onPhase: (phase, status, message) => {
        activePhase = phase;
        updateWorktreeSeedManifest({
          configPath: input.configPath,
          phase,
          status,
          state: "running",
          message,
          ...(phase === "snapshot" && status === "started"
            ? { snapshotAt: new Date().toISOString() }
            : {}),
        });
      },
    });
    if (!details.snapshotAt || !details.migrationRevision || !details.validation) {
      throw new Error("种子数据实现未提供所需的校验证据便已返回。");
    }
    updateWorktreeSeedManifest({
      configPath: input.configPath,
      phase: "complete",
      status: "succeeded",
      state: "verified",
      snapshotAt: details.snapshotAt,
      migrationRevision: details.migrationRevision,
      message:
        `Verified ${details.validation.companyCount} company record(s), `
        + `${details.validation.issueCount} issue record(s), auth, admin, membership, and migration state.`,
    });
    return details;
  } catch (error) {
    updateWorktreeSeedManifest({
      configPath: input.configPath,
      phase: activePhase,
      status: "failed",
      state: "failed",
      // Do not persist the underlying error: database/driver errors may contain
      // connection credentials. The CLI still returns the exact error to its caller.
      message: formatWorktreeSeedFailureDiagnostic(activePhase, error),
    });
    throw error;
  } finally {
    unregisterInterruption();
  }
}

export async function ensureWorktreeSeeded(
  opts: WorktreeEnsureSeededOptions = {},
  dependencies: {
    seedDatabase?: SeedWorktreeDatabase;
    inspectLegacyDatabase?: typeof inspectLegacyWorktreeDatabase;
  } = {},
): Promise<EnsureWorktreeSeededResult> {
  const configPath = resolveConfigPath(opts.config);
  const markers = resolveWorktreeSeedMarkerPaths(configPath);
  const initialManifest = readWorktreeSeedManifest(configPath);
  if (initialManifest?.state === "verified") {
    return { seeded: false, reason: "verified_manifest" };
  }
  if (!initialManifest && existsSync(markers.complete)) {
    return { seeded: false, reason: "complete_marker" };
  }
  const legacyPending = !initialManifest && existsSync(markers.pending)
    ? readLegacyWorktreeSeedPendingMarker(markers.pending)
    : null;
  const hasExplicitSource = Boolean(opts.fromConfig || opts.fromDataDir || opts.fromInstance);
  const explicitSourceConfigPath = hasExplicitSource
    ? resolveSourceConfigPath({
        fromConfig: opts.fromConfig,
        fromDataDir: opts.fromDataDir,
        fromInstance: opts.fromInstance,
      })
    : null;
  const registeredBaseWorkspaceCwd = opts.registeredBaseWorkspaceCwd
    ?? nonEmpty(process.env.PAPERCLIP_WORKSPACE_BASE_CWD)
    ?? null;
  if (!initialManifest && !legacyPending && !hasExplicitSource && !registeredBaseWorkspaceCwd) {
    if (existsSync(markers.lock)) {
      const releaseExistingLock = await acquireWorktreeSeedLock(markers.lock);
      await releaseExistingLock();
    }
    return { seeded: false, reason: "legacy_unmarked" };
  }
  const registeredProjectWorkspaceId = opts.registeredProjectWorkspaceId
    ?? nonEmpty(process.env.PAPERCLIP_PROJECT_WORKSPACE_ID)
    ?? null;
  const expectedCompanyId = opts.expectedCompanyId
    ?? nonEmpty(process.env.PAPERCLIP_SEED_EXPECTED_COMPANY_ID)
    ?? nonEmpty(process.env.PAPERCLIP_COMPANY_ID)
    ?? undefined;
  if (!explicitSourceConfigPath && registeredBaseWorkspaceCwd && (!registeredProjectWorkspaceId || !expectedCompanyId)) {
    throw new Error(
      "托管 worktree 种子数据登记不完整；必须设置项目工作区和公司关联。",
    );
  }

  const targetRoot = path.dirname(path.dirname(configPath));
  const targetPaths = resolveWorktreeReseedTargetPaths({ configPath, rootPath: targetRoot });
  const registeredSeedSource = resolveRegisteredWorktreeSeedSource({
    registeredBaseWorkspaceCwd,
    explicitSourceConfigPath,
    targetConfigPath: configPath,
    expectedTargetInstanceId: targetPaths.instanceId,
  });

  if (initialManifest && initialManifest.targetInstanceId !== registeredSeedSource.targetInstanceId) {
    throw new Error("worktree 种子清单中的目标实例与已注册的目标实例不匹配。");
  }

  // Resolve all authority-bearing paths before creating the lock. The manifest is
  // agent-writable diagnostic evidence and never selects the source. A stale source
  // diagnostic is replaced under the lock from this server/operator registration.
  let canonicalSource = registeredSeedSource;
  mkdirSync(path.dirname(markers.lock), { recursive: true });
  const releaseLock = await acquireWorktreeSeedLock(markers.lock);
  try {
    // These checks deliberately happen under the cross-process lock. A second
    // service process waits for the first seed transaction, then observes the
    // verified manifest instead of cloning the same database concurrently.
    let manifest = readWorktreeSeedManifest(configPath);
    if (manifest?.state === "verified") {
      return { seeded: false, reason: "verified_manifest" };
    }
    if (!manifest && existsSync(markers.pending)) {
      const currentLegacyPending = readLegacyWorktreeSeedPendingMarker(markers.pending);
      if (currentLegacyPending.sourceConfigPath !== legacyPending?.sourceConfigPath) {
        throw new Error("等待种子数据锁期间，worktree 种子源诊断信息发生变化。");
      }
      markWorktreeSeedPending({
        configPath,
        sourceConfigPath: registeredSeedSource.configPath,
        targetInstanceId: targetPaths.instanceId,
        seedMode: "minimal",
        diagnosticMessage: "Re-derived seed source diagnostics from the registered canonical source.",
      });
      manifest = readWorktreeSeedManifest(configPath);
    }
    if (!manifest) {
      const legacyEvidence = await (
        dependencies.inspectLegacyDatabase ?? inspectLegacyWorktreeDatabase
      )(configPath);
      if (legacyEvidence) {
        markWorktreeSeedPending({
          configPath,
          sourceConfigPath: registeredSeedSource.configPath,
          targetInstanceId: targetPaths.instanceId,
          seedMode: "minimal",
          diagnosticMessage: "Validated existing legacy worktree database schema before adoption.",
        });
        startWorktreeSeedAttempt(configPath);
        updateWorktreeSeedManifest({
          configPath,
          phase: "complete",
          status: "succeeded",
          state: "verified",
          snapshotAt: new Date().toISOString(),
          migrationRevision: legacyEvidence.migrationRevision,
          message: "已校验迁移日志和核心架构，并接管现有旧版 worktree 数据库。",
        });
        return { seeded: false, reason: "legacy_database" };
      }

      markWorktreeSeedPending({
        configPath,
        sourceConfigPath: registeredSeedSource.configPath,
        targetInstanceId: targetPaths.instanceId,
        seedMode: "minimal",
        diagnosticMessage: "No verified seed or compatible legacy database was found; provisioning is required.",
      });
      manifest = readWorktreeSeedManifest(configPath);
      if (!manifest) {
        throw new Error("创建待填充的 worktree 种子清单失败。");
      }
    }
    if (
      manifest.source.configPath !== registeredSeedSource.configPath
      || manifest.source.instanceId !== registeredSeedSource.instanceId
    ) {
      markWorktreeSeedPending({
        configPath,
        sourceConfigPath: registeredSeedSource.configPath,
        targetInstanceId: manifest.targetInstanceId,
        seedMode: manifest.seedMode,
        diagnosticMessage: "Re-derived seed source diagnostics from the registered canonical source.",
      });
      manifest = readWorktreeSeedManifest(configPath)!;
    }
    canonicalSource = resolveCanonicalWorktreeSeedSource({
      registeredBaseWorkspaceCwd,
      explicitSourceConfigPath,
      targetConfigPath: configPath,
      expectedTargetInstanceId: targetPaths.instanceId,
      manifestSource: manifest.source,
      manifestTargetInstanceId: manifest.targetInstanceId,
    });
    const sourceConfigPath = canonicalSource.configPath;

    const sourceConfig = readConfig(sourceConfigPath);
    if (!sourceConfig) {
      throw new Error(`未在 ${sourceConfigPath} 找到源配置文件。`);
    }
    const targetConfig = readConfig(configPath);
    if (!targetConfig) {
      throw new Error(`未在 ${configPath} 找到目标配置文件。`);
    }

    const seedDatabase = dependencies.seedDatabase ?? seedWorktreeDatabase;
    const details = await runVerifiedWorktreeSeed({
      configPath,
      sourceConfigPath,
      sourceConfig,
      targetConfig,
      targetPaths,
      instanceId: targetPaths.instanceId,
      seedMode: manifest.seedMode,
      preserveLiveWork: opts.preserveLiveWork,
      expectedCompanyId,
      seedDatabase,
    });
    return { seeded: true, reason: "seeded", details };
  } finally {
    await releaseLock();
  }
}

export function resolveWorktreeSeedBackupEngine(seedPlan: WorktreeSeedPlan): "auto" | "javascript" {
  return seedPlan.excludedTables.length === 0 && Object.keys(seedPlan.nullifyColumns).length === 0
    ? "auto"
    : "javascript";
}

async function runWorktreeInit(opts: WorktreeInitOptions): Promise<void> {
  const cwd = process.cwd();
  const worktreeName = resolveSuggestedWorktreeName(
    cwd,
    opts.name ?? detectGitBranchName(cwd) ?? undefined,
  );
  const seedMode = opts.seedMode ?? "minimal";
  if (!isWorktreeSeedMode(seedMode)) {
    throw new Error(`不支持种子数据模式“${seedMode}”。可用值：minimal、full。`);
  }
  const instanceId = sanitizeWorktreeInstanceId(opts.instance ?? worktreeName);
  const paths = resolveWorktreeLocalPaths({
    cwd,
    homeDir: resolveWorktreeHome(opts.home),
    instanceId,
  });
  const branding = {
    name: opts.name ?? worktreeName,
    color: opts.color ?? generateWorktreeColor(),
  };
  const sourceConfigPath = resolveSourceConfigPath(opts);
  const sourceConfig = existsSync(sourceConfigPath) ? readConfig(sourceConfigPath) : null;

  if ((existsSync(paths.configPath) || existsSync(paths.instanceRoot)) && !opts.force) {
    throw new Error(
      `Worktree 配置已存在于 ${paths.configPath}，或实例数据已存在于 ${paths.instanceRoot}。请使用 --force 重新运行以替换。`,
    );
  }

  if (opts.force) {
    // Only remove the specific files we're about to rewrite, not the whole
    // repoConfigDir — that directory can contain sibling state such as
    // <repo>/.paperclip/worktrees/ holding every repo-managed worktree
    // checkout, and a recursive rmSync here would nuke them all.
    rmSync(paths.configPath, { force: true });
    rmSync(paths.envPath, { force: true });
    const seedMarkers = resolveWorktreeSeedMarkerPaths(paths.configPath);
    rmSync(seedMarkers.pending, { force: true });
    rmSync(seedMarkers.complete, { force: true });
    rmSync(paths.instanceRoot, { recursive: true, force: true });
  }

  const { serverPort, databasePort, targetConfig } = await withWorktreePortRegistryLock(
    paths.homeDir,
    async () => {
      const registeredConfigPaths = readWorktreePortRegistry(paths.homeDir);
      const claimedPorts = collectClaimedWorktreePorts(
        paths.homeDir,
        paths.instanceId,
        paths.cwd,
        registeredConfigPaths,
      );
      const preferredServerPort = opts.serverPort ?? ((sourceConfig?.server.port ?? 3100) + 1);
      const selectedServerPort = await findAvailablePort(preferredServerPort, claimedPorts.serverPorts);
      const preferredDbPort = opts.dbPort ?? ((sourceConfig?.database.embeddedPostgresPort ?? 54329) + 1);
      const selectedDatabasePort = await findAvailablePort(
        preferredDbPort,
        new Set([...claimedPorts.databasePorts, selectedServerPort]),
      );
      const selectedConfig = buildWorktreeConfig({
        sourceConfig,
        paths,
        serverPort: selectedServerPort,
        databasePort: selectedDatabasePort,
      });

      try {
        writeConfig(selectedConfig, paths.configPath);
        writeWorktreePortRegistry(paths.homeDir, [
          ...registeredConfigPaths,
          paths.configPath,
        ]);
      } catch (error) {
        rmSync(paths.configPath, { force: true });
        throw error;
      }

      return {
        serverPort: selectedServerPort,
        databasePort: selectedDatabasePort,
        targetConfig: selectedConfig,
      };
    },
  );
  markWorktreeSeedPending({
    configPath: paths.configPath,
    sourceConfigPath,
    targetInstanceId: instanceId,
    seedMode,
  });
  const sourceEnvEntries = readPaperclipEnvEntries(resolvePaperclipEnvFile(sourceConfigPath));
  const existingAgentJwtSecret =
    nonEmpty(sourceEnvEntries.PAPERCLIP_AGENT_JWT_SECRET) ??
    nonEmpty(process.env.PAPERCLIP_AGENT_JWT_SECRET);
  const existingToolActionSigningSecret =
    nonEmpty(sourceEnvEntries.PAPERCLIP_TOOL_ACTION_SIGNING_SECRET) ??
    nonEmpty(process.env.PAPERCLIP_TOOL_ACTION_SIGNING_SECRET);
  mergePaperclipEnvEntries(
    {
      ...buildWorktreeEnvEntries(paths, branding),
      ...(existingAgentJwtSecret ? { PAPERCLIP_AGENT_JWT_SECRET: existingAgentJwtSecret } : {}),
      ...(existingToolActionSigningSecret ? { PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: existingToolActionSigningSecret } : {}),
    },
    paths.envPath,
  );
  ensureAgentJwtSecret(paths.configPath);
  ensureToolActionSigningSecret(paths.configPath);
  loadPaperclipEnvFile(paths.configPath);
  const copiedGitHooks = copyGitHooksToWorktreeGitDir(cwd);

  let seedSummary: string | null = null;
  let seedExecutionQuarantineSummary: SeededWorktreeExecutionQuarantineSummary | null = null;
  let pausedScheduledRoutineCount: number | null = null;
  let reboundWorkspaceSummary: SeedWorktreeDatabaseResult["reboundWorkspaces"] = [];
  if (opts.seed !== false) {
    if (!sourceConfig) {
      throw new Error(
        `找不到源配置文件 ${sourceConfigPath}，无法为 worktree 数据库写入种子数据。请使用 --no-seed 或传入 --from-config。`,
      );
    }
    const spinner = p.spinner();
    spinner.start(`Seeding isolated worktree database from source instance (${seedMode})...`);
    const markers = resolveWorktreeSeedMarkerPaths(paths.configPath);
    const releaseSeedLock = await acquireWorktreeSeedLock(markers.lock);
    try {
      const seeded = await runVerifiedWorktreeSeed({
        configPath: paths.configPath,
        sourceConfigPath,
        sourceConfig,
        targetConfig,
        targetPaths: paths,
        instanceId,
        seedMode,
        preserveLiveWork: opts.preserveLiveWork,
        seedDatabase: seedWorktreeDatabase,
      });
      seedSummary = seeded.backupSummary;
      seedExecutionQuarantineSummary = seeded.executionQuarantine;
      pausedScheduledRoutineCount = seeded.pausedScheduledRoutines;
      reboundWorkspaceSummary = seeded.reboundWorkspaces;
      spinner.stop(`Seeded isolated worktree database (${seedMode}).`);
    } catch (error) {
      spinner.stop(pc.red("写入 worktree 数据库种子数据失败。"));
      throw error;
    } finally {
      await releaseSeedLock();
    }
  }

  p.log.message(pc.dim(`仓库配置：${paths.configPath}`));
  p.log.message(pc.dim(`仓库环境文件：${paths.envPath}`));
  p.log.message(pc.dim(`隔离主目录：${paths.homeDir}`));
  p.log.message(pc.dim(`实例：${paths.instanceId}`));
  p.log.message(pc.dim(`Worktree 标识：${branding.name}（${branding.color}）`));
  p.log.message(pc.dim(`服务端口：${serverPort} | 数据库端口：${databasePort}`));
  if (copiedGitHooks?.copied) {
    p.log.message(
      pc.dim(`已镜像 Git hooks：${copiedGitHooks.sourceHooksPath} -> ${copiedGitHooks.targetHooksPath}`),
    );
  }
  if (seedSummary) {
    p.log.message(pc.dim(`种子数据模式：${seedMode}`));
    p.log.message(pc.dim(`种子数据快照：${seedSummary}`));
    if (opts.preserveLiveWork) {
      p.log.warning("已保留复制的实时工作；此 worktree 实例可能会自动运行源实例的任务分配。");
    } else if (seedExecutionQuarantineSummary) {
      p.log.message(
        pc.dim(`种子数据执行隔离：${formatSeededWorktreeExecutionQuarantineSummary(seedExecutionQuarantineSummary)}`),
      );
    }
    if (pausedScheduledRoutineCount != null) {
      p.log.message(pc.dim(`已暂停的定时例程：${pausedScheduledRoutineCount}`));
    }
    for (const rebound of reboundWorkspaceSummary) {
      p.log.message(
        pc.dim(`已重新绑定工作区 ${rebound.name}：${rebound.fromCwd} -> ${rebound.toCwd}`),
      );
    }
  }
  p.outro(
    pc.green(
      `Worktree 已就绪。在此仓库中运行 Paperclip 时，CLI 和服务器会自动使用实例 ${paths.instanceId}。`,
    ),
  );
}

export async function worktreeInitCommand(opts: WorktreeInitOptions): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclipai worktree init ")));
  await runWorktreeInit(opts);
}

export async function worktreeEnsureSeededCommand(opts: WorktreeEnsureSeededOptions): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclipai worktree ensure-seeded ")));

  const spinner = p.spinner();
  spinner.start("正在检查隔离 worktree 数据库的种子数据状态……");
  try {
    const result = await ensureWorktreeSeeded(opts);
    if (result.seeded) {
      spinner.stop("已为隔离 worktree 数据库写入最小种子数据。");
    } else if (result.reason === "legacy_database") {
      spinner.stop("已验证并采用现有旧版 worktree 数据库。");
    } else {
      spinner.stop("Worktree 数据库已有经过验证的种子数据清单。");
    }
    if (result.details) {
      p.log.message(pc.dim(`种子数据快照：${result.details.backupSummary}`));
      p.log.message(
        pc.dim(
          `种子数据执行隔离：${formatSeededWorktreeExecutionQuarantineSummary(result.details.executionQuarantine)}`,
        ),
      );
      p.log.message(pc.dim(`已暂停的定时例程：${result.details.pausedScheduledRoutines}`));
      for (const rebound of result.details.reboundWorkspaces) {
        p.log.message(
          pc.dim(`已重新绑定工作区 ${rebound.name}：${rebound.fromCwd} -> ${rebound.toCwd}`),
        );
      }
    }
    p.outro(pc.green("Worktree 数据库种子数据已完成。"));
  } catch (error) {
    spinner.stop(pc.red("写入 worktree 数据库种子数据失败。"));
    throw error;
  }
}

export async function worktreeMakeCommand(nameArg: string, opts: WorktreeMakeOptions): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclipai worktree:make ")));

  const name = resolveWorktreeMakeName(nameArg);
  const startPoint = resolveWorktreeStartPoint(opts.startPoint);
  const sourceCwd = process.cwd();
  const sourceConfigPath = resolveSourceConfigPath(opts);
  const targetPath = resolveWorktreeMakeTargetPath(name);
  if (existsSync(targetPath)) {
    throw new Error(`目标路径已存在：${targetPath}`);
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  if (startPoint) {
    const [remote] = startPoint.split("/", 1);
    try {
      execFileSync("git", ["fetch", remote], {
        cwd: sourceCwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      throw new Error(
        `Failed to fetch from remote "${remote}": ${extractExecSyncErrorMessage(error) ?? String(error)}`,
      );
    }
  }

  const worktreeArgs = resolveGitWorktreeAddArgs({
    branchName: name,
    targetPath,
    branchExists: !startPoint && localBranchExists(sourceCwd, name),
    startPoint,
  });

  const spinner = p.spinner();
  spinner.start(`Creating git worktree at ${targetPath}...`);
  try {
    execFileSync("git", worktreeArgs, {
      cwd: sourceCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    spinner.stop(`Created git worktree at ${targetPath}.`);
  } catch (error) {
    spinner.stop(pc.red("创建 Git worktree 失败。"));
    throw new Error(extractExecSyncErrorMessage(error) ?? String(error));
  }

  installDependenciesBestEffort(targetPath);

  const originalCwd = process.cwd();
  try {
    process.chdir(targetPath);
    await runWorktreeInit({
      ...opts,
      name,
      sourceConfigPathOverride: sourceConfigPath,
    });
  } catch (error) {
    throw error;
  } finally {
    process.chdir(originalCwd);
  }
}

type PnpmInstallInvocation = {
  command: string;
  argsPrefix: string[];
};

export function resolvePnpmInstallInvocation(
  env: NodeJS.ProcessEnv = process.env,
  nodeExecPath = process.execPath,
): PnpmInstallInvocation {
  const npmExecPath = nonEmpty(env.npm_execpath);
  if (npmExecPath && npmExecPath.toLowerCase().includes("pnpm")) {
    if (/\.(cjs|mjs|js)$/i.test(npmExecPath)) {
      return { command: nodeExecPath, argsPrefix: [npmExecPath] };
    }
    return { command: npmExecPath, argsPrefix: [] };
  }
  return { command: "pnpm", argsPrefix: [] };
}

function installDependenciesBestEffort(targetPath: string): void {
  const installSpinner = p.spinner();
  installSpinner.start("Installing dependencies...");
  const pnpm = resolvePnpmInstallInvocation();
  try {
    execFileSync(pnpm.command, [...pnpm.argsPrefix, "install"], {
      cwd: targetPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    installSpinner.stop("Installed dependencies.");
  } catch (error) {
    installSpinner.stop(pc.yellow("Failed to install dependencies (continuing anyway)."));
    p.log.warning(extractExecSyncErrorMessage(error) ?? String(error));
  }
}

type WorktreeCleanupOptions = {
  instance?: string;
  home?: string;
  force?: boolean;
};

type GitWorktreeListEntry = {
  worktree: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
};

type MergeSourceChoice = {
  worktree: string;
  branch: string | null;
  branchLabel: string;
  hasPaperclipConfig: boolean;
  isCurrent: boolean;
};

type ResolvedWorktreeEndpoint = {
  rootPath: string;
  configPath: string;
  label: string;
  isCurrent: boolean;
};

type ResolvedWorktreeReseedSource = {
  configPath: string;
  label: string;
};

type ResolvedWorktreeRepairTarget = {
  rootPath: string;
  configPath: string;
  label: string;
  branchName: string | null;
  created: boolean;
};

function parseGitWorktreeList(cwd: string): GitWorktreeListEntry[] {
  const raw = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const entries: GitWorktreeListEntry[] = [];
  let current: Partial<GitWorktreeListEntry> = {};
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { worktree: line.slice("worktree ".length) };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "" && current.worktree) {
      entries.push({
        worktree: current.worktree,
        branch: current.branch ?? null,
        bare: current.bare ?? false,
        detached: current.detached ?? false,
      });
      current = {};
    }
  }
  if (current.worktree) {
    entries.push({
      worktree: current.worktree,
      branch: current.branch ?? null,
      bare: current.bare ?? false,
      detached: current.detached ?? false,
    });
  }
  return entries;
}

function toMergeSourceChoices(cwd: string): MergeSourceChoice[] {
  const currentCwd = path.resolve(cwd);
  return parseGitWorktreeList(cwd).map((entry) => {
    const branchLabel = entry.branch?.replace(/^refs\/heads\//, "") ?? "(detached)";
    const worktreePath = path.resolve(entry.worktree);
    return {
      worktree: worktreePath,
      branch: entry.branch,
      branchLabel,
      hasPaperclipConfig: existsSync(path.resolve(worktreePath, ".paperclip", "config.json")),
      isCurrent: worktreePath === currentCwd,
    };
  });
}

function branchHasUniqueCommits(cwd: string, branchName: string): boolean {
  try {
    const output = execFileSync(
      "git",
      ["log", "--oneline", branchName, "--not", "--remotes", "--exclude", `refs/heads/${branchName}`, "--branches"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function branchExistsOnAnyRemote(cwd: string, branchName: string): boolean {
  try {
    const output = execFileSync(
      "git",
      ["branch", "-r", "--list", `*/${branchName}`],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function worktreePathHasUncommittedChanges(worktreePath: string): boolean {
  try {
    const output = execFileSync(
      "git",
      ["status", "--porcelain"],
      { cwd: worktreePath, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

export async function worktreeCleanupCommand(nameArg: string, opts: WorktreeCleanupOptions): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclipai worktree:cleanup ")));

  const name = resolveWorktreeMakeName(nameArg);
  const sourceCwd = process.cwd();
  const targetPath = resolveWorktreeMakeTargetPath(name);
  const instanceId = sanitizeWorktreeInstanceId(opts.instance ?? name);
  const homeDir = path.resolve(expandHomePrefix(resolveWorktreeHome(opts.home)));
  const instanceRoot = path.resolve(homeDir, "instances", instanceId);

  // ── 1. Assess current state ──────────────────────────────────────────

  const hasBranch = localBranchExists(sourceCwd, name);
  const hasTargetDir = existsSync(targetPath);
  const hasInstanceData = existsSync(instanceRoot);

  const worktrees = parseGitWorktreeList(sourceCwd);
  const linkedWorktree = worktrees.find(
    (wt) => wt.branch === `refs/heads/${name}` || path.resolve(wt.worktree) === path.resolve(targetPath),
  );

  if (!hasBranch && !hasTargetDir && !hasInstanceData && !linkedWorktree) {
    p.log.info("无需清理：未找到分支、worktree 目录或实例数据。");
    p.outro(pc.green("已清理完成。"));
    return;
  }

  // ── 2. Safety checks ────────────────────────────────────────────────

  const problems: string[] = [];

  if (hasBranch && branchHasUniqueCommits(sourceCwd, name)) {
    const onRemote = branchExistsOnAnyRemote(sourceCwd, name);
    if (onRemote) {
      p.log.info(
        `分支“${name}”有独有的本地提交，但该分支也存在于远端，可安全地在本地删除。`,
      );
    } else {
      problems.push(
        `分支“${name}”包含其他分支和远端都没有的提交。` +
          `删除该分支会丢失这些工作。请先推送，或使用 --force。`,
      );
    }
  }

  if (hasTargetDir && worktreePathHasUncommittedChanges(targetPath)) {
    problems.push(
      `Worktree 目录 ${targetPath} 有未提交的更改。请先提交或暂存，或使用 --force。`,
    );
  }

  if (problems.length > 0 && !opts.force) {
    for (const problem of problems) {
      p.log.error(problem);
    }
    throw new Error("安全检查未通过。请先解决上述问题，或使用 --force 重新运行。");
  }
  if (problems.length > 0 && opts.force) {
    for (const problem of problems) {
      p.log.warning(`已通过 --force 忽略：${problem}`);
    }
  }

  // ── 3. Clean up (idempotent steps) ──────────────────────────────────

  // 3a. Remove the git worktree registration
  if (linkedWorktree) {
    const worktreeDirExists = existsSync(linkedWorktree.worktree);
    const spinner = p.spinner();
    if (worktreeDirExists) {
      spinner.start(`Removing git worktree at ${linkedWorktree.worktree}...`);
      try {
        const removeArgs = ["worktree", "remove", linkedWorktree.worktree];
        if (opts.force) removeArgs.push("--force");
        execFileSync("git", removeArgs, {
          cwd: sourceCwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
        spinner.stop(`Removed git worktree at ${linkedWorktree.worktree}.`);
      } catch (error) {
        spinner.stop(pc.yellow(`Could not remove worktree cleanly, will prune instead.`));
        p.log.warning(extractExecSyncErrorMessage(error) ?? String(error));
      }
    } else {
      spinner.start("正在清理过期的 worktree 条目……");
      execFileSync("git", ["worktree", "prune"], {
        cwd: sourceCwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      spinner.stop("已清理过期的 worktree 条目。");
    }
  } else {
    // Even without a linked worktree, prune to clean up any orphaned entries
    execFileSync("git", ["worktree", "prune"], {
      cwd: sourceCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  // 3b. Remove the worktree directory if it still exists (e.g. partial creation)
  if (existsSync(targetPath)) {
    const spinner = p.spinner();
    spinner.start(`Removing worktree directory ${targetPath}...`);
    rmSync(targetPath, { recursive: true, force: true });
    spinner.stop(`Removed worktree directory ${targetPath}.`);
  }

  // 3c. Delete the local branch (now safe — worktree is gone)
  if (localBranchExists(sourceCwd, name)) {
    const spinner = p.spinner();
    spinner.start(`Deleting local branch "${name}"...`);
    try {
      const deleteFlag = opts.force ? "-D" : "-d";
      execFileSync("git", ["branch", deleteFlag, name], {
        cwd: sourceCwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      spinner.stop(`Deleted local branch "${name}".`);
    } catch (error) {
      spinner.stop(pc.yellow(`Could not delete branch "${name}".`));
      p.log.warning(extractExecSyncErrorMessage(error) ?? String(error));
    }
  }

  // 3d. Remove instance data
  if (existsSync(instanceRoot)) {
    const spinner = p.spinner();
    spinner.start(`正在移除实例数据：${instanceRoot}……`);
    rmSync(instanceRoot, { recursive: true, force: true });
    spinner.stop(`已移除实例数据：${instanceRoot}。`);
  }

  p.outro(pc.green("清理完成。"));
}

export async function worktreeEnvCommand(opts: WorktreeEnvOptions): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  const envPath = resolvePaperclipEnvFile(configPath);
  const envEntries = readPaperclipEnvEntries(envPath);
  const out = {
    PAPERCLIP_CONFIG: configPath,
    ...(envEntries.PAPERCLIP_HOME ? { PAPERCLIP_HOME: envEntries.PAPERCLIP_HOME } : {}),
    ...(envEntries.PAPERCLIP_INSTANCE_ID ? { PAPERCLIP_INSTANCE_ID: envEntries.PAPERCLIP_INSTANCE_ID } : {}),
    ...(envEntries.PAPERCLIP_CONTEXT ? { PAPERCLIP_CONTEXT: envEntries.PAPERCLIP_CONTEXT } : {}),
    ...envEntries,
  };

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(formatShellExports(out));
}

type ClosableDb = ReturnType<typeof createDb> & {
  $client?: { end?: (opts?: { timeout?: number }) => Promise<void> };
};

type OpenDbHandle = {
  db: ClosableDb;
  stop: () => Promise<void>;
};

type ResolvedMergeCompany = {
  id: string;
  name: string;
  issuePrefix: string;
};

async function closeDb(db: ClosableDb): Promise<void> {
  await db.$client?.end?.({ timeout: 5 }).catch(() => undefined);
}

export function resolveCurrentWorktreeEndpoint(): ResolvedWorktreeEndpoint {
  const cwd = path.resolve(process.cwd());
  const rootPath = detectGitWorkspaceInfo(cwd)?.root ?? cwd;
  const localConfigPath = path.join(rootPath, ".paperclip", "config.json");
  return {
    rootPath,
    configPath: existsSync(localConfigPath) ? localConfigPath : resolveConfigPath(),
    label: "current",
    isCurrent: true,
  };
}

function resolveAttachmentLookupStorages(input: {
  sourceEndpoint: ResolvedWorktreeEndpoint;
  targetEndpoint: ResolvedWorktreeEndpoint;
}): ConfiguredStorage[] {
  const orderedConfigPaths = [
    input.sourceEndpoint.configPath,
    resolveCurrentWorktreeEndpoint().configPath,
    input.targetEndpoint.configPath,
    ...toMergeSourceChoices(process.cwd())
      .filter((choice) => choice.hasPaperclipConfig)
      .map((choice) => path.resolve(choice.worktree, ".paperclip", "config.json")),
  ];
  const seen = new Set<string>();
  const storages: ConfiguredStorage[] = [];
  for (const configPath of orderedConfigPaths) {
    const resolved = path.resolve(configPath);
    if (seen.has(resolved) || !existsSync(resolved)) continue;
    seen.add(resolved);
    storages.push(openConfiguredStorage(resolved));
  }
  return storages;
}

async function openConfiguredDb(configPath: string): Promise<OpenDbHandle> {
  const config = readConfig(configPath);
  if (!config) {
    throw new Error(`未在 ${configPath} 找到配置文件。`);
  }
  const envEntries = readPaperclipEnvEntries(resolvePaperclipEnvFile(configPath));
  let embeddedHandle: EmbeddedPostgresHandle | null = null;

  try {
    if (config.database.mode === "embedded-postgres") {
      embeddedHandle = await ensureEmbeddedPostgres(
        config.database.embeddedPostgresDataDir,
        config.database.embeddedPostgresPort,
      );
    }
    const connectionString = resolveSourceConnectionString(config, envEntries, embeddedHandle?.port);
    const migrationState = await inspectMigrations(connectionString);
    if (migrationState.status !== "upToDate") {
      const pending =
        migrationState.reason === "pending-migrations"
          ? ` Pending migrations: ${migrationState.pendingMigrations.join(", ")}.`
          : "";
      throw new Error(
        `配置 ${configPath} 对应的数据库不是最新版本。${pending} 使用 worktree 合并历史前，请运行 \`pnpm db:migrate\`（或启动一次 Paperclip）。`,
      );
    }
    const db = createDb(connectionString) as ClosableDb;
    return {
      db,
      stop: async () => {
        await closeDb(db);
        if (embeddedHandle?.startedByThisProcess) {
          await embeddedHandle.stop();
        }
      },
    };
  } catch (error) {
    if (embeddedHandle?.startedByThisProcess) {
      await embeddedHandle.stop().catch(() => undefined);
    }
    throw error;
  }
}

async function resolveMergeCompany(input: {
  sourceDb: ClosableDb;
  targetDb: ClosableDb;
  selector?: string;
}): Promise<ResolvedMergeCompany> {
  const [sourceCompanies, targetCompanies] = await Promise.all([
    input.sourceDb
      .select({
        id: companies.id,
        name: companies.name,
        issuePrefix: companies.issuePrefix,
      })
      .from(companies),
    input.targetDb
      .select({
        id: companies.id,
        name: companies.name,
        issuePrefix: companies.issuePrefix,
      })
      .from(companies),
  ]);

  const targetById = new Map(targetCompanies.map((company) => [company.id, company]));
  const shared = sourceCompanies.filter((company) => targetById.has(company.id));
  const selector = nonEmpty(input.selector);
  if (selector) {
    const matched = shared.find(
      (company) => company.id === selector || company.issuePrefix.toLowerCase() === selector.toLowerCase(),
    );
    if (!matched) {
      throw new Error(`无法在源和目标数据库中解析公司“${selector}”。`);
    }
    return matched;
  }

  if (shared.length === 1) {
    return shared[0];
  }

  if (shared.length === 0) {
    throw new Error("源数据库和目标数据库的公司 ID 不一致。两侧匹配后，请明确传入 --company。");
  }

  const options = shared
    .map((company) => `${company.issuePrefix} (${company.name})`)
    .join(", ");
  throw new Error(`找到多个共享公司。请使用 --company <id-or-prefix> 重新运行。选项：${options}`);
}

function renderMergePlan(plan: Awaited<ReturnType<typeof collectMergePlan>>["plan"], extras: {
  sourcePath: string;
  targetPath: string;
  unsupportedRunCount: number;
}): string {
  const terminalWidth = Math.max(60, process.stdout.columns ?? 100);
  const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
  const truncateToWidth = (value: string, maxWidth: number) => {
    if (maxWidth <= 1) return "";
    if (value.length <= maxWidth) return value;
    return `${value.slice(0, Math.max(0, maxWidth - 1)).trimEnd()}…`;
  };
  const lines = [
    `Mode: preview`,
    `Source: ${extras.sourcePath}`,
    `Target: ${extras.targetPath}`,
    `Company: ${plan.companyName} (${plan.issuePrefix})`,
    "",
    "Projects",
    `- import: ${plan.counts.projectsToImport}`,
    "",
    "Issues",
    `- insert: ${plan.counts.issuesToInsert}`,
    `- already present: ${plan.counts.issuesExisting}`,
    `- shared/imported issues with drift: ${plan.counts.issueDrift}`,
  ];

  if (plan.projectImports.length > 0) {
    lines.push("");
    lines.push("Planned project imports");
    for (const project of plan.projectImports) {
      lines.push(
        `- ${project.source.name} (${project.workspaces.length} workspace${project.workspaces.length === 1 ? "" : "s"})`,
      );
    }
  }

  const issueInserts = plan.issuePlans.filter((item): item is PlannedIssueInsert => item.action === "insert");
  if (issueInserts.length > 0) {
    lines.push("");
    lines.push("Planned issue imports");
    for (const issue of issueInserts) {
      const projectNote =
        (issue.projectResolution === "mapped" || issue.projectResolution === "imported")
        && issue.mappedProjectName
          ? ` project->${issue.projectResolution === "imported" ? "import:" : ""}${issue.mappedProjectName}`
          : "";
      const adjustments = issue.adjustments.length > 0 ? ` [${issue.adjustments.join(", ")}]` : "";
      const prefix = `- ${issue.source.identifier ?? issue.source.id} -> ${issue.previewIdentifier} (${issue.targetStatus}${projectNote})`;
      const title = oneLine(issue.source.title);
      const suffix = `${adjustments}${title ? ` ${title}` : ""}`;
      lines.push(
        `${prefix}${truncateToWidth(suffix, Math.max(8, terminalWidth - prefix.length))}`,
      );
    }
  }

  if (plan.scopes.includes("comments")) {
    lines.push("");
    lines.push("Comments");
    lines.push(`- insert: ${plan.counts.commentsToInsert}`);
    lines.push(`- already present: ${plan.counts.commentsExisting}`);
    lines.push(`- skipped (missing parent): ${plan.counts.commentsMissingParent}`);
  }

  lines.push("");
  lines.push("Documents");
  lines.push(`- insert: ${plan.counts.documentsToInsert}`);
  lines.push(`- merge existing: ${plan.counts.documentsToMerge}`);
  lines.push(`- already present: ${plan.counts.documentsExisting}`);
  lines.push(`- skipped (conflicting key): ${plan.counts.documentsConflictingKey}`);
  lines.push(`- skipped (missing parent): ${plan.counts.documentsMissingParent}`);
  lines.push(`- revisions insert: ${plan.counts.documentRevisionsToInsert}`);

  lines.push("");
  lines.push("Attachments");
  lines.push(`- insert: ${plan.counts.attachmentsToInsert}`);
  lines.push(`- already present: ${plan.counts.attachmentsExisting}`);
  lines.push(`- skipped (missing parent): ${plan.counts.attachmentsMissingParent}`);

  lines.push("");
  lines.push("Adjustments");
  lines.push(`- cleared assignee agents: ${plan.adjustments.clear_assignee_agent}`);
  lines.push(`- cleared projects: ${plan.adjustments.clear_project}`);
  lines.push(`- cleared project workspaces: ${plan.adjustments.clear_project_workspace}`);
  lines.push(`- cleared goals: ${plan.adjustments.clear_goal}`);
  lines.push(`- cleared comment author agents: ${plan.adjustments.clear_author_agent}`);
  lines.push(`- cleared document agents: ${plan.adjustments.clear_document_agent}`);
  lines.push(`- cleared document revision agents: ${plan.adjustments.clear_document_revision_agent}`);
  lines.push(`- cleared attachment author agents: ${plan.adjustments.clear_attachment_agent}`);
  lines.push(`- coerced in_progress to todo: ${plan.adjustments.coerce_in_progress_to_todo}`);

  lines.push("");
  lines.push("Not imported in this phase");
  lines.push(`- heartbeat runs: ${extras.unsupportedRunCount}`);
  lines.push("");
  lines.push("Identifiers shown above are provisional preview values. `--apply` reserves fresh issue numbers at write time.");

  return lines.join("\n");
}

function resolveRunningEmbeddedPostgresPid(config: PaperclipConfig): number | null {
  if (config.database.mode !== "embedded-postgres") {
    return null;
  }
  return readRunningPostmasterPid(path.resolve(config.database.embeddedPostgresDataDir, "postmaster.pid"));
}

async function collectMergePlan(input: {
  sourceDb: ClosableDb;
  targetDb: ClosableDb;
  company: ResolvedMergeCompany;
  scopes: ReturnType<typeof parseWorktreeMergeScopes>;
  importProjectIds?: Iterable<string>;
  projectIdOverrides?: Record<string, string | null | undefined>;
}) {
  const companyId = input.company.id;
  const [
    targetCompanyRow,
    sourceIssuesRows,
    targetIssuesRows,
    sourceCommentsRows,
    targetCommentsRows,
    sourceIssueDocumentsRows,
    targetIssueDocumentsRows,
    sourceDocumentRevisionRows,
    targetDocumentRevisionRows,
    sourceAttachmentRows,
    targetAttachmentRows,
    sourceProjectsRows,
    sourceProjectWorkspaceRows,
    targetProjectsRows,
    targetAgentsRows,
    targetProjectWorkspaceRows,
    targetGoalsRows,
    runCountRows,
  ] = await Promise.all([
    input.targetDb
      .select({
        issueCounter: companies.issueCounter,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null),
    input.sourceDb
      .select()
      .from(issues)
      .where(eq(issues.companyId, companyId)),
    input.targetDb
      .select()
      .from(issues)
      .where(eq(issues.companyId, companyId)),
    input.scopes.includes("comments")
      ? input.sourceDb
        .select()
        .from(issueComments)
        .where(eq(issueComments.companyId, companyId))
      : Promise.resolve([]),
    input.targetDb
      .select()
      .from(issueComments)
      .where(eq(issueComments.companyId, companyId)),
    input.sourceDb
      .select({
        id: issueDocuments.id,
        companyId: issueDocuments.companyId,
        issueId: issueDocuments.issueId,
        documentId: issueDocuments.documentId,
        key: issueDocuments.key,
        linkCreatedAt: issueDocuments.createdAt,
        linkUpdatedAt: issueDocuments.updatedAt,
        title: documents.title,
        format: documents.format,
        latestBody: documents.latestBody,
        latestRevisionId: documents.latestRevisionId,
        latestRevisionNumber: documents.latestRevisionNumber,
        createdByAgentId: documents.createdByAgentId,
        createdByUserId: documents.createdByUserId,
        updatedByAgentId: documents.updatedByAgentId,
        updatedByUserId: documents.updatedByUserId,
        documentCreatedAt: documents.createdAt,
        documentUpdatedAt: documents.updatedAt,
      })
      .from(issueDocuments)
      .innerJoin(documents, eq(issueDocuments.documentId, documents.id))
      .innerJoin(issues, eq(issueDocuments.issueId, issues.id))
      .where(eq(issues.companyId, companyId)),
    input.targetDb
      .select({
        id: issueDocuments.id,
        companyId: issueDocuments.companyId,
        issueId: issueDocuments.issueId,
        documentId: issueDocuments.documentId,
        key: issueDocuments.key,
        linkCreatedAt: issueDocuments.createdAt,
        linkUpdatedAt: issueDocuments.updatedAt,
        title: documents.title,
        format: documents.format,
        latestBody: documents.latestBody,
        latestRevisionId: documents.latestRevisionId,
        latestRevisionNumber: documents.latestRevisionNumber,
        createdByAgentId: documents.createdByAgentId,
        createdByUserId: documents.createdByUserId,
        updatedByAgentId: documents.updatedByAgentId,
        updatedByUserId: documents.updatedByUserId,
        documentCreatedAt: documents.createdAt,
        documentUpdatedAt: documents.updatedAt,
      })
      .from(issueDocuments)
      .innerJoin(documents, eq(issueDocuments.documentId, documents.id))
      .innerJoin(issues, eq(issueDocuments.issueId, issues.id))
      .where(eq(issues.companyId, companyId)),
    input.sourceDb
      .select({
        id: documentRevisions.id,
        companyId: documentRevisions.companyId,
        documentId: documentRevisions.documentId,
        revisionNumber: documentRevisions.revisionNumber,
        body: documentRevisions.body,
        changeSummary: documentRevisions.changeSummary,
        createdByAgentId: documentRevisions.createdByAgentId,
        createdByUserId: documentRevisions.createdByUserId,
        createdAt: documentRevisions.createdAt,
      })
      .from(documentRevisions)
      .innerJoin(issueDocuments, eq(documentRevisions.documentId, issueDocuments.documentId))
      .innerJoin(issues, eq(issueDocuments.issueId, issues.id))
      .where(eq(issues.companyId, companyId)),
    input.targetDb
      .select({
        id: documentRevisions.id,
        companyId: documentRevisions.companyId,
        documentId: documentRevisions.documentId,
        revisionNumber: documentRevisions.revisionNumber,
        body: documentRevisions.body,
        changeSummary: documentRevisions.changeSummary,
        createdByAgentId: documentRevisions.createdByAgentId,
        createdByUserId: documentRevisions.createdByUserId,
        createdAt: documentRevisions.createdAt,
      })
      .from(documentRevisions)
      .innerJoin(issueDocuments, eq(documentRevisions.documentId, issueDocuments.documentId))
      .innerJoin(issues, eq(issueDocuments.issueId, issues.id))
      .where(eq(issues.companyId, companyId)),
    input.sourceDb
      .select({
        id: issueAttachments.id,
        companyId: issueAttachments.companyId,
        issueId: issueAttachments.issueId,
        issueCommentId: issueAttachments.issueCommentId,
        assetId: issueAttachments.assetId,
        provider: assets.provider,
        objectKey: assets.objectKey,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        sha256: assets.sha256,
        originalFilename: assets.originalFilename,
        createdByAgentId: assets.createdByAgentId,
        createdByUserId: assets.createdByUserId,
        assetCreatedAt: assets.createdAt,
        assetUpdatedAt: assets.updatedAt,
        attachmentCreatedAt: issueAttachments.createdAt,
        attachmentUpdatedAt: issueAttachments.updatedAt,
      })
      .from(issueAttachments)
      .innerJoin(assets, eq(issueAttachments.assetId, assets.id))
      .innerJoin(issues, eq(issueAttachments.issueId, issues.id))
      .where(eq(issues.companyId, companyId)),
    input.targetDb
      .select({
        id: issueAttachments.id,
        companyId: issueAttachments.companyId,
        issueId: issueAttachments.issueId,
        issueCommentId: issueAttachments.issueCommentId,
        assetId: issueAttachments.assetId,
        provider: assets.provider,
        objectKey: assets.objectKey,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        sha256: assets.sha256,
        originalFilename: assets.originalFilename,
        createdByAgentId: assets.createdByAgentId,
        createdByUserId: assets.createdByUserId,
        assetCreatedAt: assets.createdAt,
        assetUpdatedAt: assets.updatedAt,
        attachmentCreatedAt: issueAttachments.createdAt,
        attachmentUpdatedAt: issueAttachments.updatedAt,
      })
      .from(issueAttachments)
      .innerJoin(assets, eq(issueAttachments.assetId, assets.id))
      .innerJoin(issues, eq(issueAttachments.issueId, issues.id))
      .where(eq(issues.companyId, companyId)),
    input.sourceDb
      .select()
      .from(projects)
      .where(eq(projects.companyId, companyId)),
    input.sourceDb
      .select()
      .from(projectWorkspaces)
      .where(eq(projectWorkspaces.companyId, companyId)),
    input.targetDb
      .select()
      .from(projects)
      .where(eq(projects.companyId, companyId)),
    input.targetDb
      .select()
      .from(agents)
      .where(eq(agents.companyId, companyId)),
    input.targetDb
      .select()
      .from(projectWorkspaces)
      .where(eq(projectWorkspaces.companyId, companyId)),
    input.targetDb
      .select()
      .from(goals)
      .where(eq(goals.companyId, companyId)),
    input.sourceDb
      .select({ count: sql<number>`count(*)::int` })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.companyId, companyId)),
  ]);

  if (!targetCompanyRow) {
    throw new Error(`未找到目标公司 ${companyId}。`);
  }

  const plan = buildWorktreeMergePlan({
    companyId,
    companyName: input.company.name,
    issuePrefix: input.company.issuePrefix,
    previewIssueCounterStart: targetCompanyRow.issueCounter,
    scopes: input.scopes,
    sourceIssues: sourceIssuesRows,
    targetIssues: targetIssuesRows,
    sourceComments: sourceCommentsRows,
    targetComments: targetCommentsRows,
    sourceProjects: sourceProjectsRows,
    sourceProjectWorkspaces: sourceProjectWorkspaceRows,
    sourceDocuments: sourceIssueDocumentsRows as IssueDocumentRow[],
    targetDocuments: targetIssueDocumentsRows as IssueDocumentRow[],
    sourceDocumentRevisions: sourceDocumentRevisionRows as DocumentRevisionRow[],
    targetDocumentRevisions: targetDocumentRevisionRows as DocumentRevisionRow[],
    sourceAttachments: sourceAttachmentRows as IssueAttachmentRow[],
    targetAttachments: targetAttachmentRows as IssueAttachmentRow[],
    targetAgents: targetAgentsRows,
    targetProjects: targetProjectsRows,
    targetProjectWorkspaces: targetProjectWorkspaceRows,
    targetGoals: targetGoalsRows,
    importProjectIds: input.importProjectIds,
    projectIdOverrides: input.projectIdOverrides,
  });

  return {
    plan,
    sourceProjects: sourceProjectsRows,
    targetProjects: targetProjectsRows,
    unsupportedRunCount: runCountRows[0]?.count ?? 0,
  };
}

type ProjectMappingSelections = {
  importProjectIds: string[];
  projectIdOverrides: Record<string, string | null>;
};

async function promptForProjectMappings(input: {
  plan: Awaited<ReturnType<typeof collectMergePlan>>["plan"];
  sourceProjects: Awaited<ReturnType<typeof collectMergePlan>>["sourceProjects"];
  targetProjects: Awaited<ReturnType<typeof collectMergePlan>>["targetProjects"];
}): Promise<ProjectMappingSelections> {
  const missingProjectIds = [
    ...new Set(
      input.plan.issuePlans
        .filter((plan): plan is PlannedIssueInsert => plan.action === "insert")
        .filter((plan) => !!plan.source.projectId && plan.projectResolution === "cleared")
        .map((plan) => plan.source.projectId as string),
    ),
  ];
  if (missingProjectIds.length === 0) {
    return {
      importProjectIds: [],
      projectIdOverrides: {},
    };
  }

  const sourceProjectsById = new Map(input.sourceProjects.map((project) => [project.id, project]));
  const targetChoices = [...input.targetProjects]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((project) => ({
      value: project.id,
      label: project.name,
      hint: project.status,
    }));

  const mappings: Record<string, string | null> = {};
  const importProjectIds = new Set<string>();
  for (const sourceProjectId of missingProjectIds) {
    const sourceProject = sourceProjectsById.get(sourceProjectId);
    if (!sourceProject) continue;
    const nameMatch = input.targetProjects.find(
      (project) => project.name.trim().toLowerCase() === sourceProject.name.trim().toLowerCase(),
    );
    const importSelectionValue = `__import__:${sourceProjectId}`;
    const selection = await p.select<string | null>({
      message: `目标中缺少项目“${sourceProject.name}”。导入 ${input.plan.issuePrefix} 时如何处理？`,
      options: [
        {
          value: importSelectionValue,
          label: `导入 ${sourceProject.name}`,
          hint: "创建项目并复制其工作区设置",
        },
        ...(nameMatch
          ? [{
              value: nameMatch.id,
              label: `Map to ${nameMatch.name}`,
              hint: "Recommended: exact name match",
            }]
          : []),
        {
          value: null,
          label: "Leave unset",
          hint: "Keep imported issues without a project",
        },
        ...targetChoices.filter((choice) => choice.value !== nameMatch?.id),
      ],
      initialValue: nameMatch?.id ?? null,
    });
    if (p.isCancel(selection)) {
      throw new Error("项目映射已取消。");
    }
    if (selection === importSelectionValue) {
      importProjectIds.add(sourceProjectId);
      continue;
    }
    mappings[sourceProjectId] = selection;
  }

  return {
    importProjectIds: [...importProjectIds],
    projectIdOverrides: mappings,
  };
}

export async function worktreeListCommand(opts: WorktreeListOptions): Promise<void> {
  const choices = toMergeSourceChoices(process.cwd());
  if (opts.json) {
    console.log(JSON.stringify(choices, null, 2));
    return;
  }

  for (const choice of choices) {
    const flags = [
      choice.isCurrent ? "current" : null,
      choice.hasPaperclipConfig ? "paperclip" : "no-paperclip-config",
    ].filter((value): value is string => value !== null);
    p.log.message(`${choice.branchLabel}  ${choice.worktree}  [${flags.join(", ")}]`);
  }
}

function resolveEndpointFromChoice(choice: MergeSourceChoice): ResolvedWorktreeEndpoint {
  if (choice.isCurrent) {
    return resolveCurrentWorktreeEndpoint();
  }
  return {
    rootPath: choice.worktree,
    configPath: path.resolve(choice.worktree, ".paperclip", "config.json"),
    label: choice.branchLabel,
    isCurrent: false,
  };
}

function resolveWorktreeEndpointFromSelector(
  selector: string,
  opts?: { allowCurrent?: boolean },
): ResolvedWorktreeEndpoint {
  const trimmed = selector.trim();
  const allowCurrent = opts?.allowCurrent !== false;
  if (trimmed.length === 0) {
    throw new Error("worktree 选择器不能为空。");
  }

  const currentEndpoint = resolveCurrentWorktreeEndpoint();
  if (allowCurrent && trimmed === "current") {
    return currentEndpoint;
  }

  const choices = toMergeSourceChoices(process.cwd());
  const directPath = path.resolve(trimmed);
  if (existsSync(directPath)) {
    if (allowCurrent && directPath === currentEndpoint.rootPath) {
      return currentEndpoint;
    }
    const configPath = path.resolve(directPath, ".paperclip", "config.json");
    if (!existsSync(configPath)) {
      throw new Error(`解析出的 worktree 路径 ${directPath} 中没有 .paperclip/config.json。`);
    }
    return {
      rootPath: directPath,
      configPath,
      label: path.basename(directPath),
      isCurrent: false,
    };
  }

  const matched = choices.find((choice) =>
    (allowCurrent || !choice.isCurrent)
    && (choice.worktree === directPath
      || path.basename(choice.worktree) === trimmed
      || choice.branchLabel === trimmed),
  );
  if (!matched) {
    throw new Error(
      `无法解析 worktree“${selector}”。请使用路径、列表中的 worktree 目录名、分支名或“current”。`,
    );
  }
  if (!matched.hasPaperclipConfig && !matched.isCurrent) {
    throw new Error(`解析出的 worktree“${selector}”似乎不是 Paperclip worktree。`);
  }
  return resolveEndpointFromChoice(matched);
}

async function promptForSourceEndpoint(excludeWorktreePath?: string): Promise<ResolvedWorktreeEndpoint> {
  const excluded = excludeWorktreePath ? path.resolve(excludeWorktreePath) : null;
  const currentEndpoint = resolveCurrentWorktreeEndpoint();
  const choices = toMergeSourceChoices(process.cwd())
    .filter((choice) => choice.hasPaperclipConfig || choice.isCurrent)
    .filter((choice) => path.resolve(choice.worktree) !== excluded)
    .map((choice) => ({
      value: choice.isCurrent ? "__current__" : choice.worktree,
      label: choice.branchLabel,
      hint: `${choice.worktree}${choice.isCurrent ? " (current)" : ""}`,
    }));
  if (choices.length === 0) {
    throw new Error("未找到 Paperclip worktree。运行 `paperclipai worktree:list` 检查仓库中的 worktree。");
  }
  const selection = await p.select<string>({
    message: "选择要从中导入的源 worktree",
    options: choices,
  });
  if (p.isCancel(selection)) {
    throw new Error("已取消选择源 worktree。");
  }
  if (selection === "__current__") {
    return currentEndpoint;
  }
  return resolveWorktreeEndpointFromSelector(selection, { allowCurrent: true });
}

async function applyMergePlan(input: {
  sourceStorages: ConfiguredStorage[];
  targetStorage: ConfiguredStorage;
  targetDb: ClosableDb;
  company: ResolvedMergeCompany;
  plan: Awaited<ReturnType<typeof collectMergePlan>>["plan"];
}) {
  const companyId = input.company.id;

  return await input.targetDb.transaction(async (tx) => {
    const importedProjectIds = input.plan.projectImports.map((project) => project.source.id);
    const existingImportedProjectIds = importedProjectIds.length > 0
      ? new Set(
        (await tx
          .select({ id: projects.id })
          .from(projects)
          .where(inArray(projects.id, importedProjectIds)))
          .map((row) => row.id),
      )
      : new Set<string>();
    const projectImports = input.plan.projectImports.filter((project) => !existingImportedProjectIds.has(project.source.id));
    const importedWorkspaceIds = projectImports.flatMap((project) => project.workspaces.map((workspace) => workspace.id));
    const existingImportedWorkspaceIds = importedWorkspaceIds.length > 0
      ? new Set(
        (await tx
          .select({ id: projectWorkspaces.id })
          .from(projectWorkspaces)
          .where(inArray(projectWorkspaces.id, importedWorkspaceIds)))
          .map((row) => row.id),
      )
      : new Set<string>();

    let insertedProjects = 0;
    let insertedProjectWorkspaces = 0;
    for (const project of projectImports) {
      await tx.insert(projects).values({
        id: project.source.id,
        companyId,
        goalId: project.targetGoalId,
        name: project.source.name,
        description: project.source.description,
        status: project.source.status,
        leadAgentId: project.targetLeadAgentId,
        targetDate: project.source.targetDate,
        color: project.source.color,
        pauseReason: project.source.pauseReason,
        pausedAt: project.source.pausedAt,
        executionWorkspacePolicy: project.source.executionWorkspacePolicy,
        archivedAt: project.source.archivedAt,
        createdAt: project.source.createdAt,
        updatedAt: project.source.updatedAt,
      });
      insertedProjects += 1;

      for (const workspace of project.workspaces) {
        if (existingImportedWorkspaceIds.has(workspace.id)) continue;
        await tx.insert(projectWorkspaces).values({
          id: workspace.id,
          companyId,
          projectId: project.source.id,
          name: workspace.name,
          sourceType: workspace.sourceType,
          cwd: workspace.cwd,
          repoUrl: workspace.repoUrl,
          repoRef: workspace.repoRef,
          defaultRef: workspace.defaultRef,
          visibility: workspace.visibility,
          setupCommand: workspace.setupCommand,
          cleanupCommand: workspace.cleanupCommand,
          remoteProvider: workspace.remoteProvider,
          remoteWorkspaceRef: workspace.remoteWorkspaceRef,
          sharedWorkspaceKey: workspace.sharedWorkspaceKey,
          metadata: workspace.metadata,
          isPrimary: workspace.isPrimary,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
        insertedProjectWorkspaces += 1;
      }
    }

    const issueCandidates = input.plan.issuePlans.filter(
      (plan): plan is PlannedIssueInsert => plan.action === "insert",
    );
    const issueCandidateIds = issueCandidates.map((issue) => issue.source.id);
    const existingIssueIds = issueCandidateIds.length > 0
      ? new Set(
        (await tx
          .select({ id: issues.id })
          .from(issues)
          .where(inArray(issues.id, issueCandidateIds)))
          .map((row) => row.id),
      )
      : new Set<string>();
    const issueInserts = issueCandidates.filter((issue) => !existingIssueIds.has(issue.source.id));

    let nextIssueNumber = 0;
    if (issueInserts.length > 0) {
      const [companyRow] = await tx
        .update(companies)
        .set({ issueCounter: sql`${companies.issueCounter} + ${issueInserts.length}` })
        .where(eq(companies.id, companyId))
        .returning({ issueCounter: companies.issueCounter });
      nextIssueNumber = companyRow.issueCounter - issueInserts.length + 1;
    }

    const insertedIssueIdentifiers = new Map<string, string>();
    let insertedIssues = 0;
    for (const issue of issueInserts) {
      const issueNumber = nextIssueNumber;
      nextIssueNumber += 1;
      const identifier = `${input.company.issuePrefix}-${issueNumber}`;
      insertedIssueIdentifiers.set(issue.source.id, identifier);
      await tx.insert(issues).values({
        id: issue.source.id,
        companyId,
        projectId: issue.targetProjectId,
        projectWorkspaceId: issue.targetProjectWorkspaceId,
        goalId: issue.targetGoalId,
        parentId: issue.source.parentId,
        title: issue.source.title,
        description: issue.source.description,
        status: issue.targetStatus,
        priority: issue.source.priority,
        assigneeAgentId: issue.targetAssigneeAgentId,
        assigneeUserId: issue.source.assigneeUserId,
        checkoutRunId: null,
        executionRunId: null,
        executionAgentNameKey: null,
        executionLockedAt: null,
        createdByAgentId: issue.targetCreatedByAgentId,
        createdByUserId: issue.source.createdByUserId,
        issueNumber,
        identifier,
        requestDepth: issue.source.requestDepth,
        billingCode: issue.source.billingCode,
        assigneeAdapterOverrides: issue.targetAssigneeAgentId ? issue.source.assigneeAdapterOverrides : null,
        executionWorkspaceId: null,
        executionWorkspacePreference: null,
        executionWorkspaceSettings: null,
        startedAt: issue.source.startedAt,
        completedAt: issue.source.completedAt,
        cancelledAt: issue.source.cancelledAt,
        hiddenAt: issue.source.hiddenAt,
        createdAt: issue.source.createdAt,
        updatedAt: issue.source.updatedAt,
      });
      insertedIssues += 1;
    }

    const commentCandidates = input.plan.commentPlans.filter(
      (plan): plan is PlannedCommentInsert => plan.action === "insert",
    );
    const commentCandidateIds = commentCandidates.map((comment) => comment.source.id);
    const existingCommentIds = commentCandidateIds.length > 0
      ? new Set(
        (await tx
          .select({ id: issueComments.id })
          .from(issueComments)
          .where(inArray(issueComments.id, commentCandidateIds)))
          .map((row) => row.id),
      )
      : new Set<string>();

    let insertedComments = 0;
    for (const comment of commentCandidates) {
      if (existingCommentIds.has(comment.source.id)) continue;
      const parentExists = await tx
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.id, comment.source.issueId), eq(issues.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!parentExists) continue;
      await tx.insert(issueComments).values({
        id: comment.source.id,
        companyId,
        issueId: comment.source.issueId,
        authorAgentId: comment.targetAuthorAgentId,
        authorUserId: comment.source.authorUserId,
        body: comment.source.body,
        createdAt: comment.source.createdAt,
        updatedAt: comment.source.updatedAt,
      });
      insertedComments += 1;
    }

    const documentCandidates = input.plan.documentPlans.filter(
      (plan): plan is PlannedIssueDocumentInsert | PlannedIssueDocumentMerge =>
        plan.action === "insert" || plan.action === "merge_existing",
    );
    let insertedDocuments = 0;
    let mergedDocuments = 0;
    let insertedDocumentRevisions = 0;
    for (const documentPlan of documentCandidates) {
      const parentExists = await tx
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.id, documentPlan.source.issueId), eq(issues.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!parentExists) continue;

      const conflictingKeyDocument = await tx
        .select({ documentId: issueDocuments.documentId })
        .from(issueDocuments)
        .where(and(eq(issueDocuments.issueId, documentPlan.source.issueId), eq(issueDocuments.key, documentPlan.source.key)))
        .then((rows) => rows[0] ?? null);
      if (
        conflictingKeyDocument
        && conflictingKeyDocument.documentId !== documentPlan.source.documentId
      ) {
        continue;
      }

      const existingDocument = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, documentPlan.source.documentId))
        .then((rows) => rows[0] ?? null);

      if (!existingDocument) {
        await tx.insert(documents).values({
          id: documentPlan.source.documentId,
          companyId,
          title: documentPlan.source.title,
          format: documentPlan.source.format,
          latestBody: documentPlan.source.latestBody,
          latestRevisionId: documentPlan.latestRevisionId,
          latestRevisionNumber: documentPlan.latestRevisionNumber,
          createdByAgentId: documentPlan.targetCreatedByAgentId,
          createdByUserId: documentPlan.source.createdByUserId,
          updatedByAgentId: documentPlan.targetUpdatedByAgentId,
          updatedByUserId: documentPlan.source.updatedByUserId,
          createdAt: documentPlan.source.documentCreatedAt,
          updatedAt: documentPlan.source.documentUpdatedAt,
        });
        await tx.insert(issueDocuments).values({
          id: documentPlan.source.id,
          companyId,
          issueId: documentPlan.source.issueId,
          documentId: documentPlan.source.documentId,
          key: documentPlan.source.key,
          createdAt: documentPlan.source.linkCreatedAt,
          updatedAt: documentPlan.source.linkUpdatedAt,
        });
        insertedDocuments += 1;
      } else {
        const existingLink = await tx
          .select({ id: issueDocuments.id })
          .from(issueDocuments)
          .where(eq(issueDocuments.documentId, documentPlan.source.documentId))
          .then((rows) => rows[0] ?? null);
        if (!existingLink) {
          await tx.insert(issueDocuments).values({
            id: documentPlan.source.id,
            companyId,
            issueId: documentPlan.source.issueId,
            documentId: documentPlan.source.documentId,
            key: documentPlan.source.key,
            createdAt: documentPlan.source.linkCreatedAt,
            updatedAt: documentPlan.source.linkUpdatedAt,
          });
        } else {
          await tx
            .update(issueDocuments)
            .set({
              issueId: documentPlan.source.issueId,
              key: documentPlan.source.key,
              updatedAt: documentPlan.source.linkUpdatedAt,
            })
            .where(eq(issueDocuments.documentId, documentPlan.source.documentId));
        }

        await tx
          .update(documents)
          .set({
            title: documentPlan.source.title,
            format: documentPlan.source.format,
            latestBody: documentPlan.source.latestBody,
            latestRevisionId: documentPlan.latestRevisionId,
            latestRevisionNumber: documentPlan.latestRevisionNumber,
            updatedByAgentId: documentPlan.targetUpdatedByAgentId,
            updatedByUserId: documentPlan.source.updatedByUserId,
            updatedAt: documentPlan.source.documentUpdatedAt,
          })
          .where(eq(documents.id, documentPlan.source.documentId));
        mergedDocuments += 1;
      }

      const existingRevisionIds = new Set(
        (
          await tx
            .select({ id: documentRevisions.id })
            .from(documentRevisions)
            .where(eq(documentRevisions.documentId, documentPlan.source.documentId))
        ).map((row) => row.id),
      );
      for (const revisionPlan of documentPlan.revisionsToInsert) {
        if (existingRevisionIds.has(revisionPlan.source.id)) continue;
        await tx.insert(documentRevisions).values({
          id: revisionPlan.source.id,
          companyId,
          documentId: documentPlan.source.documentId,
          revisionNumber: revisionPlan.targetRevisionNumber,
          body: revisionPlan.source.body,
          changeSummary: revisionPlan.source.changeSummary,
          createdByAgentId: revisionPlan.targetCreatedByAgentId,
          createdByUserId: revisionPlan.source.createdByUserId,
          createdAt: revisionPlan.source.createdAt,
        });
        insertedDocumentRevisions += 1;
      }
    }

    const attachmentCandidates = input.plan.attachmentPlans.filter(
      (plan): plan is PlannedAttachmentInsert => plan.action === "insert",
    );
    const existingAttachmentIds = new Set(
      (
        await tx
          .select({ id: issueAttachments.id })
          .from(issueAttachments)
          .where(eq(issueAttachments.companyId, companyId))
      ).map((row) => row.id),
    );
    let insertedAttachments = 0;
    let skippedMissingAttachmentObjects = 0;
    for (const attachment of attachmentCandidates) {
      if (existingAttachmentIds.has(attachment.source.id)) continue;
      const parentExists = await tx
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.id, attachment.source.issueId), eq(issues.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!parentExists) continue;

      const body = await readSourceAttachmentBody(
        input.sourceStorages,
        companyId,
        attachment.source.objectKey,
      );
      if (!body) {
        skippedMissingAttachmentObjects += 1;
        continue;
      }
      await input.targetStorage.putObject(
        companyId,
        attachment.source.objectKey,
        body,
        attachment.source.contentType,
      );

      await tx.insert(assets).values({
        id: attachment.source.assetId,
        companyId,
        provider: attachment.source.provider,
        objectKey: attachment.source.objectKey,
        contentType: attachment.source.contentType,
        byteSize: attachment.source.byteSize,
        sha256: attachment.source.sha256,
        originalFilename: attachment.source.originalFilename,
        createdByAgentId: attachment.targetCreatedByAgentId,
        createdByUserId: attachment.source.createdByUserId,
        createdAt: attachment.source.assetCreatedAt,
        updatedAt: attachment.source.assetUpdatedAt,
      });

      await tx.insert(issueAttachments).values({
        id: attachment.source.id,
        companyId,
        issueId: attachment.source.issueId,
        assetId: attachment.source.assetId,
        issueCommentId: attachment.targetIssueCommentId,
        createdAt: attachment.source.attachmentCreatedAt,
        updatedAt: attachment.source.attachmentUpdatedAt,
      });
      insertedAttachments += 1;
    }

    return {
      insertedProjects,
      insertedProjectWorkspaces,
      insertedIssues,
      insertedComments,
      insertedDocuments,
      mergedDocuments,
      insertedDocumentRevisions,
      insertedAttachments,
      skippedMissingAttachmentObjects,
      insertedIssueIdentifiers,
    };
  });
}

export async function worktreeMergeHistoryCommand(sourceArg: string | undefined, opts: WorktreeMergeHistoryOptions): Promise<void> {
  if (opts.apply && opts.dry) {
    throw new Error("--apply 和 --dry 不能同时使用。");
  }

  if (sourceArg && opts.from) {
    throw new Error("位置参数 source 和 --from 不能同时使用。");
  }

  const targetEndpoint = opts.to
    ? resolveWorktreeEndpointFromSelector(opts.to, { allowCurrent: true })
    : resolveCurrentWorktreeEndpoint();
  const sourceEndpoint = opts.from
    ? resolveWorktreeEndpointFromSelector(opts.from, { allowCurrent: true })
    : sourceArg
      ? resolveWorktreeEndpointFromSelector(sourceArg, { allowCurrent: true })
      : await promptForSourceEndpoint(targetEndpoint.rootPath);

  if (path.resolve(sourceEndpoint.configPath) === path.resolve(targetEndpoint.configPath)) {
    throw new Error("源和目标 Paperclip 配置相同。请为 --from 和 --to 选择不同的 worktree。");
  }

  const scopes = parseWorktreeMergeScopes(opts.scope);
  const sourceHandle = await openConfiguredDb(sourceEndpoint.configPath);
  const targetHandle = await openConfiguredDb(targetEndpoint.configPath);
  const sourceStorages = resolveAttachmentLookupStorages({
    sourceEndpoint,
    targetEndpoint,
  });
  const targetStorage = openConfiguredStorage(targetEndpoint.configPath);

  try {
    const company = await resolveMergeCompany({
      sourceDb: sourceHandle.db,
      targetDb: targetHandle.db,
      selector: opts.company,
    });
    let collected = await collectMergePlan({
      sourceDb: sourceHandle.db,
      targetDb: targetHandle.db,
      company,
      scopes,
    });
    if (!opts.yes) {
      const projectSelections = await promptForProjectMappings({
        plan: collected.plan,
        sourceProjects: collected.sourceProjects,
        targetProjects: collected.targetProjects,
      });
      if (
        projectSelections.importProjectIds.length > 0
        || Object.keys(projectSelections.projectIdOverrides).length > 0
      ) {
        collected = await collectMergePlan({
          sourceDb: sourceHandle.db,
          targetDb: targetHandle.db,
          company,
          scopes,
          importProjectIds: projectSelections.importProjectIds,
          projectIdOverrides: projectSelections.projectIdOverrides,
        });
      }
    }

    console.log(renderMergePlan(collected.plan, {
      sourcePath: `${sourceEndpoint.label} (${sourceEndpoint.rootPath})`,
      targetPath: `${targetEndpoint.label} (${targetEndpoint.rootPath})`,
      unsupportedRunCount: collected.unsupportedRunCount,
    }));

    if (!opts.apply) {
      return;
    }

    const confirmed = opts.yes
      ? true
      : await p.confirm({
        message: `将 ${collected.plan.counts.issuesToInsert} 个任务和 ${collected.plan.counts.commentsToInsert} 条评论从 ${sourceEndpoint.label} 导入到 ${targetEndpoint.label} 吗？`,
        initialValue: false,
      });
    if (p.isCancel(confirmed) || !confirmed) {
      p.log.warn("导入已取消。");
      return;
    }

    const applied = await applyMergePlan({
      sourceStorages,
      targetStorage,
      targetDb: targetHandle.db,
      company,
      plan: collected.plan,
    });
    if (applied.skippedMissingAttachmentObjects > 0) {
      p.log.warn(
        `已跳过 ${applied.skippedMissingAttachmentObjects} 个附件，其源文件在存储中不存在。`,
      );
    }
    p.outro(
      pc.green(
        `已将 ${applied.insertedProjects} 个项目（${applied.insertedProjectWorkspaces} 个工作区）、${applied.insertedIssues} 个任务、${applied.insertedComments} 条评论、${applied.insertedDocuments} 篇文档（${applied.insertedDocumentRevisions} 个修订，合并 ${applied.mergedDocuments} 篇）和 ${applied.insertedAttachments} 个附件导入 ${company.issuePrefix}。`,
      ),
    );
  } finally {
    await targetHandle.stop();
    await sourceHandle.stop();
  }
}

async function backupWorktreeReseedTarget(input: {
  targetConfig: PaperclipConfig;
  targetPaths: WorktreeLocalPaths;
}): Promise<string> {
  if (input.targetConfig.database.mode !== "embedded-postgres") {
    throw new Error("托管 worktree 修复要求目标使用嵌入式 PostgreSQL。");
  }
  const targetHandle = await ensureEmbeddedPostgres(
    input.targetConfig.database.embeddedPostgresDataDir,
    input.targetConfig.database.embeddedPostgresPort,
  );
  try {
    const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${targetHandle.port}/postgres`;
    await ensurePostgresDatabase(adminConnectionString, "paperclip");
    const result = await runDatabaseBackup({
      connectionString: `postgres://paperclip:paperclip@127.0.0.1:${targetHandle.port}/paperclip`,
      backupDir: path.resolve(input.targetPaths.backupDir, "repair"),
      retention: { dailyDays: 30, weeklyWeeks: 12, monthlyMonths: 12 },
      filenamePrefix: `${input.targetPaths.instanceId}-pre-repair`,
      backupEngine: "auto",
      includeMigrationJournal: true,
    });
    return formatDatabaseBackupResult(result);
  } finally {
    if (targetHandle.startedByThisProcess) await targetHandle.stop();
  }
}

async function runWorktreeReseed(opts: WorktreeReseedOptions): Promise<void> {
  const seedMode = opts.seedMode ?? "full";
  if (!isWorktreeSeedMode(seedMode)) {
    throw new Error(`不支持种子数据模式“${seedMode}”。可用值：minimal、full。`);
  }

  const targetEndpoint = opts.to
    ? resolveWorktreeEndpointFromSelector(opts.to, { allowCurrent: true })
    : resolveCurrentWorktreeEndpoint();
  const source = resolveWorktreeReseedSource(opts);

  if (path.resolve(source.configPath) === path.resolve(targetEndpoint.configPath)) {
    throw new Error("源和目标 Paperclip 配置相同。请为 --from 和 --to 设置不同的值。");
  }
  if (!existsSync(source.configPath)) {
    throw new Error(`未在 ${source.configPath} 找到源配置文件。`);
  }

  const targetConfig = readConfig(targetEndpoint.configPath);
  if (!targetConfig) {
    throw new Error(`未在 ${targetEndpoint.configPath} 找到目标配置文件。`);
  }
  const sourceConfig = readConfig(source.configPath);
  if (!sourceConfig) {
    throw new Error(`未在 ${source.configPath} 找到源配置文件。`);
  }

  const targetPaths = resolveWorktreeReseedTargetPaths({
    configPath: targetEndpoint.configPath,
    rootPath: targetEndpoint.rootPath,
  });
  const runningTargetPid = resolveRunningEmbeddedPostgresPid(targetConfig);
  if (runningTargetPid && !opts.allowLiveTarget) {
    throw new Error(
      `目标 worktree 数据库似乎正在运行（pid ${runningTargetPid}）。重新写入种子数据前，请停止 ${targetEndpoint.rootPath} 中的 Paperclip；如需跳过此保护，请使用 --allow-live-target 重新运行。`,
    );
  }

  const confirmed = opts.yes
    ? true
    : await p.confirm({
      message: `使用 ${seedMode} 种子模式，将 ${source.label} 的数据覆盖到 ${targetEndpoint.label} 的隔离 Paperclip 数据库吗？`,
      initialValue: false,
    });
  if (p.isCancel(confirmed) || !confirmed) {
    p.log.warn("重新写入种子数据已取消。");
    return;
  }

  if (runningTargetPid && opts.allowLiveTarget) {
    p.log.warning(`目标内嵌 PostgreSQL 似乎仍在运行（pid ${runningTargetPid}），继续操作。`);
  }

  const spinner = p.spinner();
  spinner.start(`正在使用 ${source.label} 的数据为 ${targetEndpoint.label} 重新写入种子（${seedMode}）……`);
  const markers = resolveWorktreeSeedMarkerPaths(targetEndpoint.configPath);
  mkdirSync(path.dirname(markers.lock), { recursive: true });
  const releaseSeedLock = await acquireWorktreeSeedLock(markers.lock);
  try {
    let targetBackupSummary: string | null = null;
    if (opts.backupTarget) {
      targetBackupSummary = await backupWorktreeReseedTarget({ targetConfig, targetPaths });
      p.log.message(pc.dim(`修复前备份（可恢复）：${targetBackupSummary}`));
    }
    markWorktreeSeedPending({
      configPath: targetEndpoint.configPath,
      sourceConfigPath: source.configPath,
      targetInstanceId: targetPaths.instanceId,
      seedMode,
    });
    const seeded = await runVerifiedWorktreeSeed({
      configPath: targetEndpoint.configPath,
      sourceConfigPath: source.configPath,
      sourceConfig,
      targetConfig,
      targetPaths,
      instanceId: targetPaths.instanceId,
      seedMode,
      preserveLiveWork: opts.preserveLiveWork,
      expectedCompanyId: nonEmpty(process.env.PAPERCLIP_SEED_EXPECTED_COMPANY_ID) ?? undefined,
      seedDatabase: seedWorktreeDatabase,
    });
    spinner.stop(`已为 ${targetEndpoint.label} 重新写入种子数据（${seedMode}）。`);
    p.log.message(pc.dim(`来源：${source.configPath}`));
    p.log.message(pc.dim(`目标：${targetEndpoint.configPath}`));
    p.log.message(pc.dim(`种子数据快照：${seeded.backupSummary}`));
    if (opts.preserveLiveWork) {
      p.log.warning("已保留复制的实时工作；此 worktree 实例可能会自动运行源实例的任务分配。");
    } else {
      p.log.message(
        pc.dim(`种子数据执行隔离：${formatSeededWorktreeExecutionQuarantineSummary(seeded.executionQuarantine)}`),
      );
    }
    p.log.message(pc.dim(`已暂停的定时例程：${seeded.pausedScheduledRoutines}`));
    for (const rebound of seeded.reboundWorkspaces) {
      p.log.message(
        pc.dim(`已重新绑定工作区 ${rebound.name}：${rebound.fromCwd} -> ${rebound.toCwd}`),
      );
    }
    p.outro(pc.green(`已为 ${targetEndpoint.label} 完成种子数据重写。`));
  } catch (error) {
    spinner.stop(pc.red("重新写入 worktree 数据库种子数据失败。"));
    throw error;
  } finally {
    await releaseSeedLock();
  }
}

export async function worktreeReseedCommand(opts: WorktreeReseedOptions): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclipai worktree reseed ")));
  await runWorktreeReseed(opts);
}

export async function worktreeRepairCommand(opts: WorktreeRepairOptions): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclipai worktree repair ")));

  const seedMode = opts.seedMode ?? "minimal";
  if (!isWorktreeSeedMode(seedMode)) {
    throw new Error(`不支持种子数据模式“${seedMode}”。可用值：minimal、full。`);
  }

  const target = await ensureRepairTargetWorktree({
    selector: nonEmpty(opts.branch) ?? undefined,
    seedMode,
    opts,
  });
  if (!target) {
    p.log.warn("当前检出是主仓库 worktree。请传入 --branch 创建或修复关联 worktree。");
    p.outro(pc.yellow("未修复 worktree。"));
    return;
  }

  const source = resolveWorktreeRepairSource(opts);
  if (!existsSync(source.configPath)) {
    throw new Error(`未在 ${source.configPath} 找到源配置文件。`);
  }
  if (path.resolve(source.configPath) === path.resolve(target.configPath)) {
    throw new Error("源和目标 Paperclip 配置相同。请使用 --from-config/--from-instance 将修复操作指向其他来源。");
  }

  const targetConfig = existsSync(target.configPath) ? readConfig(target.configPath) : null;
  const targetEnvEntries = readPaperclipEnvEntries(resolvePaperclipEnvFile(target.configPath));
  const targetHasWorktreeEnv = Boolean(
    nonEmpty(targetEnvEntries.PAPERCLIP_HOME) && nonEmpty(targetEnvEntries.PAPERCLIP_INSTANCE_ID),
  );

  if (targetConfig && targetHasWorktreeEnv && opts.noSeed) {
    p.log.message(pc.dim(`目标 ${target.label} 已有 worktree 本地 config/env；因传入 --no-seed，跳过种子数据重写。`));
    p.outro(pc.green(`目标 ${target.label} 的 worktree 元数据正常。`));
    return;
  }

  if (targetConfig && targetHasWorktreeEnv) {
    await runWorktreeReseed({
      fromConfig: source.configPath,
      to: target.rootPath,
      seedMode,
      preserveLiveWork: opts.preserveLiveWork,
      yes: true,
      allowLiveTarget: opts.allowLiveTarget,
    });
    return;
  }

  const repairInstanceId = sanitizeWorktreeInstanceId(path.basename(target.rootPath));
  const repairPaths = resolveWorktreeLocalPaths({
    cwd: target.rootPath,
    homeDir: resolveWorktreeHome(opts.home),
    instanceId: repairInstanceId,
  });
  const runningTargetPid = readRunningPostmasterPid(path.resolve(repairPaths.embeddedPostgresDataDir, "postmaster.pid"));
  if (runningTargetPid && !opts.allowLiveTarget) {
    throw new Error(
      `目标 worktree 数据库似乎正在运行（pid ${runningTargetPid}）。修复前，请停止 ${target.rootPath} 中的 Paperclip；如需跳过此保护，请使用 --allow-live-target 重新运行。`,
    );
  }
  if (runningTargetPid && opts.allowLiveTarget) {
    p.log.warning(`目标内嵌 PostgreSQL 似乎仍在运行（pid ${runningTargetPid}），继续操作。`);
  }

  const originalCwd = process.cwd();
  try {
    process.chdir(target.rootPath);
    await runWorktreeInit({
      home: opts.home,
      fromConfig: source.configPath,
      fromDataDir: opts.fromDataDir,
      fromInstance: opts.fromInstance,
      seed: opts.noSeed ? false : true,
      seedMode,
      preserveLiveWork: opts.preserveLiveWork,
      force: true,
    });
  } finally {
    process.chdir(originalCwd);
  }
}

export function registerWorktreeCommands(program: Command): void {
  const worktree = program.command("worktree").description("worktree 本地 Paperclip 实例工具");

  program
    .command("worktree:make")
    .description("将 ~/NAME 创建为 Git worktree，并在其中初始化隔离的 Paperclip 实例")
    .argument("<name>", "worktree 名称——必要时自动添加 paperclip- 前缀（创建于 ~/paperclip-NAME）")
    .option("--start-point <ref>", "新分支所基于的远程引用（环境变量：PAPERCLIP_WORKTREE_START_POINT）")
    .option("--instance <id>", "明确指定隔离实例 ID")
    .option("--home <path>", `worktree 实例主目录（环境变量：PAPERCLIP_WORKTREES_DIR，默认：${DEFAULT_WORKTREE_HOME}）`)
    .option("--from-config <path>", "用于生成种子数据的源 config.json")
    .option("--from-data-dir <path>", "用于推导源配置的源 PAPERCLIP_HOME")
    .option("--from-instance <id>", "用于推导源配置的源实例 ID", "default")
    .option("--server-port <port>", "首选服务端口", (value) => Number(value))
    .option("--db-port <port>", "首选嵌入式 Postgres 端口", (value) => Number(value))
    .option("--seed-mode <mode>", "种子数据配置：minimal 或 full（默认：minimal）", "minimal")
    .option("--preserve-live-work", "不要隔离种子 worktree 中复制的智能体工作或工作区运行时服务", false)
    .option("--no-seed", "跳过从源实例导入数据库种子数据")
    .option("--force", "替换现有仓库本地配置和隔离实例数据", false)
    .action(worktreeMakeCommand);

  worktree
    .command("init")
    .description("为此 worktree 创建仓库本地 config/env 和隔离实例")
    .option("--name <name>", "用于生成实例 ID 的显示名称")
    .option("--instance <id>", "明确指定隔离实例 ID")
    .option("--home <path>", `worktree 实例主目录（环境变量：PAPERCLIP_WORKTREES_DIR，默认：${DEFAULT_WORKTREE_HOME}）`)
    .option("--from-config <path>", "用于生成种子数据的源 config.json")
    .option("--from-data-dir <path>", "用于推导源配置的源 PAPERCLIP_HOME")
    .option("--from-instance <id>", "用于推导源配置的源实例 ID", "default")
    .option("--server-port <port>", "首选服务端口", (value) => Number(value))
    .option("--db-port <port>", "首选嵌入式 Postgres 端口", (value) => Number(value))
    .option("--seed-mode <mode>", "种子数据配置：minimal 或 full（默认：minimal）", "minimal")
    .option("--preserve-live-work", "不要隔离种子 worktree 中复制的智能体工作或工作区运行时服务", false)
    .option("--no-seed", "跳过从源实例导入数据库种子数据")
    .option("--force", "替换现有仓库本地配置和隔离实例数据", false)
    .action(worktreeInitCommand);

  worktree
    .command("env")
    .description("输出当前 worktree 本地 Paperclip 实例的 shell 环境变量")
    .option("-c, --config <path>", "配置文件路径")
    .option("--json", "输出 JSON，而不是 shell 环境变量")
    .action(worktreeEnvCommand);

  worktree
    .command("ensure-seeded")
    .description("从源实例向待初始化的 worktree 数据库导入一次种子数据")
    .option("-c, --config <path>", "目标 worktree 配置文件路径")
    .option("--from-config <path>", "用于生成种子数据的源 config.json（默认使用待初始化标记中的值）")
    .option("--from-data-dir <path>", "用于推导源配置的源 PAPERCLIP_HOME")
    .option("--from-instance <id>", "用于推导源配置的源实例 ID")
    .option("--preserve-live-work", "不要隔离复制的智能体工作或工作区运行时服务", false)
    .action(worktreeEnsureSeededCommand);

  program
    .command("worktree:list")
    .description("列出此仓库中的 Git worktree，并标明哪些看起来是 Paperclip worktree")
    .option("--json", "输出 JSON，而不是文本")
    .action(worktreeListCommand);

  program
    .command("worktree:merge-history")
    .description("预览或导入其他 worktree 中的任务/评论历史到当前实例")
    .argument("[source]", "可选源 worktree 路径、目录名或分支名（为兼容旧版本，相当于 --from）")
    .option("--from <worktree>", "源 worktree 路径、目录名、分支名或 current")
    .option("--to <worktree>", "目标 worktree 路径、目录名、分支名或 current（默认：current）")
    .option("--company <id-or-prefix>", "所选源/目标实例中的共享公司 ID 或任务前缀")
    .option("--scope <items>", "要导入的范围，以逗号分隔（issues、comments）", "issues,comments")
    .option("--apply", "预览计划后应用导入", false)
    .option("--dry", "仅预览，不导入任何内容", false)
    .option("--yes", "应用导入时跳过交互式确认提示", false)
    .action(worktreeMergeHistoryCommand);

  worktree
    .command("reseed")
    .description("从其他 Paperclip 实例或 worktree 重新导入数据到现有 worktree 本地实例")
    .option("--from <worktree>", "源 worktree 路径、目录名、分支名或 current")
    .option("--to <worktree>", "目标 worktree 路径、目录名、分支名或 current（默认：current）")
    .option("--from-config <path>", "用于生成种子数据的源 config.json")
    .option("--from-data-dir <path>", "用于推导源配置的源 PAPERCLIP_HOME")
    .option("--from-instance <id>", "用于推导源配置的源实例 ID")
    .option("--seed-mode <mode>", "种子数据配置：minimal 或 full（默认：full）", "full")
    .option("--preserve-live-work", "不要隔离种子 worktree 中复制的智能体工作或工作区运行时服务", false)
    .option("--yes", "跳过破坏性操作确认提示", false)
    .option("--allow-live-target", "覆盖要求先停止目标 worktree 数据库的保护措施", false)
    .option("--backup-target", "重新导入数据前保留目标隔离数据库的完整可恢复备份", false)
    .action(worktreeReseedCommand);

  worktree
    .command("repair")
    .description("创建或修复关联的 worktree 本地 Paperclip 实例，不修改主检出目录")
    .option("--branch <name>", "要修复的现有分支/worktree 选择器，或要在 .paperclip/worktrees 下创建的分支名称")
    .option("--home <path>", `worktree 实例主目录（环境变量：PAPERCLIP_WORKTREES_DIR，默认：${DEFAULT_WORKTREE_HOME}）`)
    .option("--from-config <path>", "用于生成种子数据的源 config.json")
    .option("--from-data-dir <path>", "用于推导源配置的源 PAPERCLIP_HOME")
    .option("--from-instance <id>", "用于推导源配置的源实例 ID（默认：default）")
    .option("--seed-mode <mode>", "种子数据配置：minimal 或 full（默认：minimal）", "minimal")
    .option("--preserve-live-work", "不要隔离种子 worktree 中复制的智能体工作或工作区运行时服务", false)
    .option("--no-seed", "仅修复元数据；初始化缺失的 worktree 配置时跳过重新导入数据", false)
    .option("--allow-live-target", "覆盖要求先停止目标 worktree 数据库的保护措施", false)
    .action(worktreeRepairCommand);

  program
    .command("worktree:cleanup")
    .description("安全移除 worktree、对应分支及其隔离实例数据")
    .argument("<name>", "worktree 名称——必要时自动添加 paperclip- 前缀")
    .option("--instance <id>", "明确指定实例 ID（与 worktree 名称不同时使用）")
    .option("--home <path>", `worktree 实例主目录（环境变量：PAPERCLIP_WORKTREES_DIR，默认：${DEFAULT_WORKTREE_HOME}）`)
    .option("--force", "跳过安全检查（未提交的更改、独有提交）", false)
    .action(worktreeCleanupCommand);
}
