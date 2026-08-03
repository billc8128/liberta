import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { PiAgentRuntime } from "@/server/agent/pi";
import { piSessionByteSize } from "@/server/agent/pi-session";
import type {
  AgentCheckpoint,
  AgentRuntimeEvent,
} from "@/server/agent/runtime";
import { loadProjectAgentSession } from "@/server/agent/session-store";
import { database } from "@/server/db";
import {
  agentRunEvents,
  agentRuns,
  agentRunTools,
  messages,
  projectAgentSessions,
  projects,
} from "@/server/db/schema";
import { promptWithConversation } from "@/server/projects/prompt";
import {
  publishProjectMessageDelta,
  publishProjectMessageReplacement,
  publishProjectUpdate,
} from "@/server/projects/updates";
import { DaytonaSandboxRuntime } from "@/server/sandbox/daytona";
import { runnableWebsiteCheckCommand } from "@/server/sandbox/preview-command";

const UNPROVISIONED_WORKDIR = "/workspace/project";
export const RUN_LEASE_DURATION_MS = 30_000;
const RUN_HEARTBEAT_INTERVAL_MS = 5_000;

export async function executeAgentRun(
  runId: string,
  workerId: string,
  workerSignal?: AbortSignal,
) {
  const db = database();
  const leaseToken = randomUUID();
  const now = new Date();
  const [claimedRun] = await db
    .update(agentRuns)
    .set({
      status: "running",
      startedAt: now,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      leaseOwner: workerId,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_DURATION_MS),
      heartbeatAt: now,
      attempt: sql`${agentRuns.attempt} + 1`,
    })
    .where(
      and(
        eq(agentRuns.id, runId),
        isNull(agentRuns.cancelRequestedAt),
        or(
          eq(agentRuns.status, "queued"),
          and(
            eq(agentRuns.status, "running"),
            or(
              isNull(agentRuns.leaseExpiresAt),
              lt(agentRuns.leaseExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .returning();

  if (!claimedRun) return;

  const [record] = await db
    .select({ run: agentRuns, project: projects })
    .from(agentRuns)
    .innerJoin(projects, eq(agentRuns.projectId, projects.id))
    .where(eq(agentRuns.id, runId))
    .limit(1);
  if (!record) throw new Error(`Agent run ${runId} does not exist.`);

  const controller = new AbortController();
  const abortForShutdown = () =>
    controller.abort(new Error("Agent worker is shutting down."));
  workerSignal?.addEventListener("abort", abortForShutdown, { once: true });

  const heartbeat = async () => {
    const heartbeatAt = new Date();
    const [renewed] = await db
      .update(agentRuns)
      .set({
        heartbeatAt,
        leaseExpiresAt: new Date(
          heartbeatAt.getTime() + RUN_LEASE_DURATION_MS,
        ),
      })
      .where(
        and(
          eq(agentRuns.id, runId),
          eq(agentRuns.status, "running"),
          eq(agentRuns.leaseToken, leaseToken),
          isNull(agentRuns.cancelRequestedAt),
        ),
      )
      .returning({ id: agentRuns.id });
    if (renewed) return;

    const [current] = await db
      .select({
        leaseToken: agentRuns.leaseToken,
        cancelRequestedAt: agentRuns.cancelRequestedAt,
      })
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);
    controller.abort(
      current?.leaseToken === leaseToken && current.cancelRequestedAt
        ? new RunCancelledError()
        : new RunLeaseLostError(),
    );
  };
  let heartbeatPipeline = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeatPipeline = heartbeatPipeline
      .then(heartbeat)
      .catch((error) => controller.abort(error));
  }, RUN_HEARTBEAT_INTERVAL_MS);

  await db
    .update(projects)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(projects.id, record.project.id));
  await publishProjectUpdate(record.project.id);

  let response = "";
  let responseMessageId = record.run.responseMessageId ?? undefined;

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
    const resume = persistedSession?.runId === runId;
    const recoveryTools = resume
      ? await db
          .select()
          .from(agentRunTools)
          .where(eq(agentRunTools.runId, runId))
          .orderBy(asc(agentRunTools.startedAt))
      : [];

    const sandboxes = new DaytonaSandboxRuntime();
    let project = record.project;
    let sandboxPromise: Promise<{ id: string; workdir: string }> | undefined;
    const resolveSandbox = async () => {
      if (project.sandboxId && project.sandboxWorkdir) {
        return { id: project.sandboxId, workdir: project.sandboxWorkdir };
      }
      sandboxPromise ??= (async () => {
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
        return sandbox;
      })();
      return sandboxPromise;
    };

    const checkpoint = async (entry: AgentCheckpoint) => {
      const checkpointAt = new Date();
      await db.transaction(async (transaction) => {
        const [fenced] = await transaction
          .update(agentRuns)
          .set({
            checkpointSequence: sql`${agentRuns.checkpointSequence} + 1`,
            heartbeatAt: checkpointAt,
            leaseExpiresAt: new Date(
              checkpointAt.getTime() + RUN_LEASE_DURATION_MS,
            ),
          })
          .where(
            and(
              eq(agentRuns.id, runId),
              eq(agentRuns.status, "running"),
              eq(agentRuns.leaseToken, leaseToken),
              isNull(agentRuns.cancelRequestedAt),
            ),
          )
          .returning({ id: agentRuns.id });
        if (!fenced) throw new RunLeaseLostError();

        await transaction
          .insert(projectAgentSessions)
          .values({
            projectId: project.id,
            runId,
            data: entry.sessionData,
            byteSize: piSessionByteSize(entry.sessionData),
          })
          .onConflictDoUpdate({
            target: projectAgentSessions.projectId,
            set: {
              runId,
              data: entry.sessionData,
              byteSize: piSessionByteSize(entry.sessionData),
              updatedAt: checkpointAt,
            },
          });

        if (entry.type === "tool_started") {
          await transaction
            .insert(agentRunTools)
            .values({
              runId,
              toolCallId: entry.toolCallId,
              toolName: entry.toolName,
              status: "started",
              args: jsonValue(entry.args),
            })
            .onConflictDoUpdate({
              target: [agentRunTools.runId, agentRunTools.toolCallId],
              set: {
                toolName: entry.toolName,
                status: "started",
                args: jsonValue(entry.args),
                result: null,
                completedAt: null,
              },
            });
        }
        if (entry.type === "tool_finished") {
          await transaction
            .insert(agentRunTools)
            .values({
              runId,
              toolCallId: entry.toolCallId,
              toolName: entry.toolName,
              status: entry.isError ? "failed" : "completed",
              args: {},
              result: jsonValue(entry.result),
              completedAt: checkpointAt,
            })
            .onConflictDoUpdate({
              target: [agentRunTools.runId, agentRunTools.toolCallId],
              set: {
                status: entry.isError ? "failed" : "completed",
                result: jsonValue(entry.result),
                completedAt: checkpointAt,
              },
            });
        }
      });
    };

    let sequence =
      (
        await db
          .select({ sequence: agentRunEvents.sequence })
          .from(agentRunEvents)
          .where(eq(agentRunEvents.runId, runId))
          .orderBy(desc(agentRunEvents.sequence))
          .limit(1)
      )[0]?.sequence ?? 0;
    let pendingDelta = "";
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let flushPipeline = Promise.resolve();

    let assistantMessage = responseMessageId
      ? conversation.find((message) => message.id === responseMessageId)
      : undefined;
    if (!assistantMessage) {
      [assistantMessage] = await db
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
        .where(
          and(eq(agentRuns.id, runId), eq(agentRuns.leaseToken, leaseToken)),
        );
      await publishProjectUpdate(project.id);
    } else {
      response = resume ? "" : assistantMessage.content;
      await db
        .update(messages)
        .set({ status: "streaming", content: response })
        .where(eq(messages.id, assistantMessage.id));
      if (resume) {
        await publishProjectMessageReplacement(
          project.id,
          assistantMessage.id,
          "",
        );
      }
    }

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
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = undefined;
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
      sequence += 1;
      await db.insert(agentRunEvents).values({
        runId,
        sequence,
        type: event.type,
        payload: event,
      });
      await publishProjectUpdate(project.id);
    };

    const agent = new PiAgentRuntime(sandboxes);
    const turn = await agent.runTurn(
      {
        workdir: project.sandboxWorkdir ?? UNPROVISIONED_WORKDIR,
        prompt: persistedSession
          ? promptMessage.content
          : promptWithConversation(conversation),
        sessionData: persistedSession?.data ?? "",
        resume,
        recoveryTools: recoveryTools.map((tool) => ({
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          status: tool.status,
          result: tool.result,
        })),
        signal: controller.signal,
        resolveSandbox,
        onCheckpoint: checkpoint,
      },
      recordEvent,
    );
    await finishFlush();
    controller.signal.throwIfAborted();

    let hasRunnableWebsite = false;
    if (project.sandboxId && project.sandboxWorkdir) {
      const projectCheck = await sandboxes.execute(
        project.sandboxId,
        runnableWebsiteCheckCommand(),
        project.sandboxWorkdir,
        10,
      );
      hasRunnableWebsite = projectCheck.exitCode === 0;
    }
    if (!response.trim()) throw new Error("The agent finished without replying.");
    if (hasRunnableWebsite && project.sandboxId && project.sandboxWorkdir) {
      await sandboxes.startPreview(project.sandboxId, project.sandboxWorkdir);
    }

    await db.transaction(async (transaction) => {
      const [completed] = await transaction
        .update(agentRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(agentRuns.id, runId),
            eq(agentRuns.status, "running"),
            eq(agentRuns.leaseToken, leaseToken),
          ),
        )
        .returning({ id: agentRuns.id });
      if (!completed) throw new RunLeaseLostError();

      await transaction
        .insert(projectAgentSessions)
        .values({
          projectId: project.id,
          runId: null,
          data: turn.sessionData,
          byteSize: piSessionByteSize(turn.sessionData),
          rebasedAt: turn.rebased ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: projectAgentSessions.projectId,
          set: {
            runId: null,
            data: turn.sessionData,
            byteSize: piSessionByteSize(turn.sessionData),
            rebasedAt: turn.rebased
              ? new Date()
              : persistedSession?.rebasedAt ?? null,
            updatedAt: new Date(),
          },
        });
      await transaction
        .update(messages)
        .set({ status: "completed", content: response.trim() })
        .where(eq(messages.id, assistantMessage.id));
      await transaction
        .update(projects)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(projects.id, project.id));
    });
    await publishProjectUpdate(project.id);
  } catch (error) {
    if (workerSignal?.aborted || error instanceof RunLeaseLostError) return;
    const [current] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);
    if (current?.leaseToken !== leaseToken) return;

    const cancelled =
      current.cancelRequestedAt !== null ||
      error instanceof RunCancelledError ||
      controller.signal.reason instanceof RunCancelledError;
    await db.transaction(async (transaction) => {
      const [finished] = await transaction
        .update(agentRuns)
        .set({
          status: cancelled ? "cancelled" : "failed",
          errorCode: cancelled ? null : "AGENT_RUN_FAILED",
          errorMessage: cancelled
            ? null
            : error instanceof Error
              ? error.message
              : "Unknown agent failure",
          completedAt: new Date(),
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(eq(agentRuns.id, runId), eq(agentRuns.leaseToken, leaseToken)),
        )
        .returning({ id: agentRuns.id });
      if (!finished) return;
      if (responseMessageId) {
        await transaction
          .update(messages)
          .set({
            status: cancelled ? "completed" : "failed",
            content: response.trim() || (cancelled ? "Stopped." : "The agent stopped before it could reply."),
          })
          .where(eq(messages.id, responseMessageId));
      }
      await transaction
        .update(projects)
        .set({
          status: cancelled ? "ready" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, record.project.id));
    });
    await publishProjectUpdate(record.project.id);
    if (!cancelled) throw error;
  } finally {
    clearInterval(heartbeatTimer);
    workerSignal?.removeEventListener("abort", abortForShutdown);
  }
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

class RunLeaseLostError extends Error {
  constructor() {
    super("Agent run lease was lost.");
  }
}

class RunCancelledError extends Error {
  constructor() {
    super("Agent run was cancelled.");
  }
}
