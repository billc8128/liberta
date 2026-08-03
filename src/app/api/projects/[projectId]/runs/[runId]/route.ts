import { currentSession } from "@/lib/auth/session";
import {
  cancelProjectRun,
  ProjectAccessError,
} from "@/server/projects/service";

interface RunRouteContext {
  params: Promise<{ projectId: string; runId: string }>;
}

export async function DELETE(_request: Request, context: RunRouteContext) {
  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { projectId, runId } = await context.params;
    const run = await cancelProjectRun({
      ownerId: session.user.id,
      projectId,
      runId,
    });
    return Response.json({ id: run.id, status: run.status });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    console.error("Project run cancellation failed", error);
    return Response.json({ error: "CANCEL_FAILED" }, { status: 500 });
  }
}
