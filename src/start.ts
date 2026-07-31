import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const children: ChildProcess[] = [
  spawn(process.execPath, [nextBin, "start"], { cwd, env: process.env, stdio: "inherit" }),
  spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "src/worker.ts"],
    { cwd, env: process.env, stdio: "inherit" },
  ),
];

let stopping = false;

function stop(signal: NodeJS.Signals, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
  setTimeout(() => process.exit(exitCode), 1_000).unref();
}

for (const child of children) {
  child.once("exit", (code) => stop("SIGTERM", code ?? 1));
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
