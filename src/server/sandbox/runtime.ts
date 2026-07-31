import type { Sandbox } from "@daytona/sdk";

export const PROJECT_DIRECTORY = "project";
export const DEFAULT_PREVIEW_PORT = 3000;

export interface ProjectSandbox {
  id: string;
  workdir: string;
}

export interface CommandResult {
  exitCode: number;
  output: string;
}

export interface SandboxRuntime {
  create(projectId: string): Promise<ProjectSandbox>;
  get(sandboxId: string): Promise<Sandbox>;
  ensureRunning(sandboxId: string): Promise<Sandbox>;
  execute(
    sandboxId: string,
    command: string,
    cwd: string,
    timeoutSeconds?: number,
  ): Promise<CommandResult>;
  startPreview(sandboxId: string, workdir: string): Promise<void>;
  previewUrl(sandboxId: string, port?: number): Promise<string>;
}
