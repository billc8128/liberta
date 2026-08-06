import "server-only";

import { getOwnedProject } from "@/server/projects/service";
import { DaytonaSandboxRuntime } from "@/server/sandbox/daytona";
import { runnableWebsiteCheckCommand } from "@/server/sandbox/preview-command";

export class ProjectPreviewNotReadyError extends Error {}

export async function prepareProjectPreview(userId: string, projectId: string) {
  const project = await getOwnedProject(userId, projectId);
  if (
    !project.sandboxId ||
    !project.sandboxWorkdir ||
    (project.status !== "ready" && project.status !== "running")
  ) {
    throw new ProjectPreviewNotReadyError();
  }

  const sandboxes = new DaytonaSandboxRuntime();
  const website = await sandboxes.execute(
    project.sandboxId,
    runnableWebsiteCheckCommand(),
    project.sandboxWorkdir,
    10,
  );
  if (website.exitCode !== 0) throw new ProjectPreviewNotReadyError();

  await sandboxes.startPreview(project.sandboxId, project.sandboxWorkdir);
  return sandboxes.previewUrl(project.sandboxId, project.previewPort);
}
