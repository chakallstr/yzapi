import { describe, expect, it } from "vitest";
import { getInitialAppTab } from "./navigation";

describe("getInitialAppTab", () => {
  it.each([
    ["/", "", "", "homepage"],
    ["/models", "", "", "models"],
    ["/modeller", "", "", "models"],
    ["/sss", "", "", "sss"],
    ["/faq", "", "", "sss"],
    ["/api", "", "", "api"],
    ["/docs", "", "", "api"],
    ["/admin", "", "", "admin"],
    ["/", "?tab=admin", "", "admin"],
    ["/", "", "#models", "models"],
  ] as const)("maps %s %s %s to %s", (pathname, search, hash, expected) => {
    expect(getInitialAppTab(pathname, search, hash)).toBe(expected);
  });
});
