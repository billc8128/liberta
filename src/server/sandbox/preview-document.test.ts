import { describe, expect, it } from "vitest";

import { addPreviewBase } from "./preview-document";

describe("addPreviewBase", () => {
  it("adds the Daytona origin to relative assets", () => {
    expect(
      addPreviewBase(
        '<html><head><script src="/src/main.tsx"></script></head></html>',
        "https://3000-token.daytonaproxy.net/",
      ),
    ).toContain('<head><base href="https://3000-token.daytonaproxy.net/">');
  });

  it("replaces a generated base element", () => {
    expect(
      addPreviewBase(
        '<head><base href="/old/"></head>',
        "https://3000-token.daytonaproxy.net/",
      ),
    ).toBe(
      '<head><base href="https://3000-token.daytonaproxy.net/"></head>',
    );
  });
});
