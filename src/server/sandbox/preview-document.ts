export function addPreviewBase(html: string, previewUrl: string) {
  const baseUrl = new URL("/", previewUrl).toString();
  const base = `<base href="${escapeAttribute(baseUrl)}">`;

  if (/<base\s/i.test(html)) {
    return html.replace(/<base\b[^>]*>/i, base);
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}${base}`);
  }
  return `${base}${html}`;
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
