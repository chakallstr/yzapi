// Katalog (üretici resmi liste) fiyat-karşılaştırma çekirdeği — SAF, React'siz.
// shared.jsx bunu import edip re-export eder; testler doğrudan buradan import eder.
//
// Modeli ÜRETEN şirketin resmi API liste fiyatı (USD / 1M token; girdi / çıktı).
// Kaynak: Anthropic / OpenAI / Google resmi fiyat sayfaları (2026-06 doğrulandı).
// Amaç: "aynı modeli üreticide şu kadar, bizde şu kadar" karşılaştırması = alıma teşvik.
// İleri-sürüm isimli modeller üreticinin amiral-sınıf resmi fiyatına eşlenir.
// Burada OLMAYAN (veya bizden ucuz olan) model → karşılaştırma GÖSTERİLMEZ.

export const CATALOG_TIERS = [
  { price: { in: 5,    out: 25   }, ids: ['claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-opus-4-1-20250805'] },
  { price: { in: 3,    out: 15   }, ids: ['claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514'] },
  { price: { in: 1,    out: 5    }, ids: ['claude-haiku-4-5-20251001'] },
  { price: { in: 1.25, out: 10   }, ids: ['gpt-5.5', 'gpt-5.5-2026-04-23', 'gpt-5.4', 'gpt-5.4-2026-03-05', 'gpt-5.3-chat-latest', 'gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5.2-chat-latest', 'gpt-5.1', 'gpt-5.1-2025-11-13', 'gpt-5.1-chat-latest', 'gpt-5', 'gpt-5-2025-08-07', 'gpt-5-chat-latest', 'gpt-5-search-api', 'gpt-5-search-api-2025-10-14'] },
  { price: { in: 0.25, out: 2    }, ids: ['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17', 'gpt-5-mini', 'gpt-5-mini-2025-08-07'] },
  { price: { in: 0.05, out: 0.40 }, ids: ['gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17', 'gpt-5-nano', 'gpt-5-nano-2025-08-07'] },
  { price: { in: 2,    out: 8    }, ids: ['o3', 'o3-2025-04-16'] },
  { price: { in: 1.10, out: 4.40 }, ids: ['o4-mini', 'o4-mini-2025-04-16', 'o3-mini', 'o3-mini-2025-01-31'] },
  { price: { in: 2,    out: 12   }, ids: ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-customtools', 'gemini-3-pro-preview'] },
  { price: { in: 0.30, out: 2.50 }, ids: ['gemini-3-flash-preview'] },
];

/** @type {Record<string, { in: number, out: number }>} */
export const CATALOG_PRICES = {};
for (const tier of CATALOG_TIERS) {
  for (const id of tier.ids) CATALOG_PRICES[id] = tier.price;
}

// Katalog vs bizim fiyat. Katalog yoksa ya da biz ucuz DEĞİLSEK null döner
// (yanlış/ters kıyas asla gösterilmez). Toplam = girdi + çıktı (USD / 1M token).
export function computeCatalogDiff(model) {
  if (!model) return null;
  const cat = CATALOG_PRICES[model.id];
  if (!cat) return null;
  const ourIn = Number(model.input);
  const ourOut = Number(model.output);
  if (!Number.isFinite(ourIn) || !Number.isFinite(ourOut)) return null;
  const catTotal = cat.in + cat.out;
  const ourTotal = ourIn + ourOut;
  if (!(catTotal > 0) || !(ourTotal > 0) || ourTotal >= catTotal) return null;
  const pct = Math.round((1 - ourTotal / catTotal) * 100);
  if (pct <= 0) return null;
  return { catIn: cat.in, catOut: cat.out, ourIn, ourOut, catTotal, ourTotal, pct };
}
