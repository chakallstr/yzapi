# Agent 03 - Codex Session Extractor

Kapsam: Codex memory ve son 24 saat API rollout izleri.

## Dayanikli kararlar

- Paket/preset/gunluk istek yok.
- TL bakiyeli duz satis.
- Guncel router karari: YapayZekaLab backend `ProviderAdapter` aktif; MVP upstream CloseRouter, 9Router Faz-2 POC/fallback adayi.
- Full catalog ticari plan: text/image/video tek bakiye defterinden.
- Provider fiyat `* 3.00`.
- Text billing: `billable_tokens = real_tokens / 0.90`.
- KDV dahil, Shopier odeme, minimum yukleme `250 TL`.
- USD/TRY canli kur + `%3` buffer.
- Varsayilan input limiti `128K`; ustu admin onayli.
- Prompt/cevap 30 gun saklama.
- Limitli coklu API key.
- Manuel iade.

## Teknik kararlar

- CloseRouter public catalog 33 model olarak dogrulanmis.
- `context_length`, `max_output_tokens`, pricing ve modality alanlari kontrol edilmis.
- Tasarim yonu developer dashboard; paket ekrani tasarlanmayacak.
- Claude IDE/panel uyumu kesin degil; Anthropic Messages API endpointi gerekir.

## Cozulmemis

- Tek canonical master MD istenmis ama onceki rolloutta olusmamis.
- Eski paket/preset dosyalari arsivlenmezse yanlis yonlendirme riski var.
- `antropik.yapayzekapi.store` kesin calisir kanit yok.

## Kaynaklar

- `/Users/ufuk/.codex-desktop-safe/memories/MEMORY.md`
- `/Users/ufuk/.codex-desktop-safe/memories/rollout_summaries/2026-05-23T11-32-54-GyeH-tl_bakiyeli_ai_api_pricing_plan.md`
- `/Users/ufuk/.codex-desktop-safe/memories/rollout_summaries/2026-05-23T11-34-47-9yLD-closerouter_yapayzekapi_research_and_claude_ide_compatibilit.md`
