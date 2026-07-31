import { notFound, redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/project-workspace";
import { currentSession } from "@/lib/auth/session";
import { toProjectStateDto } from "@/server/projects/dto";
import {
  getProjectState,
  ProjectAccessError,
} from "@/server/projects/service";

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await currentSession();
  if (!session) redirect("/login");

  let initialState;
  try {
    const { projectId } = await params;
    const state = await getProjectState(session.user.id, projectId);
    initialState = toProjectStateDto(state);
  } catch (error) {
    if (error instanceof ProjectAccessError) notFound();
    throw error;
  }

  return <ProjectWorkspace initialState={initialState} />;
}
