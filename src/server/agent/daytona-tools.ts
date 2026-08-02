import "server-only";

import path from "node:path";

import type { Sandbox } from "@daytona/sdk";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type BashOperations,
  type EditOperations,
  type ReadOperations,
  type ToolDefinition,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";

import type {
  ProjectSandbox,
  SandboxRuntime,
} from "@/server/sandbox/runtime";

const DEFAULT_COMMAND_TIMEOUT_SECONDS = 120;
const MAX_COMMAND_TIMEOUT_SECONDS = 300;

export function createDaytonaTools(
  sandboxes: SandboxRuntime,
  workdir: string,
  resolveSandbox: () => Promise<ProjectSandbox>,
): ToolDefinition[] {
  let workspacePromise:
    | Promise<{ sandbox: Sandbox; actualWorkdir: string }>
    | undefined;
  const workspace = () => {
    workspacePromise ??= resolveSandbox().then(async (resolved) => ({
      sandbox: await sandboxes.ensureRunning(resolved.id),
      actualWorkdir: resolved.workdir,
    }));
    return workspacePromise;
  };
  const resolvePath = async (requestedPath: string) => {
    const resolved = await workspace();
    return {
      sandbox: resolved.sandbox,
      path: mapSandboxPath(requestedPath, workdir, resolved.actualWorkdir),
    };
  };

  const read = readOperations(resolvePath);
  const write = writeOperations(resolvePath);

  const edit: EditOperations = {
    readFile: read.readFile,
    access: read.access,
    writeFile: write.writeFile,
  };

  const bash: BashOperations = {
    exec: async (command, cwd, options) => {
      if (options.signal?.aborted) {
        throw new Error("Command aborted before execution.");
      }

      // Never forward the Project L worker environment into a user sandbox.
      const resolved = await workspace();
      const result = await resolved.sandbox.process.executeCommand(
        command,
        mapSandboxPath(cwd, workdir, resolved.actualWorkdir),
        undefined,
        Math.min(
          options.timeout ?? DEFAULT_COMMAND_TIMEOUT_SECONDS,
          MAX_COMMAND_TIMEOUT_SECONDS,
        ),
      );

      if (options.signal?.aborted) {
        throw new Error("Command aborted.");
      }

      options.onData(Buffer.from(result.result));
      return { exitCode: result.exitCode };
    },
  };

  const tools = [
    createReadToolDefinition(workdir, { operations: read }),
    createWriteToolDefinition(workdir, { operations: write }),
    createEditToolDefinition(workdir, { operations: edit }),
    createBashToolDefinition(workdir, {
      operations: bash,
      exposeSessionEnvironment: false,
    }),
  ];

  // Pi's generic ToolDefinition is invariant, while customTools accepts mixed schemas.
  return tools as unknown as ToolDefinition[];
}

function readOperations(
  resolvePath: (
    path: string,
  ) => Promise<{ sandbox: Sandbox; path: string }>,
): ReadOperations {
  return {
    readFile: async (path) => {
      const resolved = await resolvePath(path);
      return resolved.sandbox.fs.downloadFile(resolved.path);
    },
    access: async (path) => {
      const resolved = await resolvePath(path);
      const result = await resolved.sandbox.process.executeCommand(
        `test -r ${shellQuote(resolved.path)}`,
        undefined,
        undefined,
        10,
      );
      if (result.exitCode !== 0) {
        throw new Error(`File is not readable: ${path}`);
      }
    },
  };
}

function writeOperations(
  resolvePath: (
    path: string,
  ) => Promise<{ sandbox: Sandbox; path: string }>,
): WriteOperations {
  return {
    writeFile: async (path, content) => {
      const resolved = await resolvePath(path);
      return resolved.sandbox.fs.uploadFile(Buffer.from(content), resolved.path);
    },
    mkdir: async (path) => {
      const resolved = await resolvePath(path);
      return resolved.sandbox.fs.createFolder(resolved.path, "755");
    },
  };
}

function mapSandboxPath(
  requestedPath: string,
  exposedWorkdir: string,
  actualWorkdir: string,
) {
  const absolutePath = path.posix.resolve(exposedWorkdir, requestedPath);
  const relativePath = path.posix.relative(exposedWorkdir, absolutePath);
  if (relativePath === ".." || relativePath.startsWith("../")) {
    throw new Error("Path is outside the project workspace.");
  }
  return path.posix.join(actualWorkdir, relativePath);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
