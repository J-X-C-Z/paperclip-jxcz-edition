import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrationFileUrl } from "./test-migrations.js";

describe("migrationFileUrl", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "paperclip-migration-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps SQL bytes and hash stable when only the ordinal changes", async () => {
    const before = join(directory, "0001_future_change.sql");
    const after = join(directory, "0199_future_change.sql");
    const sql = "CREATE TABLE example (id text PRIMARY KEY);\n";
    await writeFile(before, sql);
    const original = await readFile(migrationFileUrl("future_change", pathToFileURL(`${directory}/`)));

    await rename(before, after);
    const moved = await readFile(migrationFileUrl("future_change", pathToFileURL(`${directory}/`)));

    expect(moved).toEqual(original);
    expect(createHash("sha256").update(moved).digest("hex")).toBe(
      createHash("sha256").update(original).digest("hex"),
    );
  });

  it("resolves an old ordinal filename to the current migration", async () => {
    await writeFile(join(directory, "0199_future_change.sql"), "SELECT 1;\n");

    expect(await readFile(migrationFileUrl("0001_future_change.sql", pathToFileURL(`${directory}/`)), "utf8"))
      .toBe("SELECT 1;\n");
  });

  it("rejects missing and ambiguous migration identities", async () => {
    const url = pathToFileURL(`${directory}/`);
    expect(() => migrationFileUrl("missing", url)).toThrow(/found 0/);

    await writeFile(join(directory, "0001_duplicate.sql"), "SELECT 1;\n");
    await writeFile(join(directory, "0002_duplicate.sql"), "SELECT 2;\n");
    expect(() => migrationFileUrl("duplicate", url)).toThrow(/found 2/);
  });

  it("rejects path-like migration names", () => {
    expect(() => migrationFileUrl("../../secret.sql", pathToFileURL(`${directory}/`)))
      .toThrow(/Invalid migration identity/);
  });
});
