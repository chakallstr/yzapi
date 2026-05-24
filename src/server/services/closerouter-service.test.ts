import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";
import { forwardTextEndpoint } from "./closerouter-service.js";

afterEach(() => {
  nock.cleanAll();
});

describe("forwardTextEndpoint", () => {
  it("forwards /responses requests and reads input/output token usage", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/responses", (body) => body.model === "openai/gpt-5.4-mini" && body.stream === false)
      .reply(200, {
        id: "resp_123",
        usage: { input_tokens: 100, output_tokens: 25 },
      });

    const result = await forwardTextEndpoint("responses", {
      model: "openai/gpt-5.4-mini",
      input: "Merhaba",
    });

    expect(result.raw).toMatchObject({ id: "resp_123" });
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 25 });
  });

  it("forwards /messages requests and reads prompt/completion token usage", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/messages", (body) => body.model === "anthropic/claude-haiku-4.5" && body.stream === false)
      .reply(200, {
        id: "msg_123",
        usage: { prompt_tokens: 60, completion_tokens: 15 },
      });

    const result = await forwardTextEndpoint("messages", {
      model: "anthropic/claude-haiku-4.5",
      messages: [{ role: "user", content: "Merhaba" }],
    });

    expect(result.raw).toMatchObject({ id: "msg_123" });
    expect(result.usage).toEqual({ promptTokens: 60, completionTokens: 15 });
  });

  it("throws upstream status and body when CloseRouter returns an error", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/responses")
      .reply(503, {
        error: "provider unavailable",
        code: "provider_unavailable",
      });

    await expect(
      forwardTextEndpoint("responses", {
        model: "openai/gpt-5.4-mini",
        input: "Merhaba",
      }),
    ).rejects.toMatchObject({
      status: 503,
      body: {
        error: "provider unavailable",
        code: "provider_unavailable",
      },
    });
  });
});
