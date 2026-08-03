CREATE TYPE "public"."tool_execution_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_run_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" "tool_execution_status" NOT NULL,
	"args" jsonb NOT NULL,
	"result" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "checkpoint_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_agent_sessions" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "project_agent_sessions" ADD COLUMN "byte_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_agent_sessions" ADD COLUMN "rebased_at" timestamp with time zone;--> statement-breakpoint
UPDATE "project_agent_sessions" SET "byte_size" = octet_length("data");--> statement-breakpoint
ALTER TABLE "agent_run_tools" ADD CONSTRAINT "agent_run_tools_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_tools_run_call_idx" ON "agent_run_tools" USING btree ("run_id","tool_call_id");
