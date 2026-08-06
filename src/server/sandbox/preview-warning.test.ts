import { describe, expect, it, vi } from "vitest";

import { disableDaytonaPreviewWarning } from "./preview-warning";

describe("disableDaytonaPreviewWarning", () => {
  it("disables the warning for the sandbox organization", async () => {
    const fetcher = vi
      .fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await disableDaytonaPreviewWarning(
      {
        apiUrl: "https://app.daytona.io/api",
        apiKey: "secret",
        organizationId: "org/example",
      },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://app.daytona.io/api/organizations/org%2Fexample/preview-warning",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ previewWarningEnabled: false }),
      }),
    );
    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.headers).toEqual(
      expect.objectContaining({ authorization: "Bearer secret" }),
    );
  });

  it("surfaces unsupported organization settings", async () => {
    const fetcher = vi
      .fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 403 }));

    await expect(
      disableDaytonaPreviewWarning(
        {
          apiUrl: "https://app.daytona.io/api",
          apiKey: "secret",
          organizationId: "org",
        },
        fetcher,
      ),
    ).rejects.toThrow("Daytona preview warning configuration failed (403).");
  });
});
