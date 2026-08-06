import { ZodError } from "zod";

import { currentSession } from "@/lib/auth/session";
import {
  addProjectMessage,
  ProjectAccessError,
} from "@/server/projects/service";

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
    const { message, run } = await addProjectMessage({
      ownerId: session.user.id,
      projectId,
      prompt: typeof body.prompt === "string" ? body.prompt : "",
    });

    return Response.json(
      {
        message: {
          id: message.id,
          role: message.role,
          status: message.status,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        },
        run: {
          id: run.id,
          status: run.status,
          errorMessage: run.errorMessage,
          cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
          createdAt: run.createdAt.toISOString(),
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "INVALID_PROMPT" }, { status: 400 });
    }
    if (error instanceof ProjectAccessError) {
      return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    console.error("Project message failed", error);
    return Response.json({ error: "MESSAGE_FAILED" }, { status: 503 });
  }
}
