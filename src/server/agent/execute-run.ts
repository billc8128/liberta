import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { PiAgentRuntime } from "@/server/agent/pi";
import { creatorFacingResponse } from "@/lib/projects/creator-response";
import {
  parsePiSessionData,
  piSessionByteSize,
} from "@/server/agent/pi-session";
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
  agentSessionEntries,
  agentSessionSnapshots,
  agentSessions,
  messages,
  projects,
} from "@/server/db/schema";
import { promptWithConversation } from "@/server/projects/prompt";
import {
  publishProjectMessageDelta,
  publishProjectMessageReplacement,
  publishProjectRunOutput,
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
  console.info("Agent run started", {
    runId,
    projectId: record.project.id,
    queuedMs: now.getTime() - record.run.createdAt.getTime(),
  });

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

    await db.transaction(async (transaction) => {
      await transaction
        .update(agentRuns)
        .set({
          sessionId: persistedSession.id,
          startEntrySequence:
            record.run.startEntrySequence ?? persistedSession.entryCount,
        })
        .where(
          and(eq(agentRuns.id, runId), eq(agentRuns.leaseToken, leaseToken)),
        );
      await transaction
        .update(agentSessions)
        .set({ activeRunId: runId, updatedAt: new Date() })
        .where(eq(agentSessions.id, persistedSession.id));
    });

    const sandboxes = new DaytonaSandboxRuntime();
    let project = record.project;
    let sandboxPromise: Promise<{ id: string; workdir: string }> | undefined;
    let reportEvent: (event: AgentRuntimeEvent) => Promise<void> = () =>
      Promise.resolve();
    const resolveSandbox = async () => {
      if (project.sandboxId && project.sandboxWorkdir) {
        return { id: project.sandboxId, workdir: project.sandboxWorkdir };
      }
      sandboxPromise ??= (async () => {
        const startedAt = Date.now();
        await reportEvent({
          type: "progress",
          id: "workspace",
          label: "Preparing the workspace",
          status: "started",
        });
        try {
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
          await reportEvent({
            type: "progress",
            id: "workspace",
            label: "Preparing the workspace",
            status: "completed",
            detail: `${Math.max(1, Math.round((Date.now() - startedAt) / 1_000))}s`,
          });
          return sandbox;
        } catch (error) {
          await reportEvent({
            type: "progress",
            id: "workspace",
            label: "Preparing the workspace",
            status: "failed",
          });
          throw error;
        }
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

        const [storedSession] = await transaction
          .select()
          .from(agentSessions)
          .where(eq(agentSessions.id, persistedSession.id))
          .limit(1)
          .for("update");
        if (!storedSession) throw new Error("Agent session does not exist.");

        const rebased = entry.type === "snapshot" && entry.rebased === true;
        const generation = rebased
          ? storedSession.currentGeneration + 1
          : storedSession.currentGeneration;
        const sessionData = entry.type === "entry" ? undefined : entry.sessionData;
        const payloads =
          entry.type === "entry"
            ? [entry.entry]
            : parsePiSessionData(entry.sessionData);
        let nextSequence = storedSession.entryCount;
        let headEntryId = storedSession.headEntryId;
        let piSessionId = storedSession.piSessionId;
        let latestCompactionEntryId =
          storedSession.latestCompactionEntryId;

        for (const payload of payloads) {
          const piEntryId = String(payload.id ?? "");
          if (!piEntryId) throw new Error("Pi session entry is missing its id.");
          const entryType = String(payload.type ?? "unknown");
          const [inserted] = await transaction
            .insert(agentSessionEntries)
            .values({
              sessionId: storedSession.id,
              runId,
              sequence: nextSequence,
              generation,
              piEntryId,
              parentPiEntryId:
                typeof payload.parentId === "string" ? payload.parentId : null,
              entryType,
              payload,
            })
            .onConflictDoNothing({
              target: [
                agentSessionEntries.sessionId,
                agentSessionEntries.generation,
                agentSessionEntries.piEntryId,
              ],
            })
            .returning({ id: agentSessionEntries.id });
          if (!inserted) continue;
          nextSequence += 1;
          headEntryId = piEntryId;
          if (entryType === "session") piSessionId = piEntryId;
          if (entryType === "compaction") {
            latestCompactionEntryId = piEntryId;
          }
        }

        await transaction
          .update(agentSessions)
          .set({
            piSessionId,
            headEntryId,
            latestCompactionEntryId,
            activeRunId: runId,
            currentGeneration: generation,
            entryCount: nextSequence,
            rebasedAt: rebased ? checkpointAt : storedSession.rebasedAt,
            updatedAt: checkpointAt,
          })
          .where(eq(agentSessions.id, storedSession.id));

        if (sessionData) {
          const [existingSnapshot] = await transaction
            .select()
            .from(agentSessionSnapshots)
            .where(eq(agentSessionSnapshots.sessionId, storedSession.id))
            .limit(1);
          await transaction
            .insert(agentSessionSnapshots)
            .values({
              sessionId: storedSession.id,
              generation,
              throughSequence: nextSequence - 1,
              headEntryId,
              data: sessionData,
              byteSize: piSessionByteSize(sessionData),
              compactedAt: rebased
                ? checkpointAt
                : existingSnapshot?.compactedAt,
              updatedAt: checkpointAt,
            })
            .onConflictDoUpdate({
              target: agentSessionSnapshots.sessionId,
              set: {
                generation,
                throughSequence: nextSequence - 1,
                headEntryId,
                data: sessionData,
                byteSize: piSessionByteSize(sessionData),
                compactedAt: rebased
                  ? checkpointAt
                  : existingSnapshot?.compactedAt,
                updatedAt: checkpointAt,
              },
            });
        }

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
    let firstOutputRecorded = false;
    const recordEvent = async (event: AgentRuntimeEvent) => {
      if (event.type === "text_delta") {
        if (!firstOutputRecorded) {
          firstOutputRecorded = true;
          console.info("Agent run produced first output", {
            runId,
            projectId: project.id,
            elapsedMs: Date.now() - now.getTime(),
          });
        }
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
      if (event.type === "tool_output") {
        await publishProjectRunOutput(
          project.id,
          runId,
          event.toolCallId,
          event.output,
        );
        return;
      }
      if (event.type === "tool_started" && !firstOutputRecorded) {
        firstOutputRecorded = true;
        console.info("Agent run produced first output", {
          runId,
          projectId: project.id,
          elapsedMs: Date.now() - now.getTime(),
        });
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
    let runtimeEventPipeline = Promise.resolve();
    reportEvent = (event) => {
      const recorded = runtimeEventPipeline.then(() => recordEvent(event));
      runtimeEventPipeline = recorded;
      return recorded;
    };

    const warmSandbox = project.sandboxId ? undefined : resolveSandbox();
    void warmSandbox?.catch(() => {});
    const agent = new PiAgentRuntime(sandboxes);
    await reportEvent({
      type: "progress",
      id: "brief",
      label: "Understanding the request",
      status: "completed",
    });
    await agent.runTurn(
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
      reportEvent,
    );
    await finishFlush();
    controller.signal.throwIfAborted();
    await warmSandbox;

    await reportEvent({
      type: "progress",
      id: "check",
      label: "Checking the project",
      status: "started",
    });
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
    await reportEvent({
      type: "progress",
      id: "check",
      label: "Checking the project",
      status: "completed",
      detail: hasRunnableWebsite ? "Runnable" : "No preview yet",
    });
    if (!response.trim()) throw new Error("The agent finished without replying.");
    if (hasRunnableWebsite && project.sandboxId && project.sandboxWorkdir) {
      await reportEvent({
        type: "progress",
        id: "preview",
        label: "Starting the preview",
        status: "started",
      });
      try {
        await sandboxes.startPreview(project.sandboxId, project.sandboxWorkdir);
        await reportEvent({
          type: "progress",
          id: "preview",
          label: "Starting the preview",
          status: "completed",
        });
      } catch (error) {
        await reportEvent({
          type: "progress",
          id: "preview",
          label: "Starting the preview",
          status: "failed",
        });
        throw error;
      }
    }

    const visibleResponse = creatorFacingResponse(response, hasRunnableWebsite);
    if (visibleResponse !== response.trim()) {
      response = visibleResponse;
      await db
        .update(messages)
        .set({ content: response })
        .where(eq(messages.id, assistantMessage.id));
      await publishProjectMessageReplacement(
        project.id,
        assistantMessage.id,
        response,
      );
    }

    await db.transaction(async (transaction) => {
      const [finalSession] = await transaction
        .select({ entryCount: agentSessions.entryCount })
        .from(agentSessions)
        .where(eq(agentSessions.id, persistedSession.id))
        .limit(1);
      if (!finalSession) throw new Error("Agent session does not exist.");
      const [completed] = await transaction
        .update(agentRuns)
        .set({
          status: "completed",
          sessionId: persistedSession.id,
          endEntrySequence: finalSession.entryCount - 1,
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
        .update(agentSessions)
        .set({ activeRunId: null, updatedAt: new Date() })
        .where(eq(agentSessions.id, persistedSession.id));
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
    console.info("Agent run completed", {
      runId,
      projectId: project.id,
      durationMs: Date.now() - now.getTime(),
    });
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
    const failedSession = current.sessionId
      ? (
          await db
            .select({ entryCount: agentSessions.entryCount })
            .from(agentSessions)
            .where(eq(agentSessions.id, current.sessionId))
            .limit(1)
        )[0]
      : undefined;
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
          endEntrySequence: failedSession
            ? failedSession.entryCount - 1
            : current.endEntrySequence,
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
      if (current.sessionId) {
        await transaction
          .update(agentSessions)
          .set({ activeRunId: null, updatedAt: new Date() })
          .where(eq(agentSessions.id, current.sessionId));
      }
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
    console.info(cancelled ? "Agent run cancelled" : "Agent run failed", {
      runId,
      projectId: record.project.id,
      durationMs: Date.now() - now.getTime(),
      ...(cancelled
        ? {}
        : { message: error instanceof Error ? error.message : String(error) }),
    });
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
