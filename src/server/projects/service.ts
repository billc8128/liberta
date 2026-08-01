import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
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

const promptSchema = z.string().trim().min(1).max(20_000);

export async function createProject(input: { ownerId: string; prompt: string }) {
  const ownerId = z.string().min(1).parse(input.ownerId);
  const prompt = promptSchema.parse(input.prompt);
  const model = arkEnv();

  return database().transaction(async (transaction) => {
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
}

export async function addProjectMessage(input: {
  ownerId: string;
  projectId: string;
  prompt: string;
}) {
  const prompt = promptSchema.parse(input.prompt);
  const model = arkEnv();
  const db = database();

  return db.transaction(async (transaction) => {
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, input.ownerId)))
      .limit(1);
    if (!project) {
      throw new ProjectAccessError();
    }

    const [activeRun] = await transaction
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.projectId, input.projectId),
          inArray(agentRuns.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (activeRun) {
      throw new ProjectBusyError();
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

    await transaction
      .update(projects)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    return { message, run };
  });
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
  }
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
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.projectId, projectId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
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

export class ProjectBusyError extends Error {
  constructor() {
    super("The project agent is already working.");
  }
}
