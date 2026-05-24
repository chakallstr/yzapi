# Agent 02 - Product / Pricing

Kapsam: `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api`

## Bulgular

- Eski `/Users/ufuk/Documents/api` aktif klasor degil. Aktif plan klasoru:
  `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api`
- Paket, preset, gunluk istek paketi yok.
- Ana model: bakiye/kredi bazli duz satis.
- Kullanici TL veya USD bakiye yukler; kullandigi modelin gercek kullanim birimine gore bakiyeden dusulur.

## Fiyat kararlari

- Text icin aktif kural: `provider_fiyati * 3.00`
- Billing token kural: `billable_tokens = real_tokens / 0.90`
- 900,000 gercek token = 1,000,000 faturalama tokeni.
- Efektif text carpani yaklasik `3.3333x`.
- Guncel router karari: MVP'de YapayZekaLab backend `ProviderAdapter` + CloseRouter; 9Router sadece Faz-2 POC/fallback adayi. Onceki "9Router routing katmani" notu superseded.
- TL tahsilat, ic defter USD olabilir.
- Image/video paketlenmez; kendi provider birimiyle bakiyeden duser.

## Riskler

- `all-model-pricing.md` icinde eski `2.30x` notu hala var; aktif karar `3.00x`.
- Image fiyatlari rakip `llm.gen.tr` karsisinda zayif gorunuyor.
- MVP text oncelikli gorunuyor; ticari plan full catalog.

## Kanit

- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/direct-sales-final.md`
- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/multiplier-3-pricing.md`
- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/direct-credit-api-plan.md`
- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/all-model-pricing.md`
- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/llm-gen-tr-price-comparison.md`
