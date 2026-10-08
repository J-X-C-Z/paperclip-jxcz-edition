CREATE SCHEMA "paperclip_bridge_v1";
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."binding_database_roles" (
	"database_role" text NOT NULL,
	"binding_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"can_append" boolean DEFAULT true NOT NULL,
	"can_read_snapshots" boolean DEFAULT true NOT NULL,
	"can_read_receipts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."binding_revisions" (
	"binding_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"project_id" uuid,
	"issue_id" uuid,
	"goal_id" uuid,
	"conversation_id" text,
	"accounting_owner_agent_id" uuid,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_binding_revisions_pk" PRIMARY KEY("binding_id","revision"),
	CONSTRAINT "bridge_binding_revisions_revision_check" CHECK ("paperclip_bridge_v1"."binding_revisions"."revision" > 0),
	CONSTRAINT "bridge_binding_revisions_interval_check" CHECK ("paperclip_bridge_v1"."binding_revisions"."valid_until" is null or "paperclip_bridge_v1"."binding_revisions"."valid_until" > "paperclip_bridge_v1"."binding_revisions"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"binding_kind" text NOT NULL,
	"external_key" text NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_bindings_kind_check" CHECK ("paperclip_bridge_v1"."bindings"."binding_kind" in ('agent','project','issue','goal','conversation','accounting_owner'))
);
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."conversation_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_revision" integer NOT NULL,
	"conversation_id" text NOT NULL,
	"agent_id" uuid,
	"project_id" uuid,
	"issue_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_revision" integer NOT NULL,
	"protocol_version" integer NOT NULL,
	"payload_version" integer NOT NULL,
	"event_kind" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_key" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"payload_bytes" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_events_protocol_check" CHECK ("paperclip_bridge_v1"."events"."protocol_version" = 1 and "paperclip_bridge_v1"."events"."payload_version" > 0),
	CONSTRAINT "bridge_events_hash_check" CHECK ("paperclip_bridge_v1"."events"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "bridge_events_size_check" CHECK ("paperclip_bridge_v1"."events"."payload_bytes" between 0 and 65536)
);
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"consumer" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"retry_at" timestamp with time zone,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_receipts_state_check" CHECK ("paperclip_bridge_v1"."receipts"."state" in ('pending','leased','completed','retry','quarantined')),
	CONSTRAINT "bridge_receipts_attempt_check" CHECK ("paperclip_bridge_v1"."receipts"."attempt" >= 0)
);
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_revision" integer NOT NULL,
	"snapshot_key" text NOT NULL,
	"version" bigint NOT NULL,
	"tombstone" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_bytes" integer NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_snapshots_version_check" CHECK ("paperclip_bridge_v1"."snapshots"."version" > 0),
	CONSTRAINT "bridge_snapshots_size_check" CHECK ("paperclip_bridge_v1"."snapshots"."payload_bytes" between 0 and 65536),
	CONSTRAINT "bridge_snapshots_tombstone_payload_check" CHECK (not "paperclip_bridge_v1"."snapshots"."tombstone" or "paperclip_bridge_v1"."snapshots"."payload" = '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "paperclip_bridge_v1"."usage_projection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_revision" integer NOT NULL,
	"source_kind" text NOT NULL,
	"source_key" text NOT NULL,
	"granularity" text NOT NULL,
	"session_key" text NOT NULL,
	"accounting_owner_agent_id" uuid,
	"accounting_status" text NOT NULL,
	"pricing_status" text NOT NULL,
	"billing_status" text NOT NULL,
	"amount_micro_usd" text NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_usage_projection_granularity_check" CHECK ("paperclip_bridge_v1"."usage_projection"."granularity" in ('request','session')),
	CONSTRAINT "bridge_usage_projection_amount_check" CHECK ("paperclip_bridge_v1"."usage_projection"."amount_micro_usd" ~ '^[0-9]+$'),
	CONSTRAINT "bridge_usage_projection_pricing_check" CHECK ("paperclip_bridge_v1"."usage_projection"."pricing_status" in ('priced','unpriced','estimated')),
	CONSTRAINT "bridge_usage_projection_billing_check" CHECK ("paperclip_bridge_v1"."usage_projection"."billing_status" in ('billed','included','unknown','not_billable')),
	CONSTRAINT "bridge_usage_projection_accounting_check" CHECK (("paperclip_bridge_v1"."usage_projection"."accounting_owner_agent_id" is null and "paperclip_bridge_v1"."usage_projection"."accounting_status" = 'reconciliation_required') or ("paperclip_bridge_v1"."usage_projection"."accounting_owner_agent_id" is not null and "paperclip_bridge_v1"."usage_projection"."accounting_status" = 'attributed'))
);
--> statement-breakpoint
ALTER TABLE "paperclip_bridge_v1"."binding_database_roles" ADD CONSTRAINT "binding_database_roles_binding_id_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "paperclip_bridge_v1"."bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperclip_bridge_v1"."binding_revisions" ADD CONSTRAINT "binding_revisions_binding_id_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "paperclip_bridge_v1"."bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperclip_bridge_v1"."conversation_index" ADD CONSTRAINT "conversation_index_binding_id_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "paperclip_bridge_v1"."bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperclip_bridge_v1"."events" ADD CONSTRAINT "events_binding_id_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "paperclip_bridge_v1"."bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperclip_bridge_v1"."receipts" ADD CONSTRAINT "receipts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "paperclip_bridge_v1"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperclip_bridge_v1"."snapshots" ADD CONSTRAINT "snapshots_binding_id_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "paperclip_bridge_v1"."bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperclip_bridge_v1"."usage_projection" ADD CONSTRAINT "usage_projection_binding_id_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "paperclip_bridge_v1"."bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_binding_database_roles_role_binding_uq" ON "paperclip_bridge_v1"."binding_database_roles" USING btree ("database_role","binding_id");--> statement-breakpoint
CREATE INDEX "bridge_binding_database_roles_role_idx" ON "paperclip_bridge_v1"."binding_database_roles" USING btree ("database_role","company_id");--> statement-breakpoint
CREATE INDEX "bridge_binding_revisions_company_idx" ON "paperclip_bridge_v1"."binding_revisions" USING btree ("company_id","binding_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_bindings_company_external_key_uq" ON "paperclip_bridge_v1"."bindings" USING btree ("company_id","binding_kind","external_key");--> statement-breakpoint
CREATE INDEX "bridge_bindings_company_idx" ON "paperclip_bridge_v1"."bindings" USING btree ("company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_conversation_index_company_conversation_uq" ON "paperclip_bridge_v1"."conversation_index" USING btree ("company_id","conversation_id");--> statement-breakpoint
CREATE INDEX "bridge_conversation_index_company_updated_idx" ON "paperclip_bridge_v1"."conversation_index" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "bridge_conversation_index_company_refs_idx" ON "paperclip_bridge_v1"."conversation_index" USING btree ("company_id","agent_id","project_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_events_source_natural_key_uq" ON "paperclip_bridge_v1"."events" USING btree ("binding_id","source_kind","source_key");--> statement-breakpoint
CREATE INDEX "bridge_events_company_received_idx" ON "paperclip_bridge_v1"."events" USING btree ("company_id","received_at");--> statement-breakpoint
CREATE INDEX "bridge_events_binding_revision_idx" ON "paperclip_bridge_v1"."events" USING btree ("binding_id","binding_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_receipts_event_consumer_uq" ON "paperclip_bridge_v1"."receipts" USING btree ("event_id","consumer");--> statement-breakpoint
CREATE INDEX "bridge_receipts_company_state_retry_idx" ON "paperclip_bridge_v1"."receipts" USING btree ("company_id","state","retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_snapshots_binding_key_version_uq" ON "paperclip_bridge_v1"."snapshots" USING btree ("binding_id","snapshot_key","version");--> statement-breakpoint
CREATE INDEX "bridge_snapshots_company_published_idx" ON "paperclip_bridge_v1"."snapshots" USING btree ("company_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_usage_projection_source_uq" ON "paperclip_bridge_v1"."usage_projection" USING btree ("binding_id","source_kind","source_key");--> statement-breakpoint
CREATE INDEX "bridge_usage_projection_company_occurred_idx" ON "paperclip_bridge_v1"."usage_projection" USING btree ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bridge_usage_projection_session_idx" ON "paperclip_bridge_v1"."usage_projection" USING btree ("company_id","session_key","granularity");--> statement-breakpoint
-- SECURITY DEFINER entry points are the only database contract exposed to Hermes.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
--> statement-breakpoint
REVOKE ALL ON SCHEMA paperclip_bridge_v1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA paperclip_bridge_v1 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA paperclip_bridge_v1 FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION paperclip_bridge_v1.append_event(
  p_binding_id uuid,
  p_binding_revision integer,
  p_protocol_version integer,
  p_payload_version integer,
  p_event_kind text,
  p_source_kind text,
  p_source_key text,
  p_payload jsonb,
  p_payload_sha256 text,
  p_occurred_at timestamptz
) RETURNS TABLE(event_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, paperclip_bridge_v1, public
AS $$
DECLARE
  v_company_id uuid;
  v_bytes integer;
  v_event_id uuid;
  v_hash text;
  v_existing_hash text;
BEGIN
  IF p_protocol_version IS NULL OR p_protocol_version <> 1
     OR p_payload_version IS NULL OR p_payload_version < 1 THEN
    RAISE EXCEPTION 'bridge_protocol_version_unsupported' USING ERRCODE = '22023';
  END IF;
  IF p_event_kind IS NULL OR length(btrim(p_event_kind)) NOT BETWEEN 1 AND 128
     OR p_source_kind IS NULL OR length(btrim(p_source_kind)) NOT BETWEEN 1 AND 128
     OR p_source_key IS NULL OR length(btrim(p_source_key)) NOT BETWEEN 1 AND 512
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'bridge_invalid_event' USING ERRCODE = '22023';
  END IF;
  v_bytes := octet_length(p_payload::text);
  IF v_bytes > 65536 THEN
    RAISE EXCEPTION 'bridge_event_too_large' USING ERRCODE = '22001';
  END IF;
  v_hash := encode(public.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  -- Client digest is diagnostic only; JSONB canonical bytes determine identity.

  SELECT b.company_id INTO v_company_id
  FROM paperclip_bridge_v1.bindings b
  JOIN paperclip_bridge_v1.binding_revisions r
    ON r.binding_id = b.id AND r.company_id = b.company_id
   AND r.revision = p_binding_revision
  JOIN paperclip_bridge_v1.binding_database_roles m
    ON m.binding_id = b.id AND m.company_id = b.company_id
   AND m.database_role = session_user AND m.can_append
  WHERE b.id = p_binding_id
    AND r.valid_from <= p_occurred_at
    AND (r.valid_until IS NULL OR p_occurred_at < r.valid_until);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'bridge_binding_revision_forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO paperclip_bridge_v1.events(
    company_id, binding_id, binding_revision, protocol_version, payload_version,
    event_kind, source_kind, source_key, payload_sha256, payload_bytes, payload, occurred_at
  ) VALUES (
    v_company_id, p_binding_id, p_binding_revision, p_protocol_version, p_payload_version,
    p_event_kind, p_source_kind, p_source_key, v_hash, v_bytes, p_payload, p_occurred_at
  ) ON CONFLICT (binding_id, source_kind, source_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NOT NULL THEN
    RETURN QUERY SELECT v_event_id, false;
    RETURN;
  END IF;

  SELECT e.id, e.payload_sha256 INTO v_event_id, v_existing_hash
  FROM paperclip_bridge_v1.events e
  WHERE e.binding_id = p_binding_id AND e.source_kind = p_source_kind AND e.source_key = p_source_key;
  IF v_event_id IS NULL OR v_existing_hash <> v_hash THEN
    RAISE EXCEPTION 'bridge_event_hash_conflict' USING ERRCODE = '23505';
  END IF;
  RETURN QUERY SELECT v_event_id, true;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION paperclip_bridge_v1.read_snapshot(
  p_binding_id uuid,
  p_binding_revision integer,
  p_snapshot_key text
) RETURNS TABLE(snapshot_version bigint, tombstone boolean, payload jsonb, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, paperclip_bridge_v1, public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT b.company_id INTO v_company_id
  FROM paperclip_bridge_v1.bindings b
  JOIN paperclip_bridge_v1.binding_database_roles m
    ON m.binding_id = b.id AND m.company_id = b.company_id
   AND m.database_role = session_user AND m.can_read_snapshots
  WHERE b.id = p_binding_id;
  IF v_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM paperclip_bridge_v1.binding_revisions r
    WHERE r.binding_id = p_binding_id AND r.company_id = v_company_id AND r.revision = p_binding_revision
  ) THEN
    RAISE EXCEPTION 'bridge_snapshot_binding_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.version, s.tombstone, s.payload, s.published_at
  FROM paperclip_bridge_v1.snapshots s
  WHERE s.binding_id = p_binding_id AND s.company_id = v_company_id
    AND s.binding_revision = p_binding_revision AND s.snapshot_key = p_snapshot_key
  ORDER BY s.version DESC LIMIT 1;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION paperclip_bridge_v1.read_receipt(
  p_event_id uuid,
  p_consumer text
) RETURNS TABLE(state text, attempt integer, retry_at timestamptz, last_error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, paperclip_bridge_v1, public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT e.company_id INTO v_company_id
  FROM paperclip_bridge_v1.events e
  JOIN paperclip_bridge_v1.binding_database_roles m
    ON m.binding_id = e.binding_id AND m.company_id = e.company_id
   AND m.database_role = session_user AND m.can_read_receipts
  WHERE e.id = p_event_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'bridge_receipt_read_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.state, r.attempt, r.retry_at, r.last_error
  FROM paperclip_bridge_v1.receipts r
  WHERE r.event_id = p_event_id AND r.company_id = v_company_id AND r.consumer = p_consumer;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION paperclip_bridge_v1.append_event(uuid, integer, integer, integer, text, text, text, jsonb, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION paperclip_bridge_v1.read_snapshot(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION paperclip_bridge_v1.read_receipt(uuid, text) FROM PUBLIC;

--> statement-breakpoint

CREATE TABLE "cost_accounting_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_accounting_residuals" (
	"company_id" uuid NOT NULL,
	"binding" text NOT NULL,
	"accounting_month" text NOT NULL,
	"residual_micros" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_accounting_residuals_company_id_binding_accounting_month_pk" PRIMARY KEY("company_id","binding","accounting_month")
);
--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "billed_usd_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "cost_precision_source" text DEFAULT 'legacy_cents' NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_accounting_outbox" ADD CONSTRAINT "cost_accounting_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_accounting_residuals" ADD CONSTRAINT "cost_accounting_residuals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_accounting_outbox_dedupe_idx" ON "cost_accounting_outbox" USING btree ("company_id","scope_type","scope_id","policy_id","window_start");--> statement-breakpoint
CREATE INDEX "cost_accounting_outbox_pending_idx" ON "cost_accounting_outbox" USING btree ("status","created_at");

