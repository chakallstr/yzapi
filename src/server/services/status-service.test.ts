import { describe, expect, it } from "vitest";
import { deriveStatus } from "./status-service.js";

describe("deriveStatus", () => {
  it("returns ok when DB is ok even if upstream is unknown", () => {
    expect(deriveStatus({ api: "ok", db: "ok", aiProvider: "unknown" })).toBe("ok");
  });

  it("returns degraded when DB fails", () => {
    expect(deriveStatus({ api: "ok", db: "fail", aiProvider: "ok" })).toBe("degraded");
  });
});
