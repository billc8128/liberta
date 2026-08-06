import { currentSession } from "@/lib/auth/session";
import {
  prepareProjectPreview,
  ProjectPreviewNotReadyError,
} from "@/server/projects/preview";
import { ProjectAccessError } from "@/server/projects/service";
import { addPreviewBase } from "@/server/sandbox/preview-document";

interface ProjectRouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: ProjectRouteContext) {
  const session = await currentSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  try {
    const { projectId } = await context.params;
    const previewUrl = await prepareProjectPreview(session.user.id, projectId);
    const preview = await fetch(previewUrl, {
      headers: { "X-Daytona-Skip-Preview-Warning": "true" },
      cache: "no-store",
    });
    if (!preview.ok) {
      return new Response("Preview unavailable", { status: 502 });
    }

    const html = addPreviewBase(await preview.text(), previewUrl);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return new Response("Project not found", { status: 404 });
    }
    if (error instanceof ProjectPreviewNotReadyError) {
      return new Response("Preview not ready", { status: 409 });
    }
    console.error("Preview document failed", error);
    return new Response("Preview unavailable", { status: 503 });
  }
}
