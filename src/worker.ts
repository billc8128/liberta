import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lt, or } from "drizzle-orm";

import { executeAgentRun } from "@/server/agent/execute-run";
import { database } from "@/server/db";
import { agentRuns } from "@/server/db/schema";

const POLL_INTERVAL_MS = 750;
let stopping = false;
const workerId = randomUUID();
const activeController = new AbortController();

function delay(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function nextRunId() {
  const expiredBefore = new Date();
  const [run] = await database()
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        isNull(agentRuns.cancelRequestedAt),
        or(
          eq(agentRuns.status, "queued"),
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

async function work() {
  while (!stopping) {
    const runId = await nextRunId();
    if (!runId) {
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    await executeAgentRun(runId, workerId, activeController.signal).catch((error) => {
      console.error("Agent run failed", {
        runId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

const activeRun = work();

async function shutdown() {
  stopping = true;
  activeController.abort();
  await activeRun;
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.log("Project L agent worker is ready.");
