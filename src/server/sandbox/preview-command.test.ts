import { describe, expect, it } from "vitest";

import { previewCommand } from "./preview-command";

describe("previewCommand", () => {
  it("uses framework-specific flags only for known dev servers", () => {
    const command = previewCommand(3000);

    expect(command).toContain("next dev --hostname 0.0.0.0 --port 3000");
    expect(command).toContain("vite --host 0.0.0.0 --port 3000");
  });

  it("does not append Vite flags to an arbitrary npm dev script", () => {
    const command = previewCommand(3000);

    expect(command).toContain("export HOST=0.0.0.0 PORT=3000; exec npm run dev;");
    expect(command).not.toContain("npm run dev -- --host");
  });
});
