INSERT INTO "agent_sessions" ("project_id")
SELECT p."id"
FROM "projects" p
ON CONFLICT ("project_id") DO NOTHING;--> statement-breakpoint
UPDATE "agent_runs" r
SET "session_id" = s."id"
FROM "agent_sessions" s
WHERE r."session_id" IS NULL
	AND s."project_id" = r."project_id";
