import { describe, expect, it } from "vitest";

import { isSubmitKey } from "./submit-on-enter";

describe("isSubmitKey", () => {
  it("submits on Enter", () => {
    expect(isSubmitKey({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  });

  it("keeps Shift+Enter and IME composition in the textarea", () => {
    expect(isSubmitKey({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
    expect(isSubmitKey({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  });
});
