import { notFound, redirect } from "next/navigation";

import { currentSession } from "@/lib/auth/session";
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

  return (
    <main className="standalone-preview">
      <iframe
        src={`/api/projects/${project.id}/preview/document`}
        title={`${project.name} preview`}
        allow="clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
      />
    </main>
  );
}
