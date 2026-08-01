const SIMPLE_GREETINGS = new Set([
  "hi",
  "hello",
  "hey",
  "你好",
  "嗨",
  "哈喽",
  "哈啰",
]);

export function simpleGreetingReply(prompt: string) {
  const normalized = prompt
    .trim()
    .toLocaleLowerCase()
    .replace(/[!！?？.,，。]+$/g, "")
    .trim();

  if (!SIMPLE_GREETINGS.has(normalized)) return;

  if (/\p{Script=Han}/u.test(normalized)) {
    return "你好！你想做一个什么网站？告诉我它的用途、主要内容和喜欢的风格就可以。";
  }

  return "Hi! What would you like to build? Tell me the site's purpose, main content, and preferred visual style.";
}
