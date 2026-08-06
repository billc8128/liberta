import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { arkEnv } from "@/lib/env/server";
import { database } from "@/server/db";
import {
  agentRunEvents,
  agentRuns,
  messages,
  projects,
} from "@/server/db/schema";
import { projectNameFromPrompt } from "@/server/projects/prompt";
import { publishProjectUpdate } from "@/server/projects/updates";

const promptSchema = z.string().trim().min(1).max(20_000);

export async function createProject(input: { ownerId: string; prompt: string }) {
  const ownerId = z.string().min(1).parse(input.ownerId);
  const prompt = promptSchema.parse(input.prompt);
  const model = arkEnv();

  const result = await database().transaction(async (transaction) => {
    const [project] = await transaction
      .insert(projects)
      .values({
        ownerId,
        name: projectNameFromPrompt(prompt),
      })
      .returning();

    const [message] = await transaction
      .insert(messages)
      .values({ projectId: project.id, role: "user", content: prompt })
      .returning();

    const [run] = await transaction
      .insert(agentRuns)
      .values({
        projectId: project.id,
        promptMessageId: message.id,
        modelProvider: "volcengine-agent-plan",
        modelId: model.ARK_MODEL_ID,
      })
      .returning();

    return { project, run };
  });
  await publishProjectUpdate(result.project.id);
  return result;
}

export async function addProjectMessage(input: {
  ownerId: string;
  projectId: string;
  prompt: string;
}) {
  const prompt = promptSchema.parse(input.prompt);
  const model = arkEnv();
  const db = database();

  const result = await db.transaction(async (transaction) => {
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, input.ownerId)))
      .limit(1);
    if (!project) {
      throw new ProjectAccessError();
    }

    const [message] = await transaction
      .insert(messages)
      .values({ projectId: project.id, role: "user", content: prompt })
      .returning();
    const [run] = await transaction
      .insert(agentRuns)
      .values({
        projectId: project.id,
        promptMessageId: message.id,
        modelProvider: "volcengine-agent-plan",
        modelId: model.ARK_MODEL_ID,
      })
      .returning();

    return { message, run };
  });
  await publishProjectUpdate(result.message.projectId);
  return result;
}

export async function failAgentRun(runId: string, code: string, message: string) {
  const db = database();
  const [run] = await db
    .update(agentRuns)
    .set({
      status: "failed",
      errorCode: code,
      errorMessage: message,
      completedAt: new Date(),
    })
    .where(eq(agentRuns.id, runId))
    .returning();

  if (run) {
    await db
      .update(projects)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(projects.id, run.projectId));
    await publishProjectUpdate(run.projectId);
  }
}

export async function cancelProjectRun(input: {
  ownerId: string;
  projectId: string;
  runId: string;
}) {
  const result = await database().transaction(async (transaction) => {
    const [record] = await transaction
      .select({ run: agentRuns })
      .from(agentRuns)
      .innerJoin(projects, eq(agentRuns.projectId, projects.id))
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.projectId, input.projectId),
          eq(projects.ownerId, input.ownerId),
        ),
      )
      .limit(1);
    if (!record) throw new ProjectAccessError();
    if (record.run.status !== "queued" && record.run.status !== "running") {
      return record.run;
    }

    const requestedAt = new Date();
    let [run] = await transaction
      .update(agentRuns)
      .set(
        record.run.status === "queued"
          ? {
              status: "cancelled",
              cancelRequestedAt: requestedAt,
              completedAt: requestedAt,
            }
          : { cancelRequestedAt: requestedAt },
      )
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.status, record.run.status),
        ),
      )
      .returning();
    if (!run && record.run.status === "queued") {
      [run] = await transaction
        .update(agentRuns)
        .set({ cancelRequestedAt: requestedAt })
        .where(
          and(eq(agentRuns.id, input.runId), eq(agentRuns.status, "running")),
        )
        .returning();
    }
    if (run?.status === "cancelled") {
      await transaction
        .update(projects)
        .set({ status: "ready", updatedAt: requestedAt })
        .where(eq(projects.id, input.projectId));
    }
    return run ?? record.run;
  });
  await publishProjectUpdate(input.projectId);
  return result;
}

export async function getProjectState(ownerId: string, projectId: string) {
  const db = database();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  if (!project) {
    throw new ProjectAccessError();
  }

  const conversation = await db
    .select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(asc(messages.createdAt));
  const [activeRun] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.projectId, projectId),
        inArray(agentRuns.status, ["queued", "running"]),
      ),
    )
    .orderBy(
      sql`case when ${agentRuns.status} = 'running' then 0 else 1 end`,
      asc(agentRuns.createdAt),
    )
    .limit(1);
  const latestRun = activeRun
    ? undefined
    : (
        await db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.projectId, projectId))
          .orderBy(desc(agentRuns.createdAt))
          .limit(1)
      )[0];
  const run = activeRun ?? latestRun;
  const events = run
    ? await db
        .select()
        .from(agentRunEvents)
        .where(eq(agentRunEvents.runId, run.id))
        .orderBy(asc(agentRunEvents.sequence))
    : [];

  return { project, messages: conversation, run: run ?? null, events };
}

export async function getOwnedProject(ownerId: string, projectId: string) {
  const [project] = await database()
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  if (!project) {
    throw new ProjectAccessError();
  }
  return project;
}

export class ProjectAccessError extends Error {
  constructor() {
    super("Project was not found.");
  }
}
