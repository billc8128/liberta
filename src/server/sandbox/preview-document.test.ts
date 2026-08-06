import { describe, expect, it } from "vitest";

import {
  projectPreviewProxyPath,
  rewritePreviewText,
} from "./preview-document";

describe("preview response rewriting", () => {
  const proxy = "/api/projects/project-1/preview/proxy/";

  it("keeps every HTML asset inside the authenticated proxy", () => {
    const html = rewritePreviewText(
      '<html><head><link href="/src/app.css"><script src="/src/main.tsx"></script></head><body><img src="/hero.jpg" srcset="/hero.jpg 1x, /hero@2x.jpg 2x"></body></html>',
      "text/html; charset=utf-8",
      proxy,
    );

    expect(html).toContain(`<base href="${proxy}">`);
    expect(html).toContain(`href="${proxy}src/app.css"`);
    expect(html).toContain(`src="${proxy}src/main.tsx"`);
    expect(html).toContain(`src="${proxy}hero.jpg"`);
    expect(html).toContain(
      `srcset="${proxy}hero.jpg 1x, ${proxy}hero@2x.jpg 2x"`,
    );
  });

  it("rewrites Vite module imports and browser requests", () => {
    const source = rewritePreviewText(
      'import App from "/src/App.tsx"; fetch("/api/profile");',
      "application/javascript",
      proxy,
    );

    expect(source).toContain(`"${proxy}src/App.tsx"`);
    expect(source).toContain(`"${proxy}api/profile"`);
  });

  it("rewrites root-relative CSS resources", () => {
    expect(
      rewritePreviewText(
        'body{background:url("/images/bg.png")}',
        "text/css",
        proxy,
      ),
    ).toContain(`url("${proxy}images/bg.png")`);
  });

  it("builds a stable same-origin proxy path", () => {
    expect(projectPreviewProxyPath("project id")).toBe(
      "/api/projects/project%20id/preview/proxy/",
    );
  });
});
