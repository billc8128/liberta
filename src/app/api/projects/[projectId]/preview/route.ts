import { currentSession } from "@/lib/auth/session";
import {
  getOwnedProject,
  ProjectAccessError,
} from "@/server/projects/service";
import { DaytonaSandboxRuntime } from "@/server/sandbox/daytona";
import { runnableWebsiteCheckCommand } from "@/server/sandbox/preview-command";

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
    const project = await getOwnedProject(session.user.id, projectId);
    if (!project.sandboxId || !project.sandboxWorkdir || project.status !== "ready") {
      return Response.json({ error: "PREVIEW_NOT_READY" }, { status: 409 });
    }

    const sandboxes = new DaytonaSandboxRuntime();
    const website = await sandboxes.execute(
      project.sandboxId,
      runnableWebsiteCheckCommand(),
      project.sandboxWorkdir,
      10,
    );
    if (website.exitCode !== 0) {
      return Response.json({ error: "PREVIEW_NOT_READY" }, { status: 409 });
    }
    await sandboxes.startPreview(project.sandboxId, project.sandboxWorkdir);
    const url = await sandboxes.previewUrl(
      project.sandboxId,
      project.previewPort,
    );
    return Response.json({ url });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    console.error("Preview URL failed", error);
    return Response.json({ error: "PREVIEW_FAILED" }, { status: 503 });
  }
}
