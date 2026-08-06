import { describe, expect, it } from "vitest";

import {
  buildAgentProgress,
  formatRunDuration,
  terminalTail,
} from "./agent-run-progress";
import type { ProjectStateDto } from "@/lib/projects/types";

const baseState: ProjectStateDto = {
  project: {
    id: "project-1",
    name: "Portfolio",
    status: "running",
    previewPort: 3000,
    updatedAt: "2026-08-06T10:00:00.000Z",
  },
  messages: [],
  run: {
    id: "run-1",
    status: "running",
    errorMessage: null,
    cancelRequestedAt: null,
    startedAt: "2026-08-06T10:00:00.000Z",
    completedAt: null,
    createdAt: "2026-08-06T09:59:59.000Z",
  },
  queue: { ahead: 0, followUps: 0 },
  events: [],
};

describe("buildAgentProgress", () => {
  it("describes a queued request with its real position", () => {
    const steps = buildAgentProgress({
      ...baseState,
      run: { ...baseState.run!, status: "queued", startedAt: null },
      queue: { ahead: 2, followUps: 1 },
    });

    expect(steps).toEqual([
      expect.objectContaining({
        label: "Waiting for 2 earlier requests",
        detail: "1 follow-up queued",
        status: "active",
      }),
    ]);
  });

  it("turns tool lifecycle events into one truthful timeline step", () => {
    const steps = buildAgentProgress({
      ...baseState,
      events: [
        {
          id: "event-1",
          sequence: 1,
          type: "tool_started",
          payload: {
            type: "tool_started",
            toolCallId: "tool-1",
            toolName: "bash",
            args: { command: "pnpm install" },
          },
          createdAt: "2026-08-06T10:00:01.000Z",
        },
        {
          id: "event-2",
          sequence: 2,
          type: "tool_finished",
          payload: {
            type: "tool_finished",
            toolCallId: "tool-1",
            toolName: "bash",
            isError: false,
          },
          createdAt: "2026-08-06T10:00:05.000Z",
        },
      ],
    });

    expect(steps[0]).toMatchObject({
      label: "Installing dependencies",
      detail: "pnpm install",
      status: "completed",
      completedAt: "2026-08-06T10:00:05.000Z",
    });
    expect(steps.at(-1)?.label).toBe("Planning the next change");
  });
});

describe("progress formatting", () => {
  it("formats elapsed time without hiding long waits", () => {
    expect(
      formatRunDuration("2026-08-06T10:00:00.000Z", Date.parse("2026-08-06T10:01:05.000Z")),
    ).toBe("1m 5s");
  });

  it("keeps only the useful tail of terminal output", () => {
    const output = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
    const tail = terminalTail(output);
    expect(tail).not.toContain("line 1\n");
    expect(tail).toContain("line 12");
    expect(tail.split("\n")).toHaveLength(8);
  });
});
