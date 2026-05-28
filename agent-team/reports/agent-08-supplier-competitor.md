# Agent 08 - Supplier / Competitor

Kapsam: CloseRouter, yapayzekapi.store, llm.gen.tr, model ekonomisi.

## Bulgular

- CloseRouter katalogu onceki calismada 33 model olarak dogrulanmis.
- Katalog dogrulamada context length, max output, pricing ve modalities alanlari kullanilmis.
- CloseRouter API planinda OpenAI-compatible ve Anthropic-style endpoint notlari var.
- `yapayzekapi.store` kredi/carpan modeliyle incelenmis.
- `llm.gen.tr` rakip fiyat karsilastirmasi yapilmis.

## Kararlar

- Bizim aktif model: paket yok, bakiye var.
- Text icin doğrudan müşteri satış fiyatı tablosu kullanılıyor.
- Rakip altina inme denemeleri aktif ana karar degil; marj korunacak.
- Image/video ayri provider birimiyle fiyatlanacak.

## Riskler

- Image pricing CloseRouter ile rakibe gore zayif gorunuyor.
- Video ham maliyetleri metinden cok farkli; tek token mantigiyla satilmamali.
- Claude IDE uyumu icin OpenAI-compatible endpoint tek basina yeterli degil.
- Supplier fiyatlari dinamik; production oncesi tekrar canli dogrulama gerekir.

## Kanit

- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/closerouter-model-verification-2026-05-23.md`
- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/closerouter-api-tr-and-plan.md`
- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/yapayzekapi-pricing-analysis.md`
- `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api/llm-gen-tr-price-comparison.md`
