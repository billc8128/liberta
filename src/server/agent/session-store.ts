import "server-only";

import { and, asc, eq, gt } from "drizzle-orm";

import { appendPiSessionEntries } from "@/server/agent/pi-session";
import { database } from "@/server/db";
import {
  agentSessionEntries,
  agentSessionSnapshots,
  agentSessions,
} from "@/server/db/schema";

export async function loadProjectAgentSession(projectId: string) {
  const db = database();
  await db
    .insert(agentSessions)
    .values({ projectId })
    .onConflictDoNothing({ target: agentSessions.projectId });

  const [record] = await db
    .select({ session: agentSessions, snapshot: agentSessionSnapshots })
    .from(agentSessions)
    .leftJoin(
      agentSessionSnapshots,
      eq(agentSessionSnapshots.sessionId, agentSessions.id),
    )
    .where(eq(agentSessions.projectId, projectId))
    .limit(1);
  if (!record) throw new Error(`Could not create agent session for ${projectId}.`);

  const snapshot = record.snapshot;
  const snapshotIsCurrent =
    snapshot !== null &&
    snapshot.generation === record.session.currentGeneration;
  const throughSequence = snapshotIsCurrent
    ? snapshot.throughSequence
    : -1;
  const pendingEntries = await db
    .select({ payload: agentSessionEntries.payload })
    .from(agentSessionEntries)
    .where(
      and(
        eq(agentSessionEntries.sessionId, record.session.id),
        eq(
          agentSessionEntries.generation,
          record.session.currentGeneration,
        ),
        gt(agentSessionEntries.sequence, throughSequence),
      ),
    )
    .orderBy(asc(agentSessionEntries.sequence));

  return {
    ...record.session,
    runId: record.session.activeRunId,
    data: appendPiSessionEntries(
      snapshotIsCurrent ? snapshot.data : "",
      pendingEntries.map((entry) => entry.payload),
    ),
  };
}
