import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Migration ordinals change on merges; the SQL identity and journal remain intact.
export function migrationFileUrl(
  name: string,
  directory = new URL("./migrations/", import.meta.url),
): URL {
  const identity = name.replace(/^\d{4}_/, "").replace(/\.sql$/, "");
  if (!/^[a-zA-Z0-9_-]+$/.test(identity)) throw new Error(`Invalid migration identity: ${name}`);
  const root = fileURLToPath(directory);
  const matches = readdirSync(root).filter((file) =>
    /^\d{4}_/.test(file) && file.slice(5) === `${identity}.sql`,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one migration for ${identity}, found ${matches.length}`);
  }
  return pathToFileURL(join(root, matches[0]!));
}
