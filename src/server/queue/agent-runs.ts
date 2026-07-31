import "server-only";

import { Queue } from "bullmq";
import IORedis from "ioredis";

import { queueEnv } from "@/lib/env/server";

export const AGENT_RUN_QUEUE = "project-l-agent-runs";

export interface AgentRunJob {
  runId: string;
}

let connection: IORedis | undefined;
let queue: Queue<AgentRunJob> | undefined;

export function agentRunQueue() {
  connection ??= new IORedis(queueEnv().REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
  queue ??= new Queue<AgentRunJob>(AGENT_RUN_QUEUE, { connection });
  return queue;
}

export async function enqueueAgentRun(runId: string) {
  await agentRunQueue().add(
    "execute-agent-run",
    { runId },
    {
      jobId: runId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1_000 },
    },
  );
}
