import { createAgentRunWorker } from "@/server/queue/worker";

const { worker, connection } = createAgentRunWorker();

worker.on("failed", (job, error) => {
  console.error("Agent run failed", { jobId: job?.id, message: error.message });
});

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.log("Project L agent worker is ready.");
