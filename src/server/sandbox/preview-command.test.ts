import { describe, expect, it } from "vitest";

import {
  previewCommand,
  runnableWebsiteCheckCommand,
} from "./preview-command";

describe("previewCommand", () => {
  it("uses framework-specific flags only for known dev servers", () => {
    const command = previewCommand(3000);

    expect(command).toContain("next dev --hostname 0.0.0.0 --port 3000");
    expect(command).toContain("createServer");
    expect(command).toContain("port: 3000");
    expect(command).toContain("hmr: false");
  });

  it("does not append Vite flags to an arbitrary npm dev script", () => {
    const command = previewCommand(3000);

    expect(command).toContain("export HOST=0.0.0.0 PORT=3000; exec npm run dev;");
    expect(command).not.toContain("npm run dev -- --host");
  });

  it("serves a native static site without requiring package.json", () => {
    const command = previewCommand(3000);

    expect(command).toContain(
      "python3 -m http.server 3000 --bind 0.0.0.0",
    );
    expect(runnableWebsiteCheckCommand()).toBe(
      "test -f package.json || test -f index.html",
    );
  });
});
