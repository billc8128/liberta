import "server-only";

import { databaseClient } from "@/server/db";

export const PROJECT_UPDATES_CHANNEL = "project_updates";

export type ProjectUpdate =
  | { type: "state"; projectId: string }
  | {
      type: "message_delta";
      projectId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: "message_replace";
      projectId: string;
      messageId: string;
      content: string;
    };

type ProjectUpdateHandler = (update: ProjectUpdate) => void;

const subscribers = new Map<string, Set<ProjectUpdateHandler>>();
let listenerPromise: ReturnType<ReturnType<typeof databaseClient>["listen"]> | undefined;

export async function publishProjectUpdate(projectId: string) {
  await publish({ type: "state", projectId });
}

export async function publishProjectMessageDelta(
  projectId: string,
  messageId: string,
  delta: string,
) {
  await publish({ type: "message_delta", projectId, messageId, delta });
}

export async function publishProjectMessageReplacement(
  projectId: string,
  messageId: string,
  content: string,
) {
  await publish({ type: "message_replace", projectId, messageId, content });
}

async function publish(update: ProjectUpdate) {
  try {
    await databaseClient().notify(PROJECT_UPDATES_CHANNEL, JSON.stringify(update));
  } catch (error) {
    console.error("Could not publish project update", {
      projectId: update.projectId,
      error,
    });
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
    (payload) => {
      const update = parseUpdate(payload);
      for (const subscriber of subscribers.get(update.projectId) ?? []) {
        subscriber(update);
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

function parseUpdate(payload: string): ProjectUpdate {
  try {
    return JSON.parse(payload) as ProjectUpdate;
  } catch {
    // Accept notifications from an older web or worker process during deploys.
    return { type: "state", projectId: payload };
  }
}
