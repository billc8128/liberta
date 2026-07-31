import "server-only";

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

export function createDaytonaTools(
  sandbox: Sandbox,
  workdir: string,
): ToolDefinition[] {
  const read = readOperations(sandbox);
  const write = writeOperations(sandbox);

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
      const result = await sandbox.process.executeCommand(
        command,
        cwd,
        undefined,
        options.timeout,
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

function readOperations(sandbox: Sandbox): ReadOperations {
  return {
    readFile: (path) => sandbox.fs.downloadFile(path),
    access: async (path) => {
      const result = await sandbox.process.executeCommand(
        `test -r ${shellQuote(path)}`,
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

function writeOperations(sandbox: Sandbox): WriteOperations {
  return {
    writeFile: (path, content) => sandbox.fs.uploadFile(Buffer.from(content), path),
    mkdir: (path) => sandbox.fs.createFolder(path, "755"),
  };
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
