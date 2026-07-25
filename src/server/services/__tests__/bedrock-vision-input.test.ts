// Bedrock görsel (vision) girdi çevirisi — birim testleri.
//
// NEDEN: Sonnet 4.6 "sınırsız" paketleri Bedrock inference-profile lane'ine düşüyor.
// Bedrock invoke gövdesi Anthropic şeklindedir; OpenAI-şekilli istemciler görseli
// {type:"image_url"} ile yollar. Çeviri olmadan aynı istek koltuk lane'inde çalışıp
// sınırsız pakette ValidationException alıyordu.
import { describe, expect, it } from "vitest";
import {
  bedrockContentFromRequest,
  bedrockMessagesFromRequest,
} from "../closerouter-service.js";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUg";

describe("bedrockContentFromRequest — OpenAI görsel part → Anthropic image bloğu", () => {
  it("data URL'i base64 image bloğuna çevirir, metin part'ına dokunmaz", () => {
    const content = [
      { type: "text", text: "bu resimde ne var?" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG_B64}` } },
    ];

    expect(bedrockContentFromRequest(content)).toEqual([
      { type: "text", text: "bu resimde ne var?" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_B64 } },
    ]);
  });

  it("image_url string biçimini de kabul eder ve media_type'ı küçültür", () => {
    const out = bedrockContentFromRequest([
      { type: "image_url", image_url: `data:IMAGE/JPEG;base64,${PNG_B64}` },
    ]) as Array<Record<string, unknown>>;

    expect(out[0].source).toEqual({ type: "base64", media_type: "image/jpeg", data: PNG_B64 });
  });

  it("Responses şeklindeki input_image part'ını da çevirir", () => {
    const out = bedrockContentFromRequest([
      { type: "input_image", image_url: `data:image/webp;base64,${PNG_B64}` },
    ]) as Array<Record<string, unknown>>;

    expect(out[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/webp", data: PNG_B64 },
    });
  });

  it("uzak http(s) URL'i Anthropic url kaynağına çevirir", () => {
    const out = bedrockContentFromRequest([
      { type: "image_url", image_url: { url: "https://example.test/a.png" } },
    ]) as Array<Record<string, unknown>>;

    expect(out[0]).toEqual({ type: "image", source: { type: "url", url: "https://example.test/a.png" } });
  });

  it("görsel olmayan MIME (pdf) ve bozuk part'a DOKUNMAZ", () => {
    const content = [
      { type: "image_url", image_url: { url: `data:application/pdf;base64,${PNG_B64}` } },
      { type: "image_url" },
      { type: "image_url", image_url: { url: "ftp://nope/a.png" } },
    ];

    expect(bedrockContentFromRequest(content)).toBe(content);
  });

  it("Anthropic-native içeriği aynı referansla döndürür (bit-bit korunur)", () => {
    const native = [
      { type: "text", text: "bak" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_B64 } },
    ];

    expect(bedrockContentFromRequest(native)).toBe(native);
    expect(bedrockContentFromRequest("düz metin")).toBe("düz metin");
  });
});

describe("bedrockMessagesFromRequest — görsel mesaj yolları", () => {
  it("user mesajındaki OpenAI görselini çevirir", () => {
    const out = bedrockMessagesFromRequest(
      [{
        role: "user",
        content: [
          { type: "text", text: "oku" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${PNG_B64}` } },
        ],
      }],
      [],
    );

    expect(out).toEqual([{
      role: "user",
      content: [
        { type: "text", text: "oku" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_B64 } },
      ],
    }]);
  });

  it("tool_calls taşıyan assistant mesajının görsel part'ını da çevirir", () => {
    const out = bedrockMessagesFromRequest(
      [{
        role: "assistant",
        content: [{ type: "image_url", image_url: { url: `data:image/gif;base64,${PNG_B64}` } }],
        tool_calls: [{ id: "c1", function: { name: "f", arguments: "{}" } }],
      }],
      [],
    );

    expect(out[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/gif", data: PNG_B64 } },
      { type: "tool_use", id: "c1", name: "f", input: {} },
    ]);
  });

  it("içeriksiz mesaj boş string kalır (mevcut davranış korunur)", () => {
    expect(bedrockMessagesFromRequest([{ role: "user" }], [])).toEqual([{ role: "user", content: "" }]);
  });
});
