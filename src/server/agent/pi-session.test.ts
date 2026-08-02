import { describe, expect, it } from "vitest";

import { openPiSession } from "./pi-session";

describe("openPiSession", () => {
  it("serializes and restores the Pi conversation", () => {
    const first = openPiSession("/workspace/project");
    first.manager.appendCustomMessageEntry(
      "test-user-message",
      "Remember coral as the accent color.",
      false,
    );
    first.manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "I will remember coral." }],
      api: "openai-completions",
      provider: "test",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    const data = first.serialize();
    first.close();

    const restored = openPiSession("/workspace/project", data);
    const context = restored.manager.buildSessionContext();

    expect(context.messages).toHaveLength(2);
    expect(context.messages[0]).toMatchObject({
      role: "custom",
      content: "Remember coral as the accent color.",
    });
    restored.close();
  });
});
