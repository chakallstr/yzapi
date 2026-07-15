# Layer E (oversized-request seat-spread) — Feasibility Spike

**Tarih:** 2026-06-28
**Sonuç:** ❌ **İNFİZİBİL / ters-etki riski** → E DÜŞER. C + D (compaction + Retry-After) doğru kaldıraçlar.

## Soru
Çok büyük bir Codex isteği geldiğinde session-affinity'yi seçici kırıp isteği **en az yüklü/boş koltuğa** verebilir miyiz? (Amaç: tek heavy user'ın tek koltuğun dakikalık TPM'ine sıkışmasını hafifletmek, bağlama dokunmadan.)

## Bulgular (kanıt)
1. **cliproxy affinity'yi İSTEKTEN gelen session anahtarıyla key'liyor.** Default conf (`/opt/homebrew/etc/cliproxyapi.conf`, çalışan servisin yüklediği) satır 163-164: session ID şuralardan çıkarılıyor — `metadata.user_id` (Claude Code), **`X-Session-ID`, `Session_id` (Codex)**, `X-Client-Request-Id`, `conversation_id`. `session-affinity: true`, ttl 1h, strategy round-robin.
2. **Affinity ZORUNLU.** Aynı conf satır 167 (canlı yorum, 2026-06-27): *"affinity kapatınca ağır-context (15MB) kullanıcı cache-cold→%100 429 oldu; cache ısınması için affinity ŞART"*. Yani affinity = Codex prompt-cache ısınması; kapatma daha önce TERS TEPTİ.
3. yzapi seat'e (sub-codex) isteği müşterinin Codex client'ından gelen `Session_id`'yi taşıyarak yolluyor.

## Neden infizibil
E'yi uygulamak = oversized istekte yzapi'nin forward ettiği **session anahtarını değiştirmek** → cliproxy round-robin ile **farklı koltuğa** yönlendirir. AMA o koltukta bu konuşmanın **prompt-cache'i YOK (cache-cold)** → istek **tam token maliyeti** öder (cache-hit yok) → dakikalık TPM'e çarpma olasılığı **AZALMAZ, ARTAR**. Bu, 2026-06-27'de affinity-kapatmanın ters tepmesinin **birebir aynı tuzağı**: en büyük (en çok cache'e muhtaç) istekler tam da cache-cold gönderilir.

**Cache-sıcaklığı ↔ yük-yayma doğrudan çelişiyor; ağır-bağlam Codex'te cache-sıcaklığı kazanır.**

## Karar
- **E DROP.** Seat-spread bu iş yükü için çıkmaz.
- **C + D yeterli ve doğru:** isteği KÜÇÜLT (C: dedup, B: özet [Plan 2]) → daha az token/dakika; retry-storm'u SÖNDÜR (D: Retry-After) → daha az istek/dakika. İkisi de cache'i bozmadan dakikalık oranı düşürür.
- Gerçek "kapasite" çözümü hâlâ ek/özel koltuk (owner kararı; şimdilik "2 koltuk yeter").

İlişkili: `2026-06-28-akilli-compaction-design.md` · `project_yzapi_codex_lazy_fallback_dead_wallet_empty` · `project_yzapi_codex_seat_429_spof_tpm_cap` (15MB affinity dersi).
