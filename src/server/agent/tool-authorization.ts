import "server-only";

import { arkEnv } from "@/lib/env/server";

interface AuthorizationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  status?: "pending" | "streaming" | "completed" | "failed";
}

export async function authorizeCodingTools(
  conversation: AuthorizationMessage[],
) {
  const env = arkEnv();
  const relevantConversation = conversation
    .filter((message) => message.status !== "failed")
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const response = await fetch(
    `${env.ARK_BASE_URL.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.ARK_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.ARK_MODEL_ID,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: "system",
            content: `Decide whether the latest user message authorizes coding tools.

Return exactly ALLOW or DENY.

ALLOW only when the conversation establishes a concrete website/project target and the latest user message explicitly requests or clearly approves creating, inspecting, changing, running, debugging, or evaluating it.
DENY greetings, thanks, casual conversation, product discussion, broad ideas, acknowledgements without a concrete prior proposal, and underspecified requests.
Do not infer permission merely because this conversation occurs inside a site-building product.`,
          },
          { role: "user", content: relevantConversation },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Tool authorization failed with status ${response.status}.`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return result.choices?.[0]?.message?.content?.trim().toUpperCase() === "ALLOW";
}
