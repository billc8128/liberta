import { currentSession } from "@/lib/auth/session";
import {
  getProjectState,
  ProjectAccessError,
} from "@/server/projects/service";
import { toProjectStateDto } from "@/server/projects/dto";

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
    const state = await getProjectState(session.user.id, projectId);
    return Response.json(toProjectStateDto(state));
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    console.error("Project state failed", error);
    return Response.json({ error: "PROJECT_STATE_FAILED" }, { status: 500 });
  }
}
