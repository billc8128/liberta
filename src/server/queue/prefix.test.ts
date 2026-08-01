import { describe, expect, it } from "vitest";

import { bullmqPrefix } from "./prefix";

describe("bullmqPrefix", () => {
  it("lets BullMQ add its own separator to an AnyHost Redis prefix", () => {
    expect(bullmqPrefix("project:dev:")).toBe("project:dev");
  });
});
