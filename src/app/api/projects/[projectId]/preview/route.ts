import { currentSession } from "@/lib/auth/session";
import {
  ProjectAccessError,
} from "@/server/projects/service";
import {
  prepareProjectPreview,
  ProjectPreviewNotReadyError,
} from "@/server/projects/preview";

interface ProjectRouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: ProjectRouteContext) {
  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { projectId } = await context.params;
    await prepareProjectPreview(session.user.id, projectId);
    return Response.json({ ready: true });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof ProjectPreviewNotReadyError) {
      return Response.json({ error: "PREVIEW_NOT_READY" }, { status: 409 });
    }
    console.error("Preview URL failed", error);
    return Response.json({ error: "PREVIEW_FAILED" }, { status: 503 });
  }
}
