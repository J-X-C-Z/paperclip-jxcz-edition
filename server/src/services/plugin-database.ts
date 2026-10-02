import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  pluginDatabaseNamespaces,
  pluginMigrations,
  plugins,
} from "@paperclipai/db";
import type {
  PaperclipPluginManifestV1,
  PluginDatabaseCoreReadTable,
  PluginMigrationRecord,
} from "@paperclipai/shared";

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_POSTGRES_IDENTIFIER_LENGTH = 63;

type SqlRef = { schema: string; table: string; keyword: string };
type QualifiedRefPattern =
  | { pattern: RegExp; groups: "keyword-schema-table" }
  | { pattern: RegExp; groups: "schema-table"; keyword: string };

export type PluginDatabaseRuntimeResult<T = Record<string, unknown>> = {
  rows?: T[];
  rowCount?: number;
};

export function derivePluginDatabaseNamespace(
  pluginKey: string,
  namespaceSlug?: string,
): string {
  const hash = createHash("sha256").update(pluginKey).digest("hex").slice(0, 10);
  const slug = (namespaceSlug ?? pluginKey)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 36) || "plugin";
  const namespace = `plugin_${slug}_${hash}`;
  return namespace.slice(0, MAX_POSTGRES_IDENTIFIER_LENGTH);
}

function assertIdentifier(value: string, label = "identifier"): string {
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(`Unsafe SQL ${label}: ${value}`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${assertIdentifier(value).replaceAll("\"", "\"\"")}"`;
}

function splitSqlStatements(input: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | "\"" | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    const next = input[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) {
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === ";") {
      const statement = input.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }

  const trailing = input.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
}

function stripSqlForKeywordScan(input: string): string {
  return input
    .replace(/'([^']|'')*'/g, "''")
    .replace(/"([^"]|"")*"/g, "\"\"")
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function normaliseSql(input: string): string {
  return stripSqlForKeywordScan(input).replace(/\s+/g, " ").trim().toLowerCase();
}

function extractQualifiedRefs(statement: string): SqlRef[] {
  const refs: SqlRef[] = [];
  const patterns: QualifiedRefPattern[] = [
    {
      pattern: /\b(from|join|references|into|update)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\."?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
      groups: "keyword-schema-table",
    },
    {
      pattern: /\b(alter\s+table|create\s+table|create\s+view|drop\s+table|truncate\s+table)\s+(?:if\s+(?:not\s+)?exists\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\."?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
      groups: "keyword-schema-table",
    },
    {
      pattern: /\bcreate\s+(?:unique\s+)?index(?:\s+concurrently)?\s+(?:if\s+not\s+exists\s+)?"?[A-Za-z_][A-Za-z0-9_]*"?\s+on\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\."?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
      groups: "schema-table",
      keyword: "create index",
    },
  ];

  for (const { pattern, ...mapping } of patterns) {
    for (const match of statement.matchAll(pattern)) {
      if (mapping.groups === "keyword-schema-table") {
        refs.push({ keyword: match[1]!.toLowerCase(), schema: match[2]!, table: match[3]! });
      } else {
        refs.push({ keyword: mapping.keyword, schema: match[1]!, table: match[2]! });
      }
    }
  }
  return refs;
}

function assertAllowedPublicRead(
  ref: SqlRef,
  allowedCoreReadTables: ReadonlySet<string>,
): void {
  if (ref.schema !== "public") return;
  if (!allowedCoreReadTables.has(ref.table)) {
    throw new Error(`Plugin SQL references public.${ref.table}, which is not whitelisted`);
  }
  if (!["from", "join", "references"].includes(ref.keyword)) {
    throw new Error(`Plugin SQL cannot mutate or define objects in public.${ref.table}`);
  }
}

function assertNoBannedSql(statement: string): void {
  const normalized = normaliseSql(statement);
  const banned = [
    /\bcreate\s+extension\b/,
    /\bcreate\s+(?:event\s+)?trigger\b/,
    /\bcreate\s+(?:or\s+replace\s+)?function\b/,
    /\bcreate\s+language\b/,
    /\bgrant\b/,
    /\brevoke\b/,
    /\bsecurity\s+definer\b/,
    /\bcopy\b/,
    /\bcall\b/,
    /\bdo\s+(?:\$\$|language\b)/,
  ];
  const matched = banned.find((pattern) => pattern.test(normalized));
  if (matched) {
    throw new Error(`Plugin SQL contains a disallowed statement or clause: ${matched.source}`);
  }
}

export function validatePluginMigrationStatement(
  statement: string,
  namespace: string,
  coreReadTables: readonly PluginDatabaseCoreReadTable[] = [],
): void {
  assertIdentifier(namespace, "namespace");
  assertNoBannedSql(statement);

  const normalized = normaliseSql(statement);
  if (/^\s*(drop|truncate)\b/.test(normalized)) {
    throw new Error("Destructive plugin migrations are not allowed in Phase 1");
  }

  if (/\bdelete\s+from\b/.test(normalized)) {
    throw new Error("Plugin migrations cannot delete data");
  }

  const ddlOrBackfillAllowed =
    /^(create|alter|comment)\b/.test(normalized) ||
    /^(insert\s+into|update)\b/.test(normalized) ||
    (normalized.startsWith("with ") && /\b(insert\s+into|update)\b/.test(normalized));
  if (!ddlOrBackfillAllowed) {
    throw new Error("Plugin migrations may contain DDL or namespace-scoped backfill statements only");
  }

  const refs = extractQualifiedRefs(statement);
  if (refs.length === 0 && !normalized.startsWith("comment ")) {
    throw new Error("Plugin migration objects must use fully qualified schema names");
  }

  const objectRefKeywords = new Set([
    "alter table",
    "create index",
    "create table",
    "create view",
    "drop table",
    "into",
    "truncate table",
    "update",
  ]);
  const hasQualifiedObjectRef = refs.some((ref) => objectRefKeywords.has(ref.keyword));
  if (!hasQualifiedObjectRef && !normalized.startsWith("comment ")) {
    throw new Error("Plugin migration objects must use fully qualified schema names");
  }

  const allowedCoreReadTables = new Set(coreReadTables);
  for (const ref of refs) {
    if (ref.schema === namespace) continue;
    if (ref.schema === "public") {
      assertAllowedPublicRead(ref, allowedCoreReadTables);
      continue;
    }
    throw new Error(`Plugin SQL references schema "${ref.schema}" outside namespace "${namespace}"`);
  }
}

export function validatePluginRuntimeQuery(
  query: string,
  namespace: string,
  coreReadTables: readonly PluginDatabaseCoreReadTable[] = [],
): void {
  const statements = splitSqlStatements(query);
  if (statements.length !== 1) {
    throw new Error("Plugin runtime SQL must contain exactly one statement");
  }
  const statement = statements[0]!;
  assertNoBannedSql(statement);
  const normalized = normaliseSql(statement);
  if (!normalized.startsWith("select ") && !normalized.startsWith("with ")) {
    throw new Error("ctx.db.query only allows SELECT statements");
  }
  if (/\b(insert|update|delete|alter|create|drop|truncate)\b/.test(normalized)) {
    throw new Error("ctx.db.query cannot contain mutation or DDL keywords");
  }

  const allowedCoreReadTables = new Set(coreReadTables);
  for (const ref of extractQualifiedRefs(statement)) {
    if (ref.schema === namespace) continue;
    if (ref.schema === "public") {
      assertAllowedPublicRead(ref, allowedCoreReadTables);
      continue;
    }
    throw new Error(`ctx.db.query cannot read schema "${ref.schema}"`);
  }
}

type RuntimeSqlToken = { text: string; kind: "word" | "identifier" | "literal" | "symbol"; depth: number };

/** Keep identifiers, but remove literal/comment contents before checking SQL structure. */
function runtimeSqlTokens(statement: string): RuntimeSqlToken[] {
  const tokens: RuntimeSqlToken[] = [];
  let depth = 0;
  for (let i = 0; i < statement.length;) {
    const char = statement[i]!;
    if (/\s/.test(char)) { i += 1; continue; }
    if (statement.startsWith("--", i)) {
      const end = statement.indexOf("\n", i + 2);
      i = end < 0 ? statement.length : end + 1;
      continue;
    }
    if (statement.startsWith("/*", i)) {
      let comments = 1;
      i += 2;
      while (i < statement.length && comments > 0) {
        if (statement.startsWith("/*", i)) { comments += 1; i += 2; }
        else if (statement.startsWith("*/", i)) { comments -= 1; i += 2; }
        else i += 1;
      }
      if (comments) throw new Error("Unterminated SQL comment");
      continue;
    }
    const dollarQuote = char === "$" ? statement.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0] : undefined;
    if (dollarQuote) {
      const end = statement.indexOf(dollarQuote, i + dollarQuote.length);
      if (end < 0) throw new Error("Unterminated SQL literal");
      tokens.push({ text: "", kind: "literal", depth });
      i = end + dollarQuote.length;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      const escapedString = quote === "'" && i > 0 && /[eE]/.test(statement[i - 1]!)
        && (i < 2 || !/[A-Za-z0-9_]/.test(statement[i - 2]!));
      let value = "";
      let closed = false;
      i += 1;
      while (i < statement.length) {
        if (escapedString && statement[i] === "\\") { i += 2; continue; }
        if (statement[i] === quote) {
          if (statement[i + 1] === quote) { value += quote; i += 2; continue; }
          i += 1; closed = true; break;
        }
        value += statement[i]; i += 1;
      }
      if (!closed) throw new Error("Unterminated SQL literal or identifier");
      tokens.push({ text: quote === '"' ? value : "", kind: quote === '"' ? "identifier" : "literal", depth });
      continue;
    }
    const word = statement.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) { tokens.push({ text: word.toLowerCase(), kind: "word", depth }); i += word.length; continue; }
    if (char === ")") {
      depth -= 1;
      if (depth < 0) throw new Error("Unbalanced SQL parentheses");
    }
    tokens.push({ text: char, kind: "symbol", depth });
    if (char === "(") depth += 1;
    i += 1;
  }
  if (depth !== 0) throw new Error("Unbalanced SQL parentheses");
  return tokens;
}

export function validatePluginRuntimeExecute(query: string, namespace: string): void {
  assertIdentifier(namespace, "namespace");
  const tokens = runtimeSqlTokens(query);
  if (tokens.at(-1)?.text === ";") tokens.pop();
  if (!tokens.length || tokens.some(token => token.text === ";")) {
    throw new Error("Plugin runtime SQL must contain exactly one statement");
  }
  const keyword = (token: RuntimeSqlToken | undefined, word: string) => token?.kind === "word" && token.text === word;
  const identifier = (token: RuntimeSqlToken | undefined) => token?.kind === "word" || token?.kind === "identifier";
  const scan = tokens.map(token => token.kind === "word" || token.kind === "symbol" ? token.text : " ").join(" ");
  assertNoBannedSql(scan);
  if (tokens.some(token => token.kind === "word" && ["alter", "create", "drop", "truncate"].includes(token.text))) {
    throw new Error("ctx.db.execute cannot contain DDL keywords");
  }

  const main = keyword(tokens[0], "with")
    ? tokens.find((token, index) => index > 0 && token.depth === 0 && token.kind === "word" && ["insert", "update", "delete", "select"].includes(token.text))
    : tokens[0];
  if (!main || main.kind !== "word" || !["insert", "update", "delete"].includes(main.text)) {
    throw new Error("ctx.db.execute only allows INSERT, UPDATE, or DELETE (optionally preceded by WITH)");
  }

  // Unqualified reads can refer to declared CTEs, but writes always need an
  // explicit namespace, including every data-modifying CTE and the final DML.
  const ctes: Array<{ name: string; visibleAfter: number; scopeStart: number; scopeEnd: number }> = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (!keyword(tokens[i], "with")) continue;
    const scopeDepth = tokens[i]!.depth;
    const scopeEndIndex = tokens.findIndex((token, index) => index > i && token.depth < scopeDepth);
    const scopeEnd = scopeEndIndex < 0 ? tokens.length : scopeEndIndex;
    const recursive = keyword(tokens[i + 1], "recursive");
    let next = i + (recursive ? 2 : 1);
    while (identifier(tokens[next])) {
      const name = tokens[next]!.text;
      next += 1;
      if (tokens[next]?.text === "(") {
        const depth = tokens[next]!.depth;
        next += 1;
        while (next < scopeEnd && !(tokens[next]?.text === ")" && tokens[next]?.depth === depth)) next += 1;
        next += 1;
      }
      if (!keyword(tokens[next], "as")) break;
      next += 1;
      if (keyword(tokens[next], "not")) next += 1;
      if (keyword(tokens[next], "materialized")) next += 1;
      if (tokens[next]?.text !== "(") break;
      const bodyDepth = tokens[next]!.depth;
      next += 1;
      while (next < scopeEnd && !(tokens[next]?.text === ")" && tokens[next]?.depth === bodyDepth)) next += 1;
      ctes.push({ name, visibleAfter: recursive ? i : next, scopeStart: i, scopeEnd });
      next += 1;
      if (tokens[next]?.text !== ",") break;
      next += 1;
    }
  }
  const isVisibleCte = (name: string, index: number) => ctes.some(cte => cte.name === name
    && index > cte.visibleAfter && index > cte.scopeStart && index < cte.scopeEnd);

  function checkTable(index: number, write: boolean) {
    const only = keyword(tokens[index], "only");
    if (only || keyword(tokens[index], "lateral")) index += 1;
    if (only && tokens[index]?.text === "(") index += 1;
    // A parenthesized subquery has its own FROM/JOIN references checked below.
    if (tokens[index]?.text === "(" && !write) return;
    const schemaOrName = tokens[index];
    if (!identifier(schemaOrName)) throw new Error("Plugin SQL table references must be fully qualified");
    if (tokens[index + 1]?.text === ".") {
      if (schemaOrName!.text !== namespace || !identifier(tokens[index + 2]) || tokens[index + 3]?.text === ".") {
        throw new Error(`ctx.db.execute target/reference must be inside plugin namespace "${namespace}"`);
      }
    } else if (write || (!isVisibleCte(schemaOrName!.text, index) && tokens[index + 1]?.text !== "(")) {
      throw new Error(`ctx.db.execute target/reference must be fully qualified inside plugin namespace "${namespace}"`);
    }
  }

  const readDepths = new Set<number>();
  let writeTargets = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind === "word" && ["where", "group", "order", "having", "limit", "returning", "set", "union"].includes(token.text)) readDepths.delete(token.depth);
    if (token.text === ")") readDepths.delete(token.depth + 1);
    if (token.text === "," && readDepths.has(token.depth)) checkTable(i + 1, false);
    if (keyword(token, "insert")) {
      if (!keyword(tokens[i + 1], "into")) throw new Error("INSERT must name its plugin namespace target");
      checkTable(i + 2, true); writeTargets += 1;
    } else if (keyword(token, "update") && !keyword(tokens[i - 1], "do")
      && !keyword(tokens[i - 1], "for")
      && !(keyword(tokens[i - 1], "key") && keyword(tokens[i - 2], "no") && keyword(tokens[i - 3], "for"))) {
      // SELECT row-lock clauses name no write target; their FROM/JOIN sources
      // still go through the same namespace checks below.
      checkTable(i + 1, true); writeTargets += 1;
    } else if (keyword(token, "delete")) {
      if (!keyword(tokens[i + 1], "from")) throw new Error("DELETE must name its plugin namespace target");
      checkTable(i + 2, true); writeTargets += 1;
    } else if (keyword(token, "into") && !keyword(tokens[i - 1], "insert")) {
      throw new Error("ctx.db.execute cannot contain SELECT INTO DDL");
    } else if (keyword(token, "from") || keyword(token, "join") || keyword(token, "using")) {
      // FROM in EXTRACT/SUBSTRING and IS DISTINCT FROM is an expression,
      // not a relation. Those tokens cannot select a table on their own.
      if (keyword(tokens[i - 1], "distinct")) continue;
      const open = tokens.slice(0, i).findLastIndex(candidate => candidate.text === "(" && candidate.depth === token.depth - 1);
      if (open >= 1 && ["extract", "substring", "trim", "overlay"].some(name => keyword(tokens[open - 1], name))) continue;
      if (keyword(token, "using") && tokens[i + 1]?.text === "(") continue;
      checkTable(i + 1, false);
      readDepths.add(token.depth);
    }
  }
  if (!writeTargets) throw new Error(`ctx.db.execute target must be inside plugin namespace "${namespace}"`);
}

function bindSql(statement: string, params: readonly unknown[] = []): SQL {
  // Safe only after callers run the plugin SQL validators above.
  if (params.length === 0) return sql.raw(statement);
  const chunks: SQL[] = [];
  let cursor = 0;
  const placeholderPattern = /\$(\d+)/g;
  const seen = new Set<number>();

  for (const match of statement.matchAll(placeholderPattern)) {
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 1 || index > params.length) {
      throw new Error(`SQL placeholder $${match[1]} has no matching parameter`);
    }
    chunks.push(sql.raw(statement.slice(cursor, match.index)));
    chunks.push(sql`${params[index - 1]}`);
    seen.add(index);
    cursor = match.index! + match[0].length;
  }
  chunks.push(sql.raw(statement.slice(cursor)));
  if (seen.size !== params.length) {
    throw new Error("Every ctx.db parameter must be referenced by a $n placeholder");
  }
  return sql.join(chunks, sql.raw(""));
}

async function listSqlMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function resolveMigrationsDir(packageRoot: string, migrationsDir: string): string {
  const resolvedRoot = path.resolve(packageRoot);
  const resolvedDir = path.resolve(resolvedRoot, migrationsDir);
  const relative = path.relative(resolvedRoot, resolvedDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Plugin migrationsDir escapes package root: ${migrationsDir}`);
  }
  return resolvedDir;
}

type PluginDatabaseClient = Pick<Db, "select" | "insert" | "update" | "execute">;
type PluginDatabaseRootClient = PluginDatabaseClient & Partial<Pick<Db, "transaction">>;

export interface ApplyPluginMigrationsOptions {
  /**
   * Persist failed migration ledger rows. Fresh install uses false because the
   * caller owns a larger transaction and must roll back the plugin row and
   * namespace together.
   */
  persistFailure?: boolean;
}

export function pluginDatabaseService(db: PluginDatabaseRootClient) {
  async function getPluginRecord(pluginId: string) {
    const rows = await db.select().from(plugins).where(eq(plugins.id, pluginId)).limit(1);
    const plugin = rows[0];
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
    return plugin;
  }

  async function ensureNamespaceWithClient(
    client: PluginDatabaseClient,
    pluginId: string,
    manifest: PaperclipPluginManifestV1,
  ) {
    if (!manifest.database) return null;
    const namespaceName = derivePluginDatabaseNamespace(
      manifest.id,
      manifest.database.namespaceSlug,
    );
    await client.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(namespaceName)}`));
    const rows = await client
      .insert(pluginDatabaseNamespaces)
      .values({
        pluginId,
        pluginKey: manifest.id,
        namespaceName,
        namespaceMode: "schema",
        status: "active",
      })
      .onConflictDoUpdate({
        target: pluginDatabaseNamespaces.pluginId,
        set: {
          pluginKey: manifest.id,
          namespaceName,
          namespaceMode: "schema",
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0] ?? null;
  }

  async function ensureNamespace(pluginId: string, manifest: PaperclipPluginManifestV1) {
    return ensureNamespaceWithClient(db, pluginId, manifest);
  }

  async function getNamespace(pluginId: string) {
    const rows = await db
      .select()
      .from(pluginDatabaseNamespaces)
      .where(eq(pluginDatabaseNamespaces.pluginId, pluginId))
      .limit(1);
    return rows[0] ?? null;
  }

  async function getRuntimeNamespace(pluginId: string) {
    const namespace = await getNamespace(pluginId);
    if (!namespace || namespace.status !== "active") {
      throw new Error("Plugin database namespace is not active");
    }
    return namespace.namespaceName;
  }

  async function recordMigrationFailure(client: PluginDatabaseClient, input: {
    pluginId: string;
    pluginKey: string;
    namespaceName: string;
    migrationKey: string;
    checksum: string;
    pluginVersion: string;
    error: unknown;
  }): Promise<void> {
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    await client
      .insert(pluginMigrations)
      .values({
        pluginId: input.pluginId,
        pluginKey: input.pluginKey,
        namespaceName: input.namespaceName,
        migrationKey: input.migrationKey,
        checksum: input.checksum,
        pluginVersion: input.pluginVersion,
        status: "failed",
        errorMessage: message,
      })
      .onConflictDoUpdate({
        target: [pluginMigrations.pluginId, pluginMigrations.migrationKey],
        set: {
          checksum: input.checksum,
          pluginVersion: input.pluginVersion,
          status: "failed",
          errorMessage: message,
          startedAt: new Date(),
          appliedAt: null,
        },
      });
    await client
      .update(pluginDatabaseNamespaces)
      .set({ status: "migration_failed", updatedAt: new Date() })
      .where(eq(pluginDatabaseNamespaces.pluginId, input.pluginId));
  }

  return {
    ensureNamespace,

    async applyMigrations(
      pluginId: string,
      manifest: PaperclipPluginManifestV1,
      packageRoot: string,
      options: ApplyPluginMigrationsOptions = {},
    ) {
      if (!manifest.database) return null;
      const namespace = await ensureNamespace(pluginId, manifest);
      if (!namespace) return null;

      const migrationDir = resolveMigrationsDir(packageRoot, manifest.database.migrationsDir);
      const migrationFiles = await listSqlMigrationFiles(migrationDir);
      const coreReadTables = manifest.database.coreReadTables ?? [];
      const lockKey = Number.parseInt(createHash("sha256").update(pluginId).digest("hex").slice(0, 12), 16);
      const persistFailure = options.persistFailure ?? true;

      const applyWithClient = async (client: PluginDatabaseClient) => {
        await client.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
        for (const migrationKey of migrationFiles) {
          const content = await readFile(path.join(migrationDir, migrationKey), "utf8");
          const checksum = createHash("sha256").update(content).digest("hex");
          const existingRows = await client
            .select()
            .from(pluginMigrations)
            .where(and(eq(pluginMigrations.pluginId, pluginId), eq(pluginMigrations.migrationKey, migrationKey)))
            .limit(1);
          const existing = existingRows[0] as PluginMigrationRecord | undefined;
          if (existing?.status === "applied") {
            if (existing.checksum !== checksum) {
              throw new Error(`Plugin migration checksum mismatch for ${migrationKey}`);
            }
            continue;
          }

          const statements = splitSqlStatements(content);
          try {
            if (statements.length === 0) {
              throw new Error(`Plugin migration ${migrationKey} is empty`);
            }
            for (const statement of statements) {
              validatePluginMigrationStatement(statement, namespace.namespaceName, coreReadTables);
              await client.execute(sql.raw(statement));
            }
            await client
              .insert(pluginMigrations)
              .values({
                pluginId,
                pluginKey: manifest.id,
                namespaceName: namespace.namespaceName,
                migrationKey,
                checksum,
                pluginVersion: manifest.version,
                status: "applied",
                appliedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [pluginMigrations.pluginId, pluginMigrations.migrationKey],
                set: {
                  checksum,
                  pluginVersion: manifest.version,
                  status: "applied",
                  errorMessage: null,
                  startedAt: new Date(),
                  appliedAt: new Date(),
                },
              });
          } catch (error) {
            if (persistFailure) {
              await recordMigrationFailure(db, {
                pluginId,
                pluginKey: manifest.id,
                namespaceName: namespace.namespaceName,
                migrationKey,
                checksum,
                pluginVersion: manifest.version,
                error,
              });
            }
            throw error;
          }
        }
      };

      if (typeof db.transaction === "function") {
        await db.transaction(async (tx) => applyWithClient(tx as PluginDatabaseClient));
      } else {
        await applyWithClient(db);
      }

      return namespace;
    },

    getRuntimeNamespace,

    async query<T = Record<string, unknown>>(pluginId: string, statement: string, params?: unknown[]): Promise<T[]> {
      const plugin = await getPluginRecord(pluginId);
      const namespace = await getRuntimeNamespace(pluginId);
      validatePluginRuntimeQuery(statement, namespace, plugin.manifestJson.database?.coreReadTables ?? []);
      const result = await db.execute(bindSql(statement, params));
      return Array.from(result as Iterable<T>);
    },

    async execute(pluginId: string, statement: string, params?: unknown[]): Promise<{ rowCount: number }> {
      const namespace = await getRuntimeNamespace(pluginId);
      validatePluginRuntimeExecute(statement, namespace);
      const result = await db.execute(bindSql(statement, params));
      return { rowCount: Number((result as { count?: number | string }).count ?? 0) };
    },
  };
}
