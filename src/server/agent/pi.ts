import "server-only";

import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";

import { arkEnv } from "@/lib/env/server";
import { createDaytonaTools } from "@/server/agent/daytona-tools";
import {
  MAX_PROJECT_SESSION_BYTES,
  openPiSession,
  piSessionByteSize,
  rebasePiSession,
} from "@/server/agent/pi-session";
import type {
  AgentRuntime,
  AgentRuntimeEvent,
  AgentTurnInput,
} from "@/server/agent/runtime";
import type { SandboxRuntime } from "@/server/sandbox/runtime";

const PROVIDER_ID = "volcengine-agent-plan";

export class PiAgentRuntime implements AgentRuntime {
  constructor(private readonly sandboxes: SandboxRuntime) {}

  async runTurn(
    input: AgentTurnInput,
    onEvent: (event: AgentRuntimeEvent) => Promise<void> | void,
  ) {
    const env = arkEnv();
    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      allowModelNetwork: false,
    });

    modelRuntime.registerProvider(PROVIDER_ID, {
      name: "Volcengine Agent Plan",
      baseUrl: env.ARK_BASE_URL,
      apiKey: "$ARK_API_KEY",
      authHeader: true,
      api: "openai-completions",
      models: [
        {
          id: env.ARK_MODEL_ID,
          name: env.ARK_MODEL_ID,
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1_048_576,
          maxTokens: 32_768,
          compat: {
            supportsDeveloperRole: false,
            supportsStrictMode: false,
          },
        },
      ],
    });
    await modelRuntime.setRuntimeApiKey(PROVIDER_ID, env.ARK_API_KEY);

    const model = modelRuntime.getModel(PROVIDER_ID, env.ARK_MODEL_ID);
    if (!model) {
      throw new Error(`Pi could not register Ark model ${env.ARK_MODEL_ID}.`);
    }

    const persistedSession = openPiSession(input.workdir, input.sessionData);
    repairInterruptedTools(persistedSession.manager, input.recoveryTools);
    let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;

    let eventPipeline = Promise.resolve();
    let checkpointPipeline = Promise.resolve();
    let assistantTextLength = 0;
    let assistantEmittedText = false;
    let modelError: string | undefined;
    const emit = (event: AgentRuntimeEvent) => {
      eventPipeline = eventPipeline.then(() => onEvent(event));
    };
    const persistCheckpoint = (entry: Parameters<typeof input.onCheckpoint>[0]) => {
      checkpointPipeline = checkpointPipeline.then(() =>
        input.onCheckpoint(entry),
      );
      return checkpointPipeline;
    };
    const checkpoint = () => {
      void persistCheckpoint({
        type: "session",
        sessionData: persistedSession.serialize(),
      });
    };

    let unsubscribe = () => {};
    const abortSession = () => {
      void session?.abort().catch(() => {});
    };

    try {
      const tools = createDaytonaTools(
        this.sandboxes,
        input.workdir,
        input.resolveSandbox,
        {
          started: async (toolCallId, toolName, args) => {
            await persistCheckpoint({
              type: "tool_started",
              sessionData: persistedSession.serialize(),
              toolCallId,
              toolName,
              args,
            });
          },
          finished: async (toolCallId, toolName, result, isError) => {
            await persistCheckpoint({
              type: "tool_finished",
              sessionData: persistedSession.serialize(),
              toolCallId,
              toolName,
              result,
              isError,
            });
          },
        },
      );

      ({ session } = await createAgentSession({
        cwd: input.workdir,
        model,
        modelRuntime,
        thinkingLevel: "medium",
        noTools: "builtin",
        customTools: tools,
        resourceLoader: projectResourceLoader(input.workdir),
        sessionManager: persistedSession.manager,
        settingsManager: SettingsManager.inMemory({
          compaction: {
            enabled: true,
            reserveTokens: 65_536,
            keepRecentTokens: 32_768,
          },
          retry: { enabled: true, maxRetries: 2 },
        }),
      }));

      input.signal.addEventListener("abort", abortSession, { once: true });

      unsubscribe = session.subscribe((event) => {
        if (event.type === "entry_appended") {
          checkpoint();
        }
        if (event.type === "message_start" && event.message.role === "assistant") {
          assistantTextLength = 0;
          assistantEmittedText = false;
        }

        if (
          event.type === "message_update" &&
          event.assistantMessageEvent.type === "text_delta"
        ) {
          assistantEmittedText = true;
          assistantTextLength += event.assistantMessageEvent.delta.length;
          emit({
            type: "text_delta",
            text: event.assistantMessageEvent.delta,
          });
        }

        if (
          event.type === "message_update" &&
          event.assistantMessageEvent.type === "error"
        ) {
          modelError = event.assistantMessageEvent.error.errorMessage;
        }

        if (
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          !assistantEmittedText
        ) {
          const text = event.message.content
            .filter((content) => content.type === "text")
            .map((content) => content.text)
            .join("");
          if (text) {
            assistantTextLength += text.length;
            emit({ type: "text_delta", text });
          }
          modelError ??= event.message.errorMessage;
        }

        if (event.type === "tool_execution_start") {
          // Pi may produce prose before a tool call. That prose is internal work
          // narration, not the agent's user-facing answer.
          if (assistantTextLength > 0) {
            emit({ type: "text_retract", characters: assistantTextLength });
            assistantTextLength = 0;
          }
          emit({
            type: "tool_started",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          });
        }

        if (event.type === "tool_execution_end") {
          emit({
            type: "tool_finished",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            isError: event.isError,
          });
        }
      });

      input.signal.throwIfAborted();
      if (input.resume) {
        await session.sendCustomMessage(
          {
            customType: "project-l-run-recovery",
            content: recoveryPrompt(input.recoveryTools),
            display: false,
          },
          { triggerTurn: true },
        );
      } else {
        await session.prompt(input.prompt, {
          expandPromptTemplates: false,
          source: "rpc",
        });
      }
      await Promise.all([eventPipeline, checkpointPipeline]);
      input.signal.throwIfAborted();
      if (modelError) {
        throw new Error(`Ark model request failed: ${modelError}`);
      }

      let rebased = false;
      if (
        piSessionByteSize(persistedSession.serialize()) >
        MAX_PROJECT_SESSION_BYTES
      ) {
        try {
          await session.compact(
            "Preserve project requirements, decisions, completed work, current file state, unresolved problems, and the user's latest intent.",
          );
          rebasePiSession(persistedSession.manager);
          rebased = true;
        } catch (error) {
          console.warn("Project agent session rebase failed", error);
        }
      }

      const sessionData = persistedSession.serialize();
      await persistCheckpoint({ type: "session", sessionData });
      return { sessionData, rebased };
    } finally {
      unsubscribe();
      input.signal.removeEventListener("abort", abortSession);
      await Promise.allSettled([eventPipeline, checkpointPipeline]);
      session?.dispose();
      persistedSession.close();
    }
  }
}

function repairInterruptedTools(
  manager: ReturnType<typeof openPiSession>["manager"],
  tools: AgentTurnInput["recoveryTools"],
) {
  const recordedResults = new Set(
    manager
      .buildSessionContext()
      .messages.filter((message) => message.role === "toolResult")
      .map((message) => message.toolCallId),
  );

  for (const tool of tools) {
    if (recordedResults.has(tool.toolCallId)) continue;
    const interrupted = tool.status === "started";
    manager.appendMessage({
      role: "toolResult",
      toolCallId: tool.toolCallId,
      toolName: tool.toolName,
      content: [
        {
          type: "text",
          text: interrupted
            ? "Execution was interrupted before its result was recorded. The sandbox may contain partial changes; inspect its current state before deciding whether to retry."
            : serializeToolResult(tool.result),
        },
      ],
      isError: interrupted || tool.status === "failed",
      timestamp: Date.now(),
    });
  }
}

function recoveryPrompt(tools: AgentTurnInput["recoveryTools"]) {
  const interrupted = tools.filter((tool) => tool.status === "started");
  const detail = interrupted.length
    ? ` Interrupted tools: ${interrupted.map((tool) => tool.toolName).join(", ")}.`
    : "";
  return `Resume the interrupted turn from the persisted session.${detail} Inspect the current sandbox before repeating any side effect, continue the user's original request, and give only the final result.`;
}

function serializeToolResult(result: unknown) {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function projectResourceLoader(workdir: string): ResourceLoader {
  return {
    getExtensions: () => ({
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => `You are the single coding agent for one Project L website.

Your only working directory is ${workdir}. Use the provided read, write, edit, and bash tools to inspect and change the real Daytona sandbox.

Treat tools as actions, not as a default response. A user message authorizes tool use only when it contains a concrete request to inspect, create, run, debug, or change the website. Conversation, greetings, acknowledgements, broad ideas, and underspecified requests do not authorize tool use. In those cases, reply briefly or ask one concise question. An empty workspace is never permission to initialize a project by itself.

For an actionable request, build a complete, runnable website. If the directory is empty, initialize the smallest appropriate TypeScript web project with npm before implementing it. Keep the framework's standard dev script; the preview runtime supplies the host and port. Do not start a development or preview server yourself—Project L starts it after your turn. Verify with a production build or another bounded command. Do not claim a change was made unless the corresponding tool completed successfully. Keep the final response concise and describe only real results.

Never narrate upcoming or completed tool calls in assistant prose. Call tools directly and silently. After tool work, give only the result and any decision the user must make, in at most three short sentences. Do not list routine operations such as reading files, installing dependencies, or running the build.`,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}
