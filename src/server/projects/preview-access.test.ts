import { describe, expect, it } from "vitest";

import { createPreviewAccess, verifyPreviewAccess } from "./preview-access";

describe("preview access", () => {
  const secret = "a-secure-test-secret-that-is-long-enough";

  it("creates access scoped to one project and user", () => {
    const token = createPreviewAccess("project-1", "user-1", secret, 1_000);

    expect(verifyPreviewAccess(token, "project-1", secret, 2_000)).toMatchObject({
      projectId: "project-1",
      userId: "user-1",
    });
    expect(verifyPreviewAccess(token, "project-2", secret, 2_000)).toBeUndefined();
  });

  it("rejects modified and expired access", () => {
    const token = createPreviewAccess("project-1", "user-1", secret, 1_000);

    expect(
      verifyPreviewAccess(`${token}changed`, "project-1", secret, 2_000),
    ).toBeUndefined();
    expect(
      verifyPreviewAccess(token, "project-1", secret, 3_601_001),
    ).toBeUndefined();
  });
});
