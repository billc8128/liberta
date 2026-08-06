import "server-only";

import { getOwnedProject } from "@/server/projects/service";
import { DaytonaSandboxRuntime } from "@/server/sandbox/daytona";
import { runnableWebsiteCheckCommand } from "@/server/sandbox/preview-command";

export class ProjectPreviewNotReadyError extends Error {}

const PREVIEW_URL_TTL_MS = 50 * 60 * 1_000;
const previewUrls = new Map<
  string,
  { sandboxId: string; url: string; expiresAt: number }
>();

export async function prepareProjectPreview(userId: string, projectId: string) {
  const cacheKey = `${userId}:${projectId}`;
  const cached = previewUrls.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

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
  const url = await sandboxes.previewUrl(project.sandboxId, project.previewPort);
  previewUrls.set(cacheKey, {
    sandboxId: project.sandboxId,
    url,
    expiresAt: Date.now() + PREVIEW_URL_TTL_MS,
  });
  return url;
}
