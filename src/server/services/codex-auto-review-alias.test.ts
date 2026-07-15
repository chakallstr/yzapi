// Codex CLI'nin auto-review/onay yan-çağrısı `model: "codex-auto-review"` gönderir.
// Upstream'lerde böyle bir model yok → 404 "Model bulunamadı". Bu alias onu canonical
// gpt-5.5'e çözer (koltuk-servisli, müşteri paketi coverage'ı kapsar). Bu testler:
//   1) alias gerçekten gpt-5.5'e çözülür,
//   2) 42-kilit BOZULMAZ (codex-auto-review bir MASTER_MODELS id'si DEĞİL, yalnız alias),
//   3) bilinmeyen yan-çağrılar artık 404 yerine geçerli modele düşer.
import { describe, it, expect } from "vitest";
import { MASTER_MODELS, canonicalizeModelId } from "../../master-models.js";

describe("codex-auto-review alias → gpt-5.5", () => {
  it("canonicalizes the Codex auto-review sidecar id to gpt-5.5", () => {
    expect(canonicalizeModelId("codex-auto-review")).toBe("gpt-5.5");
  });

  it("is an ALIAS only — not a 43rd MASTER_MODELS entry (42-lock intact)", () => {
    expect(MASTER_MODELS).toHaveLength(42);
    expect(MASTER_MODELS.map((m) => m.id)).not.toContain("codex-auto-review");
  });

  it("attaches the alias to the gpt-5.5 entry", () => {
    const gpt55 = MASTER_MODELS.find((m) => m.id === "gpt-5.5");
    expect(gpt55?.aliases).toContain("codex-auto-review");
  });
});
