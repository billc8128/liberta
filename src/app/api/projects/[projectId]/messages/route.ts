import { ZodError } from "zod";

import { currentSession } from "@/lib/auth/session";
import {
  addProjectMessage,
  failAgentRun,
  ProjectAccessError,
  ProjectBusyError,
} from "@/server/projects/service";
import { enqueueAgentRun } from "@/server/queue/agent-runs";

interface ProjectRouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, context: ProjectRouteContext) {
  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as { prompt?: unknown };
    const { run } = await addProjectMessage({
      ownerId: session.user.id,
      projectId,
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
      throw error;
    }

    return Response.json({ runId: run.id }, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "INVALID_PROMPT" }, { status: 400 });
    }
    if (error instanceof ProjectAccessError) {
      return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof ProjectBusyError) {
      return Response.json({ error: "PROJECT_BUSY" }, { status: 409 });
    }
    console.error("Project message failed", error);
    return Response.json({ error: "MESSAGE_FAILED" }, { status: 503 });
  }
}
