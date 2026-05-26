import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin panel protected request guard", () => {
  it("does not call protected admin endpoints with raw fetch", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const forbidden = source
      .split("\n")
      .map((line, index) => ({ line: index + 1, text: line.trim() }))
      .filter(({ text }) => /fetch\((["'`])\/api\/admin\//.test(text))
      .filter(({ text }) => !text.includes("/api/admin/login"));

    expect(forbidden).toEqual([]);
  });
});
