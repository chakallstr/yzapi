import type { GuardEndpoint } from "./types.js";

const MAX_EXTRACT_BYTES = 64 * 1024; // guard'lar kendi alt-sınırını uygular (örn jailbreak 16KB)

function pushContent(out: string[], content: unknown): void {
  if (typeof content === "string") {
    out.push(content);
    return;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        out.push((part as { text: string }).text);
      }
    }
  }
}

/**
 * 3 endpoint'in farklı body şekillerinden taranacak metni normalize çıkarır.
 * Görsel/binary part'lar atlanır (NSFW görsel ayrı iş). Bozuk girdide "" döner (never-throw).
 */
export function extractScanText(body: unknown, endpoint: GuardEndpoint): string {
  try {
    if (!body || typeof body !== "object") return "";
    const b = body as Record<string, unknown>;
    const out: string[] = [];

    // system + messages[]: chat, messages (Anthropic) VE responses'ın chat'e çevrilmiş hali (chatBody)
    pushContent(out, b.system);
    if (Array.isArray(b.messages)) {
      for (const m of b.messages) {
        if (m && typeof m === "object") pushContent(out, (m as { content?: unknown }).content);
      }
    }
    // responses-native: instructions + input (string ya da item dizisi)
    if (endpoint === "responses") {
      if (typeof b.instructions === "string") out.push(b.instructions);
      if (typeof b.input === "string") {
        out.push(b.input);
      } else if (Array.isArray(b.input)) {
        for (const item of b.input) {
          if (item && typeof item === "object") pushContent(out, (item as { content?: unknown }).content);
        }
      }
    }

    return out.join("\n").slice(0, MAX_EXTRACT_BYTES);
  } catch {
    return "";
  }
}
