CREATE TABLE "agent_session_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"run_id" uuid,
	"sequence" integer NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"pi_entry_id" text NOT NULL,
	"parent_pi_entry_id" text,
	"entry_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_session_snapshots" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"through_sequence" integer DEFAULT -1 NOT NULL,
	"head_entry_id" text,
	"data" text NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"compacted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"pi_session_id" text,
	"head_entry_id" text,
	"latest_compaction_entry_id" text,
	"active_run_id" uuid,
	"current_generation" integer DEFAULT 0 NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"rebased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "start_entry_sequence" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "end_entry_sequence" integer;--> statement-breakpoint
INSERT INTO "agent_sessions" (
	"project_id",
	"active_run_id",
	"rebased_at",
	"created_at",
	"updated_at"
)
SELECT
	"project_id",
	"run_id",
	"rebased_at",
	"updated_at",
	"updated_at"
FROM "project_agent_sessions";--> statement-breakpoint
INSERT INTO "agent_session_entries" (
	"session_id",
	"run_id",
	"sequence",
	"generation",
	"pi_entry_id",
	"parent_pi_entry_id",
	"entry_type",
	"payload",
	"created_at"
)
SELECT
	s."id",
	NULL,
	(lines.ordinality - 1)::integer,
	0,
	COALESCE(lines.payload ->> 'id', md5(lines.line || lines.ordinality::text)),
	lines.payload ->> 'parentId',
	COALESCE(lines.payload ->> 'type', 'unknown'),
	lines.payload,
	p."updated_at"
FROM "project_agent_sessions" p
JOIN "agent_sessions" s ON s."project_id" = p."project_id"
CROSS JOIN LATERAL (
	SELECT line, ordinality, line::jsonb AS payload
	FROM regexp_split_to_table(trim(p."data"), E'\\n') WITH ORDINALITY AS raw(line, ordinality)
	WHERE trim(line) <> ''
) lines;--> statement-breakpoint
UPDATE "agent_sessions" s
SET
	"pi_session_id" = metadata."pi_session_id",
	"head_entry_id" = metadata."head_entry_id",
	"latest_compaction_entry_id" = metadata."latest_compaction_entry_id",
	"entry_count" = metadata."entry_count"
FROM (
	SELECT
		e."session_id",
		max(e."pi_entry_id") FILTER (WHERE e."entry_type" = 'session') AS "pi_session_id",
		(array_agg(e."pi_entry_id" ORDER BY e."sequence" DESC))[1] AS "head_entry_id",
		(array_agg(e."pi_entry_id" ORDER BY e."sequence" DESC) FILTER (WHERE e."entry_type" = 'compaction'))[1] AS "latest_compaction_entry_id",
		count(*)::integer AS "entry_count"
	FROM "agent_session_entries" e
	GROUP BY e."session_id"
) metadata
WHERE metadata."session_id" = s."id";--> statement-breakpoint
INSERT INTO "agent_session_snapshots" (
	"session_id",
	"generation",
	"through_sequence",
	"head_entry_id",
	"data",
	"byte_size",
	"compacted_at",
	"updated_at"
)
SELECT
	s."id",
	0,
	s."entry_count" - 1,
	s."head_entry_id",
	p."data",
	p."byte_size",
	p."rebased_at",
	p."updated_at"
FROM "project_agent_sessions" p
JOIN "agent_sessions" s ON s."project_id" = p."project_id";--> statement-breakpoint
UPDATE "agent_runs" r
SET "session_id" = s."id"
FROM "agent_sessions" s
WHERE s."project_id" = r."project_id";--> statement-breakpoint
ALTER TABLE "project_agent_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "project_agent_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_session_entries" ADD CONSTRAINT "agent_session_entries_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session_entries" ADD CONSTRAINT "agent_session_entries_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session_snapshots" ADD CONSTRAINT "agent_session_snapshots_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_entries_session_sequence_idx" ON "agent_session_entries" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_entries_session_pi_id_idx" ON "agent_session_entries" USING btree ("session_id","pi_entry_id");--> statement-breakpoint
CREATE INDEX "agent_session_entries_run_idx" ON "agent_session_entries" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_project_idx" ON "agent_sessions" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE set null ON UPDATE no action;
