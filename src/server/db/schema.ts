import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const projectStatus = pgEnum("project_status", [
  "provisioning",
  "ready",
  "running",
  "failed",
  "archived",
]);

export const messageRole = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);

export const messageStatus = pgEnum("message_status", [
  "pending",
  "streaming",
  "completed",
  "failed",
]);

export const runStatus = pgEnum("run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const toolExecutionStatus = pgEnum("tool_execution_status", [
  "started",
  "completed",
  "failed",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: projectStatus("status").notNull().default("provisioning"),
    sandboxId: text("sandbox_id").unique(),
    sandboxWorkdir: text("sandbox_workdir"),
    previewPort: integer("preview_port").notNull().default(3000),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("projects_owner_updated_idx").on(table.ownerId, table.updatedAt)],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    piSessionId: text("pi_session_id"),
    headEntryId: text("head_entry_id"),
    latestCompactionEntryId: text("latest_compaction_entry_id"),
    activeRunId: uuid("active_run_id"),
    currentGeneration: integer("current_generation").notNull().default(0),
    entryCount: integer("entry_count").notNull().default(0),
    rebasedAt: timestamp("rebased_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_sessions_project_idx").on(table.projectId),
  ],
);

export const agentSessionSnapshots = pgTable("agent_session_snapshots", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => agentSessions.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull().default(0),
  throughSequence: integer("through_sequence").notNull().default(-1),
  headEntryId: text("head_entry_id"),
  data: text("data").notNull(),
  byteSize: integer("byte_size").notNull().default(0),
  compactedAt: timestamp("compacted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    status: messageStatus("status").notNull().default("completed"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("messages_project_created_idx").on(table.projectId, table.createdAt)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => agentSessions.id, {
      onDelete: "set null",
    }),
    promptMessageId: uuid("prompt_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "restrict" }),
    responseMessageId: uuid("response_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    status: runStatus("status").notNull().default("queued"),
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    leaseOwner: text("lease_owner"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    attempt: integer("attempt").notNull().default(0),
    checkpointSequence: integer("checkpoint_sequence").notNull().default(0),
    startEntrySequence: integer("start_entry_sequence"),
    endEntrySequence: integer("end_entry_sequence"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("agent_runs_project_created_idx").on(table.projectId, table.createdAt)],
);

export const agentSessionEntries = pgTable(
  "agent_session_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    sequence: integer("sequence").notNull(),
    generation: integer("generation").notNull().default(0),
    piEntryId: text("pi_entry_id").notNull(),
    parentPiEntryId: text("parent_pi_entry_id"),
    entryType: text("entry_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_session_entries_session_sequence_idx").on(
      table.sessionId,
      table.sequence,
    ),
    uniqueIndex("agent_session_entries_session_pi_id_idx").on(
      table.sessionId,
      table.generation,
      table.piEntryId,
    ),
    index("agent_session_entries_run_idx").on(table.runId),
  ],
);

export const agentRunTools = pgTable(
  "agent_run_tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: toolExecutionStatus("status").notNull(),
    args: jsonb("args").$type<unknown>().notNull(),
    result: jsonb("result").$type<unknown>(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_run_tools_run_call_idx").on(
      table.runId,
      table.toolCallId,
    ),
  ],
);

export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("agent_run_events_run_sequence_idx").on(table.runId, table.sequence)],
);

export type Project = typeof projects.$inferSelect;
export type AgentSession = typeof agentSessions.$inferSelect;
export type AgentSessionEntry = typeof agentSessionEntries.$inferSelect;
export type AgentSessionSnapshot = typeof agentSessionSnapshots.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunTool = typeof agentRunTools.$inferSelect;
