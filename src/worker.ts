import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lt, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { executeAgentRun } from "@/server/agent/execute-run";
import { database } from "@/server/db";
import { agentRuns } from "@/server/db/schema";

const POLL_INTERVAL_MS = 750;
const WORKER_CONCURRENCY = 2;
let stopping = false;
const workerId = randomUUID();
const activeController = new AbortController();
const runningProjectRun = alias(agentRuns, "running_project_run");

function delay(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function nextRunId() {
  const expiredBefore = new Date();
  const db = database();
  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        isNull(agentRuns.cancelRequestedAt),
        or(
          and(
            eq(agentRuns.status, "queued"),
            notExists(
              db
                .select({ id: runningProjectRun.id })
                .from(runningProjectRun)
                .where(
                  and(
                    eq(runningProjectRun.projectId, agentRuns.projectId),
                    eq(runningProjectRun.status, "running"),
                  ),
                ),
            ),
          ),
          and(
            eq(agentRuns.status, "running"),
            or(
              isNull(agentRuns.leaseExpiresAt),
              lt(agentRuns.leaseExpiresAt, expiredBefore),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(agentRuns.createdAt))
    .limit(1);
  return run?.id;
}

async function work(slot: number) {
  while (!stopping) {
    const runId = await nextRunId();
    if (!runId) {
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    await executeAgentRun(
      runId,
      `${workerId}:${slot}`,
      activeController.signal,
    ).catch((error) => {
      console.error("Agent run failed", {
        runId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

const activeRuns = Array.from({ length: WORKER_CONCURRENCY }, (_, slot) =>
  work(slot),
);

async function shutdown() {
  stopping = true;
  activeController.abort();
  await Promise.all(activeRuns);
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.log("Project L agent worker is ready.");
