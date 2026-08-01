import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { simpleGreetingReply } from "@/server/agent/conversation";
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
import { runnableWebsiteCheckCommand } from "@/server/sandbox/preview-command";

export async function executeAgentRun(runId: string) {
  const db = database();
  const [claimedRun] = await db
    .update(agentRuns)
    .set({
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "queued")))
    .returning({ id: agentRuns.id });

  if (!claimedRun) return;

  const [record] = await db
    .select({ run: agentRuns, project: projects })
    .from(agentRuns)
    .innerJoin(projects, eq(agentRuns.projectId, projects.id))
    .where(eq(agentRuns.id, runId))
    .limit(1);

  if (!record) throw new Error(`Agent run ${runId} does not exist.`);

  await db.transaction(async (transaction) => {
    await transaction.delete(agentRunEvents).where(eq(agentRunEvents.runId, runId));
    await transaction
      .update(projects)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(projects.id, record.project.id));
  });

  let response = "";
  let responseMessageId: string | undefined;

  try {
    const conversation = await db
      .select()
      .from(messages)
      .where(eq(messages.projectId, record.project.id))
      .orderBy(asc(messages.createdAt));
    const latestUserMessage = conversation.findLast(
      (message) => message.role === "user",
    );
    const greetingReply = latestUserMessage
      ? simpleGreetingReply(latestUserMessage.content)
      : undefined;

    if (greetingReply) {
      await completeTextOnlyRun(runId, record.project.id, greetingReply);
      return;
    }

    const sandboxes = new DaytonaSandboxRuntime();
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

    const agent = new PiAgentRuntime(sandboxes);
    let sequence = 0;
    let usedTool = false;
    let lastStreamPersistedAt = 0;

    const [assistantMessage] = await db
      .insert(messages)
      .values({
        projectId: project.id,
        role: "assistant",
        status: "streaming",
        content: "",
      })
      .returning();
    responseMessageId = assistantMessage.id;
    await db
      .update(agentRuns)
      .set({ responseMessageId })
      .where(eq(agentRuns.id, runId));

    const recordEvent = async (event: AgentRuntimeEvent) => {
      if (event.type === "text_delta") {
        response += event.text;
        const now = Date.now();
        if (now - lastStreamPersistedAt >= 250) {
          lastStreamPersistedAt = now;
          await db
            .update(messages)
            .set({ content: response })
            .where(eq(messages.id, assistantMessage.id));
        }
        return;
      }
      usedTool = true;
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
    const projectCheck = await sandboxes.execute(
      project.sandboxId!,
      runnableWebsiteCheckCommand(),
      project.sandboxWorkdir!,
      10,
    );
    const hasRunnableWebsite = projectCheck.exitCode === 0;
    if (!hasRunnableWebsite && (usedTool || !response.trim())) {
      throw new Error("The agent finished without creating a runnable website.");
    }
    if (hasRunnableWebsite) {
      await sandboxes.startPreview(project.sandboxId!, project.sandboxWorkdir!);
    }

    const finalResponse =
      response.trim() || "The requested changes are running in the preview.";
    await db
      .update(messages)
      .set({ status: "completed", content: finalResponse })
      .where(eq(messages.id, assistantMessage.id));

    await db.transaction(async (transaction) => {
      await transaction
        .update(agentRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, runId));
      await transaction
        .update(projects)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(projects.id, project.id));
    });
  } catch (error) {
    if (responseMessageId) {
      await db
        .update(messages)
        .set({
          status: "failed",
          content: response.trim() || "The agent stopped before it could reply.",
        })
        .where(eq(messages.id, responseMessageId));
    }
    await failAgentRun(
      runId,
      "AGENT_RUN_FAILED",
      error instanceof Error ? error.message : "Unknown agent failure",
    );
    throw error;
  }
}

async function completeTextOnlyRun(
  runId: string,
  projectId: string,
  content: string,
) {
  const db = database();
  await db.transaction(async (transaction) => {
    const [assistantMessage] = await transaction
      .insert(messages)
      .values({ projectId, role: "assistant", content })
      .returning();
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
      .where(eq(projects.id, projectId));
  });
}
