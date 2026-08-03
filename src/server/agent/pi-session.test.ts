import { describe, expect, it } from "vitest";

import {
  openPiSession,
  piSessionByteSize,
  rebasePiSession,
} from "./pi-session";

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

  it("rebases compacted history into a smaller standalone session", () => {
    const session = openPiSession("/workspace/project");
    for (let index = 0; index < 20; index += 1) {
      session.manager.appendCustomMessageEntry(
        "old-turn",
        `Old context ${index}: ${"x".repeat(2_000)}`,
        false,
      );
    }
    const firstKeptEntryId = session.manager.appendCustomMessageEntry(
      "current-turn",
      "The current site uses coral and must keep the checkout page.",
      false,
    );
    session.manager.appendCompaction(
      "The user chose coral and the checkout page is complete.",
      firstKeptEntryId,
      50_000,
    );

    const before = piSessionByteSize(session.serialize());
    rebasePiSession(session.manager);
    const after = piSessionByteSize(session.serialize());
    const context = session.manager.buildSessionContext().messages;

    expect(after).toBeLessThan(before / 4);
    expect(JSON.stringify(context)).toContain("checkout page");
    expect(JSON.stringify(context)).toContain("Earlier project context");
    session.close();
  });
});
