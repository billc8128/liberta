import { asc, eq } from "drizzle-orm";

import { executeAgentRun } from "@/server/agent/execute-run";
import { database } from "@/server/db";
import { agentRuns } from "@/server/db/schema";

const POLL_INTERVAL_MS = 750;
let stopping = false;

function delay(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function nextQueuedRunId() {
  const [run] = await database()
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.status, "queued"))
    .orderBy(asc(agentRuns.createdAt))
    .limit(1);
  return run?.id;
}

async function work() {
  while (!stopping) {
    const runId = await nextQueuedRunId();
    if (!runId) {
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    await executeAgentRun(runId).catch((error) => {
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
  await activeRun;
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.log("Project L agent worker is ready.");
