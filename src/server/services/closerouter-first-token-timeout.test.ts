/**
 * Regresyon: streaming akışta upstream header döndürür ama HİÇ veri akıtmazsa
 * (Roo/Cline "API request"te asılı kalma şikâyeti) istemci idleMs (canlı 5 dk)
 * kadar beklemesin — ilk-token bütçesinde temiz kapanmalı ve müşteriden ücret
 * ALINMAMALI (usage {0,0}). Bütçe AttemptOptions.firstTokenMs ile override edilir;
 * test küçük bir gerçek-zaman bütçesi kullanır (fake timer + web stream kırılganlığı yok).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardChatStream, FIRST_TOKEN_TIMEOUT_MS } from "./closerouter-service.js";
import type { ProviderContext } from "./provider-config-service.js";

function ctx(): ProviderContext {
  return {
    profileId: null,
    baseUrl: "https://upstream.example/v1",
    apiKey: "test_key",
    modelMap: {},
    source: { baseUrl: "active_profile", apiKey: "active_profile" },
  };
}

function mockRes() {
  const writes: string[] = [];
  const state = { ended: false };
  const res = {
    headersSent: false,
    setHeader() {},
    flushHeaders() { res.headersSent = true; },
    write(chunk: string) { writes.push(String(chunk)); return true; },
    end() { state.ended = true; },
    req: { on() {} },
  };
  return { res, writes, state };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forwardChatStream ilk-token timeout", () => {
  it("FIRST_TOKEN_TIMEOUT_MS makul bir değerdir (≤ 60sn, > 0)", () => {
    expect(FIRST_TOKEN_TIMEOUT_MS).toBeGreaterThan(0);
    expect(FIRST_TOKEN_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it("upstream header döner ama veri akıtmazsa: ilk-token bütçesinde 0-ücretle kapatır", async () => {
    // 200 + text/event-stream header döner ama gövde ASLA chunk akıtmaz (susan upstream).
    const hangingBody = new ReadableStream<Uint8Array>({ start() { /* asla enqueue/close */ } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(hangingBody, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    );

    const { res, writes, state } = mockRes();
    const usage = await forwardChatStream(
      { model: "gpt-5.5", messages: [{ role: "user", content: "selam" }], stream: true },
      res as never,
      ctx(),
      { firstTokenMs: 50 }, // küçük bütçe → gerçek zamanlı ~50ms'de tetiklenir
    );

    // Ücret YOK (upstream hiç token üretmedi). noCharge bayrağı proxy'de
    // status:"error"a (0 tahsil + iade) çevrilir — bu bayrak set EDİLMELİ.
    expect(usage.promptTokens).toBe(0);
    expect(usage.completionTokens).toBe(0);
    expect(usage.noCharge).toBe(true);

    // İstemciye temiz hata olayı + [DONE] yazıldı ve stream kapandı.
    const body = writes.join("");
    expect(body).toContain("upstream_timeout");
    expect(body).toContain("[DONE]");
    expect(state.ended).toBe(true);
  });

  it("upstream 200 döner ama veri akmadan temiz kapanırsa: yine 0-ücret (noCharge)", async () => {
    // Gövde anında close → hiç 'data' eventi yok → 'end' firstChunkSeen=false ile gelir.
    const emptyBody = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(emptyBody, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    );

    const { res, state } = mockRes();
    const usage = await forwardChatStream(
      { model: "gpt-5.5", messages: [{ role: "user", content: "selam" }], stream: true },
      res as never,
      ctx(),
    );

    expect(usage.promptTokens).toBe(0);
    expect(usage.completionTokens).toBe(0);
    expect(usage.noCharge).toBe(true);
    expect(state.ended).toBe(true);
  });
});
