import "server-only";

import type { ProjectStateDto } from "@/lib/projects/types";
import type { getProjectState } from "@/server/projects/service";

type ProjectState = Awaited<ReturnType<typeof getProjectState>>;

export function toProjectStateDto(state: ProjectState): ProjectStateDto {
  return {
    project: {
      id: state.project.id,
      name: state.project.name,
      status: state.project.status,
      previewPort: state.project.previewPort,
      updatedAt: state.project.updatedAt.toISOString(),
    },
    messages: state.messages.map((message) => ({
      id: message.id,
      role: message.role,
      status: message.status,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
    run: state.run
      ? {
          id: state.run.id,
          status: state.run.status,
          errorMessage: state.run.errorMessage,
          cancelRequestedAt: state.run.cancelRequestedAt?.toISOString() ?? null,
          createdAt: state.run.createdAt.toISOString(),
        }
      : null,
    events: state.events.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
