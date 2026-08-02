import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { PiAgentRuntime } from "@/server/agent/pi";
import type { AgentRuntimeEvent } from "@/server/agent/runtime";
import {
  loadProjectAgentSession,
} from "@/server/agent/session-store";
import { database } from "@/server/db";
import {
  agentRunEvents,
  agentRuns,
  messages,
  projectAgentSessions,
  projects,
} from "@/server/db/schema";
import { failAgentRun } from "@/server/projects/service";
import { promptWithConversation } from "@/server/projects/prompt";
import {
  publishProjectMessageDelta,
  publishProjectMessageReplacement,
  publishProjectUpdate,
} from "@/server/projects/updates";
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
  await publishProjectUpdate(record.project.id);

  let response = "";
  let responseMessageId: string | undefined;

  try {
    const conversation = await db
      .select()
      .from(messages)
      .where(eq(messages.projectId, record.project.id))
      .orderBy(asc(messages.createdAt));
    const promptMessage = conversation.find(
      (message) => message.id === record.run.promptMessageId,
    );
    if (!promptMessage) {
      throw new Error(`Prompt message for agent run ${runId} does not exist.`);
    }
    const persistedSession = await loadProjectAgentSession(record.project.id);

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
    let pendingDelta = "";
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let flushPipeline = Promise.resolve();

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
    await publishProjectUpdate(project.id);

    const flushDelta = async () => {
      const delta = pendingDelta;
      pendingDelta = "";
      if (!delta) return;
      await Promise.all([
        db
          .update(messages)
          .set({ content: response })
          .where(eq(messages.id, assistantMessage.id)),
        publishProjectMessageDelta(project.id, assistantMessage.id, delta),
      ]);
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = undefined;
        flushPipeline = flushPipeline.then(flushDelta);
      }, 50);
    };

    const finishFlush = async () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      await flushPipeline;
      await flushDelta();
    };

    const recordEvent = async (event: AgentRuntimeEvent) => {
      if (event.type === "text_delta") {
        response += event.text;
        pendingDelta += event.text;
        scheduleFlush();
        return;
      }
      if (event.type === "text_retract") {
        await finishFlush();
        response = response.slice(0, -event.characters);
        await db
          .update(messages)
          .set({ content: response })
          .where(eq(messages.id, assistantMessage.id));
        await publishProjectMessageReplacement(
          project.id,
          assistantMessage.id,
          response,
        );
        return;
      }
      await finishFlush();
      usedTool = true;
      sequence += 1;
      await db.insert(agentRunEvents).values({
        runId,
        sequence,
        type: event.type,
        payload: event,
      });
      await publishProjectUpdate(project.id);
    };

    const turn = await agent.runTurn(
      {
        sandboxId: project.sandboxId!,
        workdir: project.sandboxWorkdir!,
        prompt: persistedSession
          ? promptMessage.content
          : promptWithConversation(conversation),
        sessionData: persistedSession,
      },
      recordEvent,
    );
    await finishFlush();
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

    await db.transaction(async (transaction) => {
      await transaction
        .insert(projectAgentSessions)
        .values({ projectId: project.id, data: turn.sessionData })
        .onConflictDoUpdate({
          target: projectAgentSessions.projectId,
          set: { data: turn.sessionData, updatedAt: new Date() },
        });
      await transaction
        .update(messages)
        .set({ status: "completed", content: finalResponse })
        .where(eq(messages.id, assistantMessage.id));
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
    await publishProjectUpdate(project.id);
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
