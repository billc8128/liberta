import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";

export const MAX_PROJECT_SESSION_BYTES = 8 * 1024 * 1024;

export function openPiSession(workdir: string, data?: string) {
  const directory = mkdtempSync(join(tmpdir(), "liberta-pi-"));
  const file = join(directory, "session.jsonl");

  try {
    if (data) writeFileSync(file, data, "utf8");
    const manager = data
      ? SessionManager.open(file, directory, workdir)
      : SessionManager.create(workdir, directory);

    return {
      manager,
      serialize() {
        const sessionFile = manager.getSessionFile();
        if (!sessionFile) {
          throw new Error("Pi did not create a persistent session file.");
        }
        if (existsSync(sessionFile)) return readFileSync(sessionFile, "utf8");
        return `${[manager.getHeader(), ...manager.getEntries()]
          .map((entry) => JSON.stringify(entry))
          .join("\n")}\n`;
      },
      close() {
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function piSessionByteSize(data: string) {
  return Buffer.byteLength(data, "utf8");
}

export function parsePiSessionData(data: string) {
  return data
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function appendPiSessionEntries(
  data: string,
  entries: Array<Record<string, unknown>>,
) {
  if (entries.length === 0) return data;
  const prefix = data && !data.endsWith("\n") ? `${data}\n` : data;
  return `${prefix}${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export function rebasePiSession(manager: SessionManager) {
  const messages = manager.buildSessionContext().messages;
  manager.newSession();

  for (const message of messages) {
    if (
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "toolResult" ||
      message.role === "bashExecution"
    ) {
      manager.appendMessage(message);
      continue;
    }
    if (message.role === "custom") {
      manager.appendCustomMessageEntry(
        message.customType,
        message.content,
        message.display,
        message.details,
      );
      continue;
    }
    if (message.role === "compactionSummary") {
      manager.appendCustomMessageEntry(
        "project-l-session-memory",
        `Earlier project context:\n\n${message.summary}`,
        false,
      );
      continue;
    }
    if (message.role === "branchSummary") {
      manager.appendCustomMessageEntry(
        "project-l-branch-memory",
        `Earlier branch context:\n\n${message.summary}`,
        false,
      );
    }
  }
}
