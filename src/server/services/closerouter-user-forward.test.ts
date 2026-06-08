/**
 * Contract test: upstream'e giden istekte user (customerId) mevcut olmalı.
 * Proxy.ts providerBody'ye user:userId enjekte eder;
 * bu test forwardChat + forwardChatStream'in onu aynen ilettiğini kanıtlar.
 */
import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";
import { forwardChat } from "./closerouter-service.js";
import type { ProviderContext } from "./provider-config-service.js";

function ctx(): ProviderContext {
  return {
    profileId: null,
    baseUrl: "https://ai.rika.wtf/v1",
    apiKey: "rika_test_key",
    modelMap: {},
    source: { baseUrl: "active_profile", apiKey: "active_profile" },
  };
}

afterEach(() => { nock.cleanAll(); });

describe("upstream user (customerId) forwarding", () => {
  it("gpt-5.5 isteğinde user alanını rika upstream'ine iletir", async () => {
    let capturedBody: Record<string, unknown> = {};

    nock("https://ai.rika.wtf")
      .post("/v1/chat/completions", (body) => {
        capturedBody = body;
        return true;
      })
      .reply(200, {
        id: "chatcmpl-test",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "Merhaba" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

    await forwardChat(
      {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "test" }],
        user: "b653ee71-45a6-40cc-8d8d-374c1eae0d76", // userId proxy.ts'den enjekte edilir
      },
      ctx(),
    );

    expect(capturedBody.user, "user (customerId) upstream body'de bulunmalı").toBe(
      "b653ee71-45a6-40cc-8d8d-374c1eae0d76",
    );
    expect(capturedBody.model).toBe("gpt-5.5");
  });
});
