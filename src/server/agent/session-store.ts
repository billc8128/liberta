import "server-only";

import { eq } from "drizzle-orm";

import { database } from "@/server/db";
import { projectAgentSessions } from "@/server/db/schema";

export async function loadProjectAgentSession(projectId: string) {
  const [session] = await database()
    .select()
    .from(projectAgentSessions)
    .where(eq(projectAgentSessions.projectId, projectId))
    .limit(1);

  return session;
}
