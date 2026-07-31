import "server-only";

import { Worker } from "bullmq";
import IORedis from "ioredis";

import { queueEnv } from "@/lib/env/server";
import { executeAgentRun } from "@/server/agent/execute-run";
import { AGENT_RUN_QUEUE, type AgentRunJob } from "@/server/queue/agent-runs";

export function createAgentRunWorker() {
  const connection = new IORedis(queueEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  const worker = new Worker<AgentRunJob>(
    AGENT_RUN_QUEUE,
    async (job) => executeAgentRun(job.data.runId),
    {
      connection,
      concurrency: 2,
    },
  );

  return { worker, connection };
}
