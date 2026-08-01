import "server-only";

import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";

import { arkEnv } from "@/lib/env/server";
import { createDaytonaTools } from "@/server/agent/daytona-tools";
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
    const sandbox = await this.sandboxes.ensureRunning(input.sandboxId);
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
          reasoning: false,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 32_000,
        },
      ],
    });
    await modelRuntime.setRuntimeApiKey(PROVIDER_ID, env.ARK_API_KEY);

    const model = modelRuntime.getModel(PROVIDER_ID, env.ARK_MODEL_ID);
    if (!model) {
      throw new Error(`Pi could not register Ark model ${env.ARK_MODEL_ID}.`);
    }

    const { session } = await createAgentSession({
      cwd: input.workdir,
      model,
      modelRuntime,
      thinkingLevel: "off",
      noTools: "builtin",
      customTools: createDaytonaTools(sandbox, input.workdir),
      resourceLoader: projectResourceLoader(input.workdir),
      sessionManager: SessionManager.inMemory(input.workdir),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: true },
        retry: { enabled: true, maxRetries: 2 },
      }),
    });

    let eventPipeline = Promise.resolve();
    let emittedText = false;
    let modelError: string | undefined;
    const emit = (event: AgentRuntimeEvent) => {
      eventPipeline = eventPipeline.then(() => onEvent(event));
    };

    const unsubscribe = session.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        emittedText = true;
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
        !emittedText
      ) {
        const text = event.message.content
          .filter((content) => content.type === "text")
          .map((content) => content.text)
          .join("");
        if (text) emit({ type: "text_delta", text });
        modelError ??= event.message.errorMessage;
      }

      if (event.type === "tool_execution_start") {
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

    try {
      await session.prompt(input.prompt, {
        expandPromptTemplates: false,
        source: "rpc",
      });
      await eventPipeline;
      if (modelError) {
        throw new Error(`Ark model request failed: ${modelError}`);
      }
    } finally {
      unsubscribe();
      session.dispose();
    }
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
    getSystemPrompt: () => `You are the coding agent for one Project L website.

Your only working directory is ${workdir}. Use the provided read, write, edit, and bash tools to inspect and change the real Daytona sandbox.

Follow the latest user message. Before using a tool, decide whether it contains a concrete website request or an actionable change to the existing site. If it is a greeting, casual conversation, or too vague to implement, do not use any tools and ask one concise clarifying question instead. Never invent a website brief from an ambiguous message.

For an actionable request, build a complete, runnable website. If the directory is empty, initialize the smallest appropriate TypeScript web project with npm before implementing it. Keep the framework's standard dev script; the preview runtime supplies the host and port. Never run a long-lived development server in the foreground while verifying—use a production build or a bounded command instead. Verify your work with the project's own checks. Do not claim a change was made unless the corresponding tool completed successfully. Keep the final response concise and describe only real results.`,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}
