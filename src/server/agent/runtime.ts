import type { ProjectSandbox } from "@/server/sandbox/runtime";

export type AgentRuntimeEvent =
  | { type: "text_delta"; text: string }
  | { type: "text_retract"; characters: number }
  | { type: "tool_started"; toolCallId: string; toolName: string }
  | {
      type: "tool_finished";
      toolCallId: string;
      toolName: string;
      isError: boolean;
    };

export interface AgentTurnInput {
  workdir: string;
  prompt: string;
  sessionData?: string;
  resume: boolean;
  recoveryTools: Array<{
    toolCallId: string;
    toolName: string;
    status: "started" | "completed" | "failed";
    result: unknown;
  }>;
  signal: AbortSignal;
  resolveSandbox: () => Promise<ProjectSandbox>;
  onCheckpoint: (checkpoint: AgentCheckpoint) => Promise<void>;
}

export interface AgentTurnResult {
  sessionData: string;
  rebased: boolean;
}

export type AgentCheckpoint =
  | { type: "session"; sessionData: string }
  | {
      type: "tool_started";
      sessionData: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_finished";
      sessionData: string;
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    };

export interface AgentRuntime {
  runTurn(
    input: AgentTurnInput,
    onEvent: (event: AgentRuntimeEvent) => Promise<void> | void,
  ): Promise<AgentTurnResult>;
}
