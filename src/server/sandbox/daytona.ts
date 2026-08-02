import "server-only";

import { Daytona, Image, SandboxState } from "@daytona/sdk";

import { daytonaEnv } from "@/lib/env/server";
import { previewCommand } from "@/server/sandbox/preview-command";
import {
  DEFAULT_PREVIEW_PORT,
  PROJECT_DIRECTORY,
  type CommandResult,
  type ProjectSandbox,
  type SandboxRuntime,
} from "@/server/sandbox/runtime";

const PREVIEW_SESSION_PREFIX = "project-l-preview-";
const PROJECT_SANDBOX_IMAGE = Image.base("node:22-bookworm-slim")
  .runCommands(
    "apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep && rm -rf /var/lib/apt/lists/*",
  )
  .workdir("/workspace");

export class DaytonaSandboxRuntime implements SandboxRuntime {
  private readonly client: Daytona;

  constructor() {
    const env = daytonaEnv();
    this.client = new Daytona({
      apiKey: env.DAYTONA_API_KEY,
      apiUrl: env.DAYTONA_API_URL,
      target: env.DAYTONA_TARGET,
    });
  }

  async create(projectId: string): Promise<ProjectSandbox> {
    const sandbox = await this.client.create(
      {
        name: `project-l-${projectId}`,
        image: PROJECT_SANDBOX_IMAGE,
        language: "typescript",
        resources: {
          cpu: 1,
          memory: 1,
          disk: 1,
        },
        labels: {
          product: "project-l",
          projectId,
        },
        public: false,
        autoStopInterval: 15,
        autoArchiveInterval: 10_080,
        autoDeleteInterval: -1,
      },
      { timeout: 120 },
    );

    const root = (await sandbox.getWorkDir()) ?? (await sandbox.getUserHomeDir());
    if (!root) {
      throw new Error("Daytona did not return a sandbox working directory.");
    }

    const workdir = `${root.replace(/\/$/, "")}/${PROJECT_DIRECTORY}`;
    await sandbox.fs.createFolder(workdir, "755");

    return { id: sandbox.id, workdir };
  }

  get(sandboxId: string) {
    return this.client.get(sandboxId);
  }

  async ensureRunning(sandboxId: string) {
    const sandbox = await this.get(sandboxId);
    if (sandbox.state !== SandboxState.STARTED) {
      await this.client.start(sandbox, 120);
    }
    return sandbox;
  }

  async execute(
    sandboxId: string,
    command: string,
    cwd: string,
    timeoutSeconds = 120,
  ): Promise<CommandResult> {
    const sandbox = await this.ensureRunning(sandboxId);
    const result = await sandbox.process.executeCommand(
      command,
      cwd,
      undefined,
      timeoutSeconds,
    );

    return {
      exitCode: result.exitCode,
      output: result.result,
    };
  }

  async startPreview(sandboxId: string, workdir: string) {
    const sandbox = await this.ensureRunning(sandboxId);

    if (await previewResponds(sandbox)) {
      return;
    }

    const sessions = await sandbox.process.listSessions();
    for (const session of sessions) {
      if (session.sessionId.startsWith(PREVIEW_SESSION_PREFIX)) {
        await sandbox.process.deleteSession(session.sessionId);
      }
    }
    const previewSession = `${PREVIEW_SESSION_PREFIX}${Date.now()}`;
    await sandbox.process.createSession(previewSession);

    const command = await sandbox.process.executeSessionCommand(previewSession, {
      command: `cd ${shellQuote(workdir)} && ${previewCommand(DEFAULT_PREVIEW_PORT)}`,
      runAsync: true,
    });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await previewResponds(sandbox)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const logs = await sandbox.process.getSessionCommandLogs(
      previewSession,
      command.cmdId,
    );
    const detail = (logs.stderr || logs.stdout || logs.output || "").trim();
    throw new Error(
      detail
        ? `The generated site failed to start: ${detail.slice(-1_000)}`
        : "The generated site did not become ready on port 3000.",
    );
  }

  async previewUrl(sandboxId: string, port = DEFAULT_PREVIEW_PORT) {
    const sandbox = await this.ensureRunning(sandboxId);
    const preview = await sandbox.getSignedPreviewUrl(port, 60 * 60);
    return preview.url;
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function previewResponds(sandbox: Awaited<ReturnType<Daytona["get"]>>) {
  try {
    const result = await sandbox.process.executeCommand(
      `curl --silent --fail --max-time 2 http://127.0.0.1:${DEFAULT_PREVIEW_PORT}/ > /dev/null`,
      undefined,
      undefined,
      5,
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
