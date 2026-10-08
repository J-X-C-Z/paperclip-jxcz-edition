import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startEmbeddedPostgresTestDatabase } from "./test-embedded-postgres.js";

// A real isolated cluster verifies the login boundary; SET ROLE would leave
// session_user unchanged and would not test the Hermes authorization contract.
describe("Hermes Bridge restricted database login", () => {
  let stop: (() => Promise<void>) | undefined;
  let admin: ReturnType<typeof postgres>;
  let hermes: ReturnType<typeof postgres>;
  const companyId = randomUUID();
  const bindingId = randomUUID();
  const foreignBindingId = randomUUID();
  const payload = { longKey: "你好", z: 1, nested: { b: true, a: [1, 2] } };
  const occurredAt = "2026-10-04T00:00:00Z";

  beforeAll(async () => {
    const started = await startEmbeddedPostgresTestDatabase("paperclip-bridge-contract-");
    stop = started.cleanup;
    admin = postgres(started.connectionString, { max: 1 });
    await admin.unsafe("CREATE ROLE hermes_bridge_test LOGIN PASSWORD 'isolated-test-only'");
    await admin.unsafe("GRANT USAGE ON SCHEMA paperclip_bridge_v1 TO hermes_bridge_test");
    await admin.unsafe("GRANT EXECUTE ON FUNCTION paperclip_bridge_v1.append_event(uuid,integer,integer,integer,text,text,text,jsonb,text,timestamptz), paperclip_bridge_v1.read_snapshot(uuid,integer,text), paperclip_bridge_v1.read_receipt(uuid,text) TO hermes_bridge_test");
    for (const id of [bindingId, foreignBindingId]) {
      await admin`insert into paperclip_bridge_v1.bindings (id, company_id, binding_kind, external_key) values (${id}, ${companyId}, 'conversation', ${id})`;
      await admin`insert into paperclip_bridge_v1.binding_revisions (binding_id, revision, company_id, valid_from) values (${id}, 1, ${companyId}, '2020-01-01')`;
    }
    await admin`insert into paperclip_bridge_v1.binding_database_roles (database_role,binding_id,company_id) values ('hermes_bridge_test',${bindingId},${companyId})`;
    const url = new URL(started.connectionString);
    url.username = "hermes_bridge_test";
    url.password = "isolated-test-only";
    hermes = postgres(url.toString(), { max: 1 });
  }, 90_000);

  afterAll(async () => {
    await hermes?.end();
    await admin?.end();
    await stop?.();
  });

  async function append(key: string, value: postgres.JSONValue, hint: string | null = null, id = bindingId) {
    return hermes`select * from paperclip_bridge_v1.append_event(${id}::uuid,1,1,1,'session:update','hermes',${key},${hermes.json(value)}::jsonb,${hint},${occurredAt}::timestamptz)`;
  }

  it("stores the PostgreSQL digest, ignoring compact client hints and preserving replay identity", async () => {
    const [created] = await append("session-1", payload, "compact-client-digest");
    const [replayed] = await append("session-1", { nested: { a: [1, 2], b: true }, z: 1, longKey: "你好" }, null);
    expect(created.replayed).toBe(false);
    expect(replayed).toEqual({ event_id: created.event_id, replayed: true });
    const [stored] = await admin`select payload_sha256 = encode(public.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex') as canonical from paperclip_bridge_v1.events where id = ${created.event_id}`;
    expect(stored.canonical).toBe(true);
    await expect(append("session-1", { changed: true }, "compact-client-digest")).rejects.toMatchObject({ code: "23505" });
  });

  it("denies table reads and writes, unmapped bindings, unsupported protocol and expired revisions", async () => {
    await expect(hermes`select * from paperclip_bridge_v1.events`).rejects.toMatchObject({ code: "42501" });
    await expect(hermes`delete from paperclip_bridge_v1.receipts`).rejects.toMatchObject({ code: "42501" });
    await expect(append("foreign", payload, null, foreignBindingId)).rejects.toMatchObject({ code: "42501" });
    await expect(hermes`select * from paperclip_bridge_v1.append_event(${bindingId}::uuid,1,2,1,'session:update','hermes','bad-version','{}'::jsonb,null,${occurredAt}::timestamptz)`).rejects.toMatchObject({ code: "22023" });
    await admin`insert into paperclip_bridge_v1.binding_revisions (binding_id,revision,company_id,valid_from,valid_until) values (${bindingId},2,${companyId},'2020-01-01','2021-01-01')`;
    await expect(hermes`select * from paperclip_bridge_v1.append_event(${bindingId}::uuid,2,1,1,'session:update','hermes','expired','{}'::jsonb,null,${occurredAt}::timestamptz)`).rejects.toMatchObject({ code: "42501" });
    await expect(append("large", { text: "x".repeat(65_536) })).rejects.toMatchObject({ code: "22001" });
  });

  it("reads only its mapped snapshots and receipts", async () => {
    const [event] = await append("receipt", {});
    await admin`insert into paperclip_bridge_v1.receipts (company_id,event_id,consumer,state) values (${companyId},${event.event_id},'paperclip','completed')`;
    const [receipt] = await hermes`select * from paperclip_bridge_v1.read_receipt(${event.event_id}::uuid,'paperclip')`;
    expect(receipt.state).toBe("completed");
    await admin`insert into paperclip_bridge_v1.snapshots (company_id,binding_id,binding_revision,snapshot_key,version,payload_bytes,payload) values (${companyId},${bindingId},1,'context',1,2,'{}'::jsonb)`;
    const [snapshot] = await hermes`select * from paperclip_bridge_v1.read_snapshot(${bindingId}::uuid,1,'context')`;
    expect(String(snapshot.snapshot_version)).toBe("1");
    await expect(hermes`select * from paperclip_bridge_v1.read_snapshot(${foreignBindingId}::uuid,1,'context')`).rejects.toMatchObject({ code: "42501" });
  });
});
