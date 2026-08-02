import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";

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
        return readFileSync(sessionFile, "utf8");
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
