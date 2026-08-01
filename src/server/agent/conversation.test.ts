import { describe, expect, it } from "vitest";

import { simpleGreetingReply } from "./conversation";

describe("simpleGreetingReply", () => {
  it("answers a bare English greeting without starting a build", () => {
    expect(simpleGreetingReply("Hi! ")).toContain("What would you like to build?");
  });

  it("answers a bare Chinese greeting in Chinese", () => {
    expect(simpleGreetingReply("你好")).toContain("你想做一个什么网站");
  });

  it("does not intercept an actionable request", () => {
    expect(simpleGreetingReply("Hi, build a portfolio for me")).toBeUndefined();
  });
});
