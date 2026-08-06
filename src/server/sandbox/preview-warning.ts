interface PreviewWarningConfig {
  apiUrl: string;
  apiKey: string;
  organizationId: string;
}

type PreviewWarningFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export async function disableDaytonaPreviewWarning(
  config: PreviewWarningConfig,
  fetcher: PreviewWarningFetch = fetch,
) {
  const response = await fetcher(
    `${config.apiUrl}/organizations/${encodeURIComponent(config.organizationId)}/preview-warning`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ previewWarningEnabled: false }),
    },
  );

  if (!response.ok) {
    throw new Error(`Daytona preview warning configuration failed (${response.status}).`);
  }
}
