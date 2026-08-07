import { notFound, redirect } from "next/navigation";

import { authEnv } from "@/lib/env/server";
import { currentSession } from "@/lib/auth/session";
import { createPreviewAccess } from "@/server/projects/preview-access";
import { prepareProjectPreview } from "@/server/projects/preview";
import { getOwnedProject, ProjectAccessError } from "@/server/projects/service";

interface PreviewPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const session = await currentSession();
  if (!session) redirect("/login");

  const { projectId } = await params;
  let project: Awaited<ReturnType<typeof getOwnedProject>>;
  try {
    project = await getOwnedProject(session.user.id, projectId);
  } catch (error) {
    if (error instanceof ProjectAccessError) notFound();
    throw error;
  }
  await prepareProjectPreview(session.user.id, project.id);
  const token = createPreviewAccess(
    project.id,
    session.user.id,
    authEnv().BETTER_AUTH_SECRET,
  );

  return (
    <main className="standalone-preview">
      <iframe
        src={`/api/projects/${project.id}/preview/proxy/${encodeURIComponent(token)}/`}
        title={`${project.name} preview`}
        allow="clipboard-read; clipboard-write; fullscreen"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
        allowFullScreen
      />
    </main>
  );
}
