export function projectPreviewProxyPath(projectId: string, token: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/preview/proxy/${encodeURIComponent(token)}/`;
}

export function previewUpstreamUrl(
  previewUrl: string,
  path: string[],
  search: string,
) {
  const target = new URL(
    path.join("/"),
    previewUrl.endsWith("/") ? previewUrl : `${previewUrl}/`,
  );
  target.search = search;
  return target;
}

export function rewritePreviewText(
  content: string,
  contentType: string,
  proxyPath: string,
) {
  if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return rewriteHtml(content, proxyPath);
  }
  if (/javascript|ecmascript|typescript/i.test(contentType)) {
    return rewriteJavaScript(content, proxyPath);
  }
  if (/text\/css/i.test(contentType)) {
    return rewriteCss(content, proxyPath);
  }
  return content;
}

export function isRewritablePreviewContent(contentType: string) {
  return /text\/html|application\/xhtml\+xml|javascript|ecmascript|typescript|text\/css/i.test(
    contentType,
  );
}

function rewriteHtml(html: string, proxyPath: string) {
  const rewrittenAttributes = html
    .replace(
      /(\b(?:src|href|action|poster)\s*=\s*["'])\/(?!\/)/gi,
      `$1${proxyPath}`,
    )
    .replace(/(\bsrcset\s*=\s*["'])([^"']*)(["'])/gi, (_match, open, value, close) =>
      `${open}${String(value).replace(/(^|,\s*)\/(?!\/)/g, `$1${proxyPath}`)}${close}`,
    )
    .replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (_match, open, script, close) =>
      `${open}${rewriteJavaScript(script, proxyPath)}${close}`,
    );
  const base = `<base href="${escapeAttribute(proxyPath)}">`;
  const referrerPolicy = '<meta name="referrer" content="no-referrer">';

  if (/<base\s/i.test(rewrittenAttributes)) {
    const withBase = rewrittenAttributes.replace(/<base\b[^>]*>/i, base);
    return /<meta\b[^>]*name=["']referrer["']/i.test(withBase)
      ? withBase
      : withBase.replace(/<head\b[^>]*>/i, (head) => `${head}${referrerPolicy}`);
  }
  if (/<head\b[^>]*>/i.test(rewrittenAttributes)) {
    return rewrittenAttributes.replace(
      /<head\b[^>]*>/i,
      (head) => `${head}${base}${referrerPolicy}`,
    );
  }
  return `${base}${referrerPolicy}${rewrittenAttributes}`;
}

function rewriteJavaScript(source: string, proxyPath: string) {
  return source.replace(/(["'`])\/(?!\/)/g, `$1${proxyPath}`);
}

function rewriteCss(source: string, proxyPath: string) {
  return source
    .replace(/(url\(\s*["']?)\/(?!\/)/gi, `$1${proxyPath}`)
    .replace(/(@import\s+["'])\/(?!\/)/gi, `$1${proxyPath}`);
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
