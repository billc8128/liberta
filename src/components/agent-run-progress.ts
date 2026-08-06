import type { ProjectStateDto } from "@/lib/projects/types";

export interface AgentProgressStep {
  id: string;
  label: string;
  detail?: string;
  status: "active" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  toolCallId?: string;
}

export function buildAgentProgress(state: ProjectStateDto): AgentProgressStep[] {
  const run = state.run;
  if (!run) return [];
  if (run.status === "queued") {
    const ahead = state.queue?.ahead ?? 0;
    return [
      {
        id: "queue",
        label: ahead > 0 ? `Waiting for ${ahead} earlier request${ahead === 1 ? "" : "s"}` : "Waiting for an available agent",
        detail: state.queue?.followUps
          ? `${state.queue.followUps} follow-up${state.queue.followUps === 1 ? "" : "s"} queued`
          : undefined,
        status: "active",
        startedAt: run.createdAt,
      },
    ];
  }

  const steps: AgentProgressStep[] = [];
  const stepIndex = new Map<string, number>();
  const upsert = (step: AgentProgressStep) => {
    const index = stepIndex.get(step.id);
    if (index === undefined) {
      stepIndex.set(step.id, steps.length);
      steps.push(step);
      return;
    }
    steps[index] = { ...steps[index], ...step };
  };

  for (const event of state.events) {
    if (event.type === "progress") {
      const id = stringValue(event.payload.id);
      const label = stringValue(event.payload.label);
      const status = stringValue(event.payload.status);
      if (!id || !label) continue;
      const previous = steps[stepIndex.get(`progress:${id}`) ?? -1];
      upsert({
        id: `progress:${id}`,
        label,
        detail: stringValue(event.payload.detail) ?? previous?.detail,
        status:
          status === "failed"
            ? "failed"
            : status === "completed"
              ? "completed"
              : "active",
        startedAt: previous?.startedAt ?? event.createdAt,
        completedAt: status === "started" ? undefined : event.createdAt,
      });
      continue;
    }

    const toolCallId = stringValue(event.payload.toolCallId);
    const toolName = stringValue(event.payload.toolName);
    if (!toolCallId || !toolName) continue;
    const id = `tool:${toolCallId}`;
    if (event.type === "tool_started") {
      const presentation = describeTool(toolName, event.payload.args);
      upsert({
        id,
        label: presentation.label,
        detail: presentation.detail,
        status: "active",
        startedAt: event.createdAt,
        toolCallId,
      });
    }
    if (event.type === "tool_finished") {
      const previous = steps[stepIndex.get(id) ?? -1];
      upsert({
        id,
        label: previous?.label ?? describeTool(toolName).label,
        detail: previous?.detail,
        status: event.payload.isError === true ? "failed" : "completed",
        startedAt: previous?.startedAt ?? event.createdAt,
        completedAt: event.createdAt,
        toolCallId,
      });
    }
  }

  if (run.status === "running" && !steps.some((step) => step.status === "active")) {
    steps.push({
      id: "agent-next",
      label: steps.length ? "Planning the next change" : "Understanding the request",
      status: "active",
      startedAt: steps.at(-1)?.completedAt ?? run.startedAt ?? run.createdAt,
    });
  }

  return steps;
}

export function formatRunDuration(startedAt: string, now: number, completedAt?: string) {
  const duration = Math.max(
    0,
    (completedAt ? new Date(completedAt).getTime() : now) - new Date(startedAt).getTime(),
  );
  if (duration < 60_000) return `${Math.floor(duration / 1_000)}s`;
  const minutes = Math.floor(duration / 60_000);
  const seconds = Math.floor((duration % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

export function terminalTail(output: string) {
  const clean = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replaceAll("\r", "");
  return clean.split("\n").slice(-8).join("\n").slice(-2_400).trim();
}

function describeTool(toolName: string, args?: unknown) {
  const values = objectValue(args);
  if (toolName === "read") {
    const path = stringValue(values?.path);
    return { label: "Reading the project", detail: path ? basename(path) : undefined };
  }
  if (toolName === "write" || toolName === "edit") {
    const path = stringValue(values?.path);
    return { label: "Editing the site", detail: path ? basename(path) : undefined };
  }
  if (toolName === "bash") {
    const command = stringValue(values?.command)?.trim();
    const firstLine = command?.split("\n")[0];
    const label =
      command && /(?:pnpm|npm|yarn)\s+(?:i|install)\b/.test(command)
        ? "Installing dependencies"
        : command && /(?:pnpm|npm|yarn)\s+(?:run\s+)?(?:build|test|lint|typecheck)\b/.test(command)
          ? "Checking the build"
          : command && /(?:pnpm|npm|yarn)\s+(?:run\s+)?(?:dev|start)\b/.test(command)
            ? "Starting the site"
            : "Running a project command";
    return { label, detail: firstLine?.slice(0, 120) };
  }
  return { label: "Working on the project", detail: toolName };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function basename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
