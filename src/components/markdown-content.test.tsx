import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./markdown-content";

describe("MarkdownContent", () => {
  it("renders common Markdown and GFM", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent content={"**Done**\n\n- one\n- two\n\n`src/App.tsx`\n\n~~old~~"} />,
    );

    expect(html).toContain("<strong>Done</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<code>src/App.tsx</code>");
    expect(html).toContain("<del>old</del>");
  });

  it("does not render raw HTML", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent content={'<script>alert("no")</script>'} />,
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
