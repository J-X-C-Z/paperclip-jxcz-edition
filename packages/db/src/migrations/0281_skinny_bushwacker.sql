CREATE TABLE "project_agent_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"project_role" text,
	"is_lead" boolean DEFAULT false NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_agent_memberships" ADD CONSTRAINT "project_agent_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_memberships" ADD CONSTRAINT "project_agent_memberships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_memberships" ADD CONSTRAINT "project_agent_memberships_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_agent_memberships_project_agent_uq" ON "project_agent_memberships" USING btree ("project_id","agent_id");--> statement-breakpoint
CREATE INDEX "project_agent_memberships_company_project_idx" ON "project_agent_memberships" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "project_agent_memberships_company_agent_idx" ON "project_agent_memberships" USING btree ("company_id","agent_id");