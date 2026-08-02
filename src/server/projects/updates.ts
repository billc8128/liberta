import "server-only";

import { databaseClient } from "@/server/db";

export const PROJECT_UPDATES_CHANNEL = "project_updates";

type ProjectUpdateHandler = () => void;

const subscribers = new Map<string, Set<ProjectUpdateHandler>>();
let listenerPromise: ReturnType<ReturnType<typeof databaseClient>["listen"]> | undefined;

export async function publishProjectUpdate(projectId: string) {
  try {
    await databaseClient().notify(PROJECT_UPDATES_CHANNEL, projectId);
  } catch (error) {
    console.error("Could not publish project update", { projectId, error });
  }
}

export async function subscribeToProjectUpdates(
  projectId: string,
  handler: ProjectUpdateHandler,
) {
  const projectSubscribers = subscribers.get(projectId) ?? new Set();
  projectSubscribers.add(handler);
  subscribers.set(projectId, projectSubscribers);

  listenerPromise ??= databaseClient().listen(
    PROJECT_UPDATES_CHANNEL,
    (updatedProjectId) => {
      for (const subscriber of subscribers.get(updatedProjectId) ?? []) {
        subscriber();
      }
    },
  );

  try {
    await listenerPromise;
  } catch (error) {
    projectSubscribers.delete(handler);
    if (projectSubscribers.size === 0) subscribers.delete(projectId);
    listenerPromise = undefined;
    throw error;
  }

  return () => {
    projectSubscribers.delete(handler);
    if (projectSubscribers.size === 0) subscribers.delete(projectId);
  };
}
