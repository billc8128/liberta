import { describe, expect, it } from "vitest";

import { postgresJsUrl } from "./url";

describe("postgresJsUrl", () => {
  it("removes the libpq-only sslrootcert parameter", () => {
    expect(
      postgresJsUrl(
        "postgres://user:secret@example.com/app?sslmode=require&sslrootcert=system",
      ),
    ).toBe("postgres://user:secret@example.com/app?sslmode=require");
  });
});
