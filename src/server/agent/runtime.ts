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
  sandboxId: string;
  workdir: string;
  prompt: string;
  sessionData?: string;
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
