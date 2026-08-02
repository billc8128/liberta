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
  resolveSandbox: () => Promise<ProjectSandbox>;
}

export interface AgentTurnResult {
  sessionData: string;
}

export interface AgentRuntime {
  runTurn(
    input: AgentTurnInput,
    onEvent: (event: AgentRuntimeEvent) => Promise<void> | void,
  ): Promise<AgentTurnResult>;
}
