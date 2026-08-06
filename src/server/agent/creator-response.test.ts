import { describe, expect, it } from "vitest";

import { creatorFacingResponse } from "../../lib/projects/creator-response";

describe("creatorFacingResponse", () => {
  it("removes developer instructions while preserving the visible result", () => {
    const response = creatorFacingResponse(
      "主页已经完成。打开 `src/App.tsx` 修改头像。\n\n启动方式：运行 `npm run dev`。",
      true,
    );

    expect(response).toContain("主页已经完成。");
    expect(response).toContain("右侧预览");
    expect(response).not.toContain("src/App.tsx");
    expect(response).not.toContain("npm run dev");
  });

  it("removes code blocks from creator-facing replies", () => {
    const response = creatorFacingResponse(
      "The new gallery is ready.\n\n```tsx\nexport default function App() {}\n```",
      true,
    );

    expect(response).toContain("The new gallery is ready.");
    expect(response).toContain("Review it in the preview");
    expect(response).not.toContain("export default");
  });
});
