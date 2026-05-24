# Fiyat Master — YapayZekaLab

Tek kaynak fiyat belgesi. Tüm provider fiyatları ham (provider) USD cinsindendir.
Müşteri fiyatları buradan pipeline ile hesaplanır — bu dosya doğrudan düzenlenir.

---

## Sistem Parametreleri (Varsayılan)

| Parametre | Değer | Açıklama |
|---|---|---|
| `kurBuffer` | 0.03 | Canlı kura eklenen tampon oran (sellKur = liveKur × 1.03) |
| `textBillingRatio` | 0.9 | 900K gerçek token = 1M faturalama token |
| `textCarpan` | 3.0 | Text modalite çarpanı |
| `imageCarpan` | 3.0 | Görsel modalite çarpanı |
| `videoCarpan` | 3.0 | Video modalite çarpanı |

---

## Pipeline Formülü

```
PROVIDER PRICE (ham $/1M token | $/image | $/sec)
  × modalite çarpan (text/image/video — varsayılan 3.0)
  ÷ billing ratio (sadece text: 0.9 → 900K gerçek = 1M faturalama)
  = CUSTOMER USD
  × sellKur (= liveKur × (1 + kurBuffer))
  = CUSTOMER TL
```

---

## Text Modelleri ($/1M gerçek token)

| Model | Context | Max Output | Endpoints | Provider Input $/1M | Provider Output $/1M |
|---|---:|---:|---|---:|---:|
| `anthropic/claude-haiku-4.5` | 200,000 | 64,000 | chat, messages | 0.15 | 0.15 |
| `anthropic/claude-sonnet-4.6` | 1,000,000 | 128,000 | chat, messages | 0.255 | 0.255 |
| `anthropic/claude-opus-4.6` | 1,000,000 | 128,000 | chat, messages | 0.30 | 0.30 |
| `anthropic/claude-opus-4.7` | 1,000,000 | 128,000 | chat, messages | 0.30 | 0.30 |
| `openai/gpt-5.3-codex` | 400,000 | 128,000 | chat, responses | 0.13 | 0.13 |
| `openai/gpt-5.4` | 1,050,000 | 128,000 | chat, responses | 0.15 | 0.15 |
| `openai/gpt-5.4-mini` | 400,000 | 128,000 | chat, responses | 0.10 | 0.10 |
| `openai/gpt-5.5` | 1,050,000 | 128,000 | chat, responses | 0.20 | 0.20 |
| `google/gemini-2.5-pro` | 1,048,576 | 65,536 | chat | 0.11 | 0.11 |
| `google/gemini-3.1-flash-lite-preview` | 1,048,576 | 65,536 | chat | 0.10 | 0.10 |
| `google/gemini-3.1-pro-preview` | 1,048,576 | 65,536 | chat | 0.13 | 0.13 |
| `deepseek/deepseek-v4-pro` | 1,048,576 | 384,000 | chat | 0.10 | 0.10 |
| `mimo/mimo-v2-pro` | 1,048,576 | 131,072 | chat | 0.10 | 0.10 |
| `minimax/minimax-m2.7` | 204,800 | 131,072 | chat | 0.10 | 0.10 |
| `moonshotai/kimi-k2.5` | 262,144 | 65,535 | chat | 0.08 | 0.38 |
| `qwen/qwen3.6-plus` | 1,000,000 | 65,536 | chat | 0.10 | 0.10 |
| `z-ai/glm-5.1` | 202,752 | 65,536 | chat | 0.10 | 0.10 |

---

## Görsel Modelleri (CloseRouter katalog birimi: $/1M token — input ve output ayrı)

900K/1M text faturalama kuralı uygulanmaz. CloseRouter `/v1/models` katalog verisi görsel modeller için de `usd_per_million_tokens` birimini döndürüyor; gerçek görsel request maliyeti provider usage alanından doğrulanmadan "$/image" gibi varsayılmamalıdır.

| Model | Context | Endpoints | Provider Input $/1M | Provider Output $/1M |
|---|---:|---|---:|---:|
| `openai/gpt-image-2` | 272,000 | chat, images_generations | 0.8 | 1.5 |
| `openai/gpt-image-2-edit` | — | chat, images_generations, images_edits | 0.8 | 1.5 |
| `google/nano-banana-2` | — | chat, images_generations | 0.1 | 0.3 |
| `google/nano-banana-2-edit` | — | chat, images_generations, images_edits | 0.1 | 0.3 |
| `google/nano-banana-pro` | — | chat, images_generations | 0.2 | 1.2 |
| `google/nano-banana-pro-edit` | — | chat, images_generations, images_edits | 0.2 | 1.2 |

---

## Video Modelleri ($/saniye — çözünürlüğe göre)

| Model | Endpoints | default $/sn | 480p $/sn | 720p $/sn | 1080p $/sn |
|---|---|---:|---:|---:|---:|
| `google/veo-3.1` | chat, videos_submit, videos_task | 0.030 | — | — | — |
| `google/veo-3.1-extend` | chat, videos_submit, videos_task | 0.030 | — | — | — |
| `google/veo-3.1-i2v` | chat, videos_submit, videos_task | 0.030 | — | — | — |
| `bytedance/seedance-2.0` | chat, videos_submit, videos_task | — | 0.016815 | 0.0378 | 0.08505 |
| `bytedance/seedance-2.0-edit` | chat, videos_submit, videos_task | — | 0.016815 | 0.0378 | 0.08505 |
| `bytedance/seedance-2.0-extend` | chat, videos_submit, videos_task | — | 0.016815 | 0.0378 | 0.08505 |
| `bytedance/seedance-2.0-i2v` | chat, videos_submit, videos_task | — | 0.016815 | 0.0378 | 0.08505 |
| `kwaivgi/kling-v3.0-std` | chat, videos_submit, videos_task | 0.030 | — | — | — |
| `kwaivgi/kling-v3.0-std-i2v` | chat, videos_submit, videos_task | 0.030 | — | — | — |
| `kwaivgi/kling-v3.0-std-motion-control` | chat, videos_submit, videos_task | 0.030 | — | — | — |

---

## Notlar

- ByteDance ekran görüntüsü güncellemesi (2026-05-24 17:08): eski katalog farkları kenara kaydedildi.
  - 480p: 0.0163 → 0.016815, fark +0.000515 $/sn
  - 720p: 0.0367 → 0.0378, fark +0.0011 $/sn
  - 1080p: 0.0826 → 0.08505, fark +0.00245 $/sn
  - Aynı değerler `seedance-2.0`, `seedance-2.0-edit`, `seedance-2.0-extend`, `seedance-2.0-i2v` modellerine uygulanır.
- CloseRouter canlı katalog taraması (2026-05-24): `/v1/models` 33 model döndürdü; fiyat farkları sisteme işlendi.
  - `anthropic/claude-sonnet-4.6`: 0.25 → 0.255 $/1M input/output
  - `moonshotai/kimi-k2.5`: output 0.37 → 0.38 $/1M
- `moonshotai/kimi-k2.5` asimetrik fiyatlandırma: input=0.08, output=0.38 $/1M token
- TL dönüşümü: `sellKur = liveKur × (1 + kurBuffer)`. Canlı kur TCMB USD/TRY satış kurundan çekilir.
- Text faturalama: 900K gerçek token = 1M faturalama tokeni (`textBillingRatio=0.9`)
- Görsel ve video modellerde billing ratio uygulanmaz.
