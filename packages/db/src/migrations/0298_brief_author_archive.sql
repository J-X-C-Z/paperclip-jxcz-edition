ALTER TABLE "briefs" DROP CONSTRAINT "briefs_author_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "briefs" ALTER COLUMN "author_agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "author_agent_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Preserve existing attribution before authors can be deleted. Keyset batches
-- use the existing briefs primary-key index, with at most 500 updates per pass.
DO $$
DECLARE
  last_id uuid := '00000000-0000-0000-0000-000000000000';
  batch_ids uuid[];
BEGIN
  LOOP
    SELECT array_agg(id ORDER BY id) INTO batch_ids
    FROM (SELECT id FROM briefs WHERE id > last_id ORDER BY id LIMIT 500) AS batch;
    EXIT WHEN batch_ids IS NULL;
    UPDATE briefs AS brief SET author_agent_name = agent.name
    FROM agents AS agent
    WHERE brief.id = ANY(batch_ids) AND brief.author_agent_id = agent.id;
    last_id := batch_ids[array_length(batch_ids, 1)];
  END LOOP;
END $$;
