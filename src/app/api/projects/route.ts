import { ZodError } from "zod";

import { currentSession } from "@/lib/auth/session";
import { createProject, failAgentRun } from "@/server/projects/service";
import { enqueueAgentRun } from "@/server/queue/agent-runs";

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { prompt?: unknown };
    const { project, run } = await createProject({
      ownerId: session.user.id,
      prompt: typeof body.prompt === "string" ? body.prompt : "",
    });

    try {
      await enqueueAgentRun(run.id);
    } catch (error) {
      await failAgentRun(
        run.id,
        "QUEUE_UNAVAILABLE",
        error instanceof Error ? error.message : "Agent queue is unavailable.",
      );
      console.error("Project queue unavailable", error);
      return Response.json({ error: "QUEUE_UNAVAILABLE" }, { status: 503 });
    }

    return Response.json({ projectId: project.id, runId: run.id }, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "INVALID_PROMPT", message: error.issues[0]?.message },
        { status: 400 },
      );
    }
    console.error("Project creation failed", error);
    return Response.json({ error: "PROJECT_CREATION_FAILED" }, { status: 503 });
  }
}
