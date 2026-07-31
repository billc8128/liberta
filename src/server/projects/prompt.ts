interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export function projectNameFromPrompt(prompt: string) {
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    throw new Error("A project prompt cannot be empty.");
  }

  return firstLine.length > 56
    ? `${firstLine.slice(0, 53).trimEnd()}…`
    : firstLine;
}

export function promptWithConversation(conversation: ConversationMessage[]) {
  if (conversation.length === 0) {
    throw new Error("A project conversation cannot be empty.");
  }

  if (conversation.length === 1) {
    return conversation[0].content;
  }

  const transcript = conversation
    .slice(-12)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  return `Continue the existing project using this conversation context:\n\n${transcript}`;
}
