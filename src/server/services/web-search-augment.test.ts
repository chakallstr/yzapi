import { describe, it, expect } from "vitest";
import {
  extractLatestUserText,
  isCurrentInfoQuestion,
  shouldSearch,
  buildSearchQuery,
  buildAugmentContent,
  buildAugmentedMessages,
} from "./web-search-augment.js";
import {
  clampSearchNum,
  sanitizeUpstreamResults,
  WEB_SEARCH_DEFAULT_NUM,
  WEB_SEARCH_MAX_NUM,
  type WebSearchResult,
} from "./web-search-service.js";

const FIXED_NOW = new Date("2026-06-01T12:00:00.000Z");

describe("extractLatestUserText", () => {
  it("returns the last user string message", () => {
    const msgs = [
      { role: "system", content: "sen bir asistansın" },
      { role: "user", content: "merhaba" },
      { role: "assistant", content: "selam" },
      { role: "user", content: "Elon Musk kim?" },
    ];
    expect(extractLatestUserText(msgs)).toBe("Elon Musk kim?");
  });

  it("flattens array content (OpenAI vision-style parts)", () => {
    const msgs = [
      { role: "user", content: [{ type: "text", text: "bugün" }, { type: "image_url", image_url: { url: "x" } }, { type: "text", text: "hava nasıl" }] },
    ];
    expect(extractLatestUserText(msgs)).toBe("bugün hava nasıl");
  });

  it("returns empty string when no user message", () => {
    expect(extractLatestUserText([{ role: "system", content: "x" }])).toBe("");
    expect(extractLatestUserText(undefined)).toBe("");
    expect(extractLatestUserText("nope")).toBe("");
  });
});

describe("isCurrentInfoQuestion (auto heuristic)", () => {
  it("detects current/identity/price/year signals", () => {
    expect(isCurrentInfoQuestion("Elon Musk kim?")).toBe(true);
    expect(isCurrentInfoQuestion("güncel dolar kuru ne?")).toBe(true);
    expect(isCurrentInfoQuestion("who is the CEO of OpenAI")).toBe(true);
    expect(isCurrentInfoQuestion("latest Node.js version")).toBe(true);
    expect(isCurrentInfoQuestion("bitcoin fiyatı kaç dolar")).toBe(true);
    expect(isCurrentInfoQuestion("2026 seçim sonuçları")).toBe(true);
    expect(isCurrentInfoQuestion("bugün hava nasıl")).toBe(true);
    expect(isCurrentInfoQuestion("GPT-5.5 ne zaman çıktı")).toBe(true);
  });

  it("ignores generic non-current questions", () => {
    expect(isCurrentInfoQuestion("2 + 2 kaç eder")).toBe(false);
    expect(isCurrentInfoQuestion("bir fonksiyon yaz")).toBe(false);
    expect(isCurrentInfoQuestion("merhaba")).toBe(false);
    expect(isCurrentInfoQuestion("ab")).toBe(false); // < 3 char
  });
});

describe("shouldSearch (mode gating)", () => {
  it("auto → only current questions", () => {
    expect(shouldSearch("Elon Musk kim?", "auto")).toBe(true);
    expect(shouldSearch("bana şiir yaz", "auto")).toBe(false);
  });
  it("always → any non-empty text", () => {
    expect(shouldSearch("bana şiir yaz", "always")).toBe(true);
    expect(shouldSearch("", "always")).toBe(false);
  });
  it("off → never", () => {
    expect(shouldSearch("Elon Musk kim?", "off")).toBe(false);
  });
});

describe("buildSearchQuery", () => {
  it("collapses whitespace", () => {
    expect(buildSearchQuery("  güncel   dolar\n kuru ")).toBe("güncel dolar kuru");
  });
  it("truncates to maxLen", () => {
    const long = "a".repeat(400);
    expect(buildSearchQuery(long, 256).length).toBe(256);
  });
});

describe("buildAugmentContent", () => {
  const results: WebSearchResult[] = [
    { title: "GPT-5.5 - OpenAI", url: "https://openai.com/x", snippet: "GPT-5.5 yayında", position: 1 },
    { title: "Release notes", url: "https://help.openai.com/y", snippet: "Mayıs 2026", position: 2 },
  ];
  it("includes date, citation instruction and all results", () => {
    const content = buildAugmentContent(results, "GPT-5.5 ne zaman çıktı", FIXED_NOW);
    expect(content).toContain("2026-06-01");
    expect(content).toContain("[1]");
    expect(content).toContain("[2]");
    expect(content).toContain("GPT-5.5 - OpenAI");
    expect(content).toContain("https://openai.com/x");
    expect(content).toMatch(/kullanıcının dilinde/i);
  });
  it("handles empty results with honest fallback", () => {
    const content = buildAugmentContent([], "x sorusu", FIXED_NOW);
    expect(content).toContain("sonuç bulunamadı");
    expect(content).toContain("uydurma yapma");
  });
});

describe("buildAugmentedMessages", () => {
  it("inserts a system message immediately before the last user message and does not mutate input", () => {
    const original = [
      { role: "system", content: "sys" },
      { role: "user", content: "Elon kim?" },
    ];
    const snapshot = JSON.stringify(original);
    const results: WebSearchResult[] = [{ title: "t", url: "u", snippet: "s", position: 1 }];
    const out = buildAugmentedMessages(original, results, "Elon kim?", FIXED_NOW);
    expect(out).toHaveLength(3);
    expect((out[1] as any).role).toBe("system"); // augment inserted before last user
    expect((out[2] as any).role).toBe("user");
    expect(JSON.stringify(original)).toBe(snapshot); // immutability
  });

  it("appends when there is no user message", () => {
    const out = buildAugmentedMessages([{ role: "system", content: "x" }], [], "q", FIXED_NOW);
    expect(out).toHaveLength(2);
    expect((out[1] as any).role).toBe("system");
  });
});

describe("clampSearchNum", () => {
  it("defaults on invalid", () => {
    expect(clampSearchNum(undefined)).toBe(WEB_SEARCH_DEFAULT_NUM);
    expect(clampSearchNum(0)).toBe(WEB_SEARCH_DEFAULT_NUM);
    expect(clampSearchNum(-3)).toBe(WEB_SEARCH_DEFAULT_NUM);
    expect(clampSearchNum("abc")).toBe(WEB_SEARCH_DEFAULT_NUM);
  });
  it("caps at MAX and floors", () => {
    expect(clampSearchNum(99)).toBe(WEB_SEARCH_MAX_NUM);
    expect(clampSearchNum("3")).toBe(3);
    expect(clampSearchNum(3.9)).toBe(3);
  });
});

describe("sanitizeUpstreamResults (no-leak)", () => {
  it("keeps only title/url/snippet/position, drops serper_key_id and internal fields", () => {
    const raw = {
      results: [
        { title: "T1", link: "https://a.com", snippet: "s1", position: 1, internal: "x" },
        { title: "T2", url: "https://b.com", snippet: "s2" },
      ],
      serper_key_id: "019e7e33-SECRET",
      web_search_id: "58ea-INTERNAL",
    };
    const out = sanitizeUpstreamResults(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: "T1", url: "https://a.com", snippet: "s1", position: 1 });
    expect(out[1]).toEqual({ title: "T2", url: "https://b.com", snippet: "s2", position: 2 });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("serper_key_id");
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("web_search_id");
    expect(serialized).not.toContain("internal");
  });

  it("returns empty array for malformed input", () => {
    expect(sanitizeUpstreamResults({})).toEqual([]);
    expect(sanitizeUpstreamResults(null)).toEqual([]);
    expect(sanitizeUpstreamResults({ results: "x" })).toEqual([]);
  });
});
