import type { ProjectSandbox } from "@/server/sandbox/runtime";

export type AgentRuntimeEvent =
  | { type: "text_delta"; text: string }
  | { type: "text_retract"; characters: number }
  | {
      type: "tool_started";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_output";
      toolCallId: string;
      toolName: string;
      output: string;
    }
  | {
      type: "tool_finished";
      toolCallId: string;
      toolName: string;
      isError: boolean;
    }
  | {
      type: "progress";
      id: string;
      label: string;
      status: "started" | "completed" | "failed";
      detail?: string;
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
  | { type: "entry"; entry: Record<string, unknown> }
  | { type: "snapshot"; sessionData: string; rebased?: boolean }
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
