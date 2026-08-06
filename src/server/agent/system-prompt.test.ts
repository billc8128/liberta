import { describe, expect, it } from "vitest";

import { projectSystemPrompt } from "./system-prompt";

describe("projectSystemPrompt", () => {
  it("treats the customer as a creator instead of a developer", () => {
    const prompt = projectSystemPrompt("/workspace/project");

    expect(prompt).toContain("non-technical content creator");
    expect(prompt).toContain("Never ask the creator to open or edit source files");
    expect(prompt).toContain("Never tell the creator how to start the site or preview");
    expect(prompt).toContain("review it in the preview");
  });
});
