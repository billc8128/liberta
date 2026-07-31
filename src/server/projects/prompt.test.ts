import { describe, expect, it } from "vitest";

import {
  projectNameFromPrompt,
  promptWithConversation,
} from "./prompt";

describe("projectNameFromPrompt", () => {
  it("uses the first non-empty line", () => {
    expect(projectNameFromPrompt("\n  A quiet architecture portfolio\nMore")).toBe(
      "A quiet architecture portfolio",
    );
  });

  it("keeps database names compact", () => {
    const name = projectNameFromPrompt("A".repeat(80));
    expect(name).toHaveLength(54);
    expect(name.endsWith("…")).toBe(true);
  });
});

describe("promptWithConversation", () => {
  it("does not wrap the first user prompt", () => {
    expect(
      promptWithConversation([{ role: "user", content: "Build a journal" }]),
    ).toBe("Build a journal");
  });

  it("includes recent turns for a continued Pi session", () => {
    const prompt = promptWithConversation([
      { role: "user", content: "Build a journal" },
      { role: "assistant", content: "The journal is running." },
      { role: "user", content: "Make the type warmer." },
    ]);

    expect(prompt).toContain("ASSISTANT: The journal is running.");
    expect(prompt).toContain("USER: Make the type warmer.");
  });
});
