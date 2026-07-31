import "server-only";

import { asc, eq } from "drizzle-orm";

import { PiAgentRuntime } from "@/server/agent/pi";
import type { AgentRuntimeEvent } from "@/server/agent/runtime";
import { database } from "@/server/db";
import {
  agentRunEvents,
  agentRuns,
  messages,
  projects,
} from "@/server/db/schema";
import { failAgentRun } from "@/server/projects/service";
import { promptWithConversation } from "@/server/projects/prompt";
import { DaytonaSandboxRuntime } from "@/server/sandbox/daytona";

export async function executeAgentRun(runId: string) {
  const db = database();
  const [record] = await db
    .select({ run: agentRuns, project: projects })
    .from(agentRuns)
    .innerJoin(projects, eq(agentRuns.projectId, projects.id))
    .where(eq(agentRuns.id, runId))
    .limit(1);

  if (!record) throw new Error(`Agent run ${runId} does not exist.`);
  if (record.run.status === "completed") return;

  await db.transaction(async (transaction) => {
    await transaction.delete(agentRunEvents).where(eq(agentRunEvents.runId, runId));
    await transaction
      .update(agentRuns)
      .set({
        status: "running",
        startedAt: new Date(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(agentRuns.id, runId));
    await transaction
      .update(projects)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(projects.id, record.project.id));
  });

  const sandboxes = new DaytonaSandboxRuntime();

  try {
    let project = record.project;
    if (!project.sandboxId || !project.sandboxWorkdir) {
      const sandbox = await sandboxes.create(project.id);
      const [updated] = await db
        .update(projects)
        .set({
          sandboxId: sandbox.id,
          sandboxWorkdir: sandbox.workdir,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id))
        .returning();
      project = updated;
    }

    const conversation = await db
      .select()
      .from(messages)
      .where(eq(messages.projectId, project.id))
      .orderBy(asc(messages.createdAt));
    const agent = new PiAgentRuntime(sandboxes);
    let response = "";
    let sequence = 0;

    const recordEvent = async (event: AgentRuntimeEvent) => {
      if (event.type === "text_delta") {
        response += event.text;
        return;
      }
      sequence += 1;
      await db.insert(agentRunEvents).values({
        runId,
        sequence,
        type: event.type,
        payload: event,
      });
    };

    await agent.runTurn(
      {
        sandboxId: project.sandboxId!,
        workdir: project.sandboxWorkdir!,
        prompt: promptWithConversation(conversation),
      },
      recordEvent,
    );
    await sandboxes.startPreview(project.sandboxId!, project.sandboxWorkdir!);

    const [assistantMessage] = await db
      .insert(messages)
      .values({
        projectId: project.id,
        role: "assistant",
        content: response.trim() || "The requested changes are running in the preview.",
      })
      .returning();

    await db.transaction(async (transaction) => {
      await transaction
        .update(agentRuns)
        .set({
          status: "completed",
          responseMessageId: assistantMessage.id,
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, runId));
      await transaction
        .update(projects)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(projects.id, project.id));
    });
  } catch (error) {
    await failAgentRun(
      runId,
      "AGENT_RUN_FAILED",
      error instanceof Error ? error.message : "Unknown agent failure",
    );
    throw error;
  }
}
