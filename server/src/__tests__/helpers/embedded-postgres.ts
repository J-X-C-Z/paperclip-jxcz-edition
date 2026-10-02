import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  applyPendingMigrations, closeRegisteredClients, createDb,
  getEmbeddedPostgresTestSupport as embeddedSupport,
  startEmbeddedPostgresTestDatabase as startEmbedded,
} from "@paperclipai/db";
export type { EmbeddedPostgresTestDatabase, EmbeddedPostgresTestSupport } from "@paperclipai/db";

// Explicit opt-in for machines unable to bootstrap a second native cluster.
// Every test still gets its own fresh database; the existing application DB
// is never migrated or cleared by this fallback.
export async function getEmbeddedPostgresTestSupport() {
  const adminUrl = process.env.PAPERCLIP_TEST_POSTGRES_ADMIN_URL;
  if (!adminUrl) return embeddedSupport();
  try {
    await createDb(adminUrl).execute(sql`select 1`);
    return { supported: true };
  } catch (error) {
    return { supported: false, reason: String(error) };
  }
}

export async function startEmbeddedPostgresTestDatabase(prefix: string) {
  const adminUrl = process.env.PAPERCLIP_TEST_POSTGRES_ADMIN_URL;
  if (!adminUrl) return startEmbedded(prefix);
  const name = `paperclip_test_${randomUUID().replaceAll("-", "")}`;
  const adminDb = createDb(adminUrl);
  await adminDb.execute(sql.raw(`CREATE DATABASE "${name}"`));
  const target = new URL(adminUrl);
  target.pathname = `/${name}`;
  const connectionString = target.toString();
  try {
    await applyPendingMigrations(connectionString);
  } catch (error) {
    await closeRegisteredClients(connectionString);
    await createDb(adminUrl).execute(sql.raw(`DROP DATABASE "${name}" WITH (FORCE)`));
    await closeRegisteredClients(adminUrl);
    throw error;
  }
  return {
    connectionString,
    cleanup: async () => {
      await closeRegisteredClients(connectionString);
      await createDb(adminUrl).execute(sql.raw(`DROP DATABASE "${name}" WITH (FORCE)`));
    await closeRegisteredClients(adminUrl);
    },
  };
}
