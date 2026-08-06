const TECHNICAL_INSTRUCTION =
  /(?:\b(?:npm|pnpm|yarn|npx|bun)\s|\b(?:src|app|public|components?|pages?)\/[^\s`]+|\b[\w.-]+\.(?:tsx?|jsx?|css|json)\b|\b(?:localhost|0\.0\.0\.0|dev server|development server)\b|(?:打开|编辑|修改).{0,20}(?:文件|配置区|源码|代码)|(?:启动方式|开发服务器|预览环境).{0,30}(?:运行|启动|命令))/i;

export function creatorFacingResponse(content: string, previewReady: boolean) {
  const usesChinese = /[\u3400-\u9fff]/.test(content);
  let inCodeBlock = false;
  const visibleLines: string[] = [];

  for (const line of content.trim().split("\n")) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const visible = line
      .split(/(?<=[。！？!?])/)
      .filter((sentence) => !TECHNICAL_INSTRUCTION.test(sentence))
      .join("")
      .trimEnd();
    if (visible.trim()) visibleLines.push(visible);
  }

  let result = visibleLines.join("\n").trim();
  if (!result) {
    result = usesChinese
      ? previewReady
        ? "网站已经准备好了。"
        : "告诉我你希望网站呈现什么内容和感觉。"
      : previewReady
        ? "Your site is ready."
        : "Tell me what you want the site to say and feel like.";
  }

  if (previewReady && !/(?:右侧|预览|preview)/i.test(result)) {
    result += usesChinese
      ? "\n\n你可以直接在右侧预览，需要调整时告诉我想改哪里。"
      : "\n\nReview it in the preview, then tell me what you want to change.";
  }
  return result;
}
