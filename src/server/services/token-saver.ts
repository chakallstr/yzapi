/**
 * Token Saver — araç/tool ÇIKTILARINI upstream'e gitmeden sıkıştırır (9Router RTK benzeri).
 *
 * Amaç: agentic istemciler (Codex/Cline) her turda devasa tool çıktısı (komut logları,
 * dosya okuma, git diff) geçmişe ekler; bunların çoğu gürültü/tekrar. Bu modül o çıktıları
 * sıkıştırarak input token'ı keser → müşteri daha az öder, upstream daha az işler.
 *
 * GÜVENLİK İLKELERİ (DOKUNULMAZ):
 *  - YALNIZCA tool/araç çıktılarına dokunur — kullanıcının kendi yazdığı mesaja/koda ASLA.
 *  - Saf + idempotent + ASLA throw etmez (herhangi bir hata → orijinal aynen döner).
 *  - "Orta" agresiflik: kayıpsız temizlik + yalnız ÇOK büyük çıktıyı baş/son koruyarak kırpma.
 *
 * Provider-agnostik: OpenAI (role:"tool"), Anthropic (tool_result content blok),
 * Responses-çevirisi (chat'e map'lendiği için role:"tool") hepsi kapsanır.
 */

export interface TokenSaverConfig {
  enabled: boolean;
  /** Bu karakter eşiğini aşan TEK tool çıktısı baş/son korunarak kırpılır (~4 char/token). */
  maxToolOutputChars: number;
  /** Kırpmada baştan korunan satır sayısı. */
  headLines: number;
  /** Kırpmada sondan korunan satır sayısı. */
  tailLines: number;
}

/** Eşikler kod-sabiti; canlı ON/OFF DB flag'inden okunur (system_api_config.token_saver_enabled). */
export const TOKEN_SAVER_DEFAULTS = {
  maxToolOutputChars: 32_000, // ~8K token
  headLines: 200,
  tailLines: 200,
} as const;

// ── kayıpsız temizleyiciler ──────────────────────────────────────────────────

// Kontrol karakterlerini kaynağa GÖMMEDEN üret (görünmez bayt yok, lint güvenli).
const ESC = String.fromCharCode(27); // ASCII ESC ()
const BEL = String.fromCharCode(7); // ASCII BEL ()
// ESC ile başlayan ANSI dizileri — normal metni (parantez/boşluk) ASLA bozmaz.
const CSI_RE = new RegExp(ESC + "\\[[0-9;:?]*[ -/]*[@-~]", "g"); // renk/imleç
// OSC gövdesi SINIRLI ({0,2048}) — BEL'siz ESC] ile katastrofik backtracking (ReDoS) OLMAZ.
// Gerçek OSC başlıkları kısadır; 2048'i aşan eşleşmezse zararsız (nadir ESC] kalıntısı).
const OSC_RE = new RegExp(ESC + "\\][^" + BEL + "]{0,512}" + BEL, "g"); // başlık dizileri (BEL ile biten; gerçek OSC kısa)
const ESC2_RE = new RegExp(ESC + "[@-Z\\\\\\-_]", "g"); // tek-karakter ESC kaçışları
const CTRL_RE = /[\r\f\v]/g; // CR / form-feed / vertical-tab. BOŞLUK, \n, \t KORUNUR.

/** ANSI/terminal kontrol kodlarını sil; normal metin asla bozulmaz. */
function stripAnsi(s: string): string {
  // ESC içermeyen (yaygın) girdi → pahalı ANSI regexlerini ATLA; yalnız ucuz CR/FF/VT temizle.
  if (s.indexOf(ESC) === -1) return s.replace(CTRL_RE, "");
  return s.replace(CSI_RE, "").replace(OSC_RE, "").replace(ESC2_RE, "").replace(CTRL_RE, "");
}

/** Trailing whitespace at + 2+ ardışık boş satırı tek boş satıra indir. */
function collapseBlankAndTrim(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  let blankRun = 0;
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+$/, "");
    if (line.trim() === "") {
      blankRun++;
      if (blankRun > 1) continue;
    } else {
      blankRun = 0;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Art arda 3+ kez tekrarlayan aynı (boş olmayan) satırı "satır  (xN tekrar)" olarak katla. */
function foldRepeatedLines(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let j = i + 1;
    while (j < lines.length && lines[j] === lines[i] && lines[i].trim() !== "") j++;
    const run = j - i;
    const folded = `${lines[i]}  (x${run} tekrar)`;
    // Orijinal run (satırlar + aralarındaki \n) vs katlanmış — yalnız GERÇEKTEN kısaltıyorsa katla.
    const originalLen = lines[i].length * run + (run - 1);
    if (run >= 3 && folded.length < originalLen) {
      out.push(folded);
    } else {
      for (let k = i; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  return out.join("\n");
}

/** Eşiği aşan çıktıyı baş/son satır koruyarak ortadan kırp (lossy, yalnız çok büyükte). */
function truncateHuge(s: string, cfg: TokenSaverConfig): string {
  if (s.length <= cfg.maxToolOutputChars) return s;
  const lines = s.split("\n");
  const keep = cfg.headLines + cfg.tailLines;
  if (lines.length <= keep + 1) {
    // Az satır ama dev boyut (tek/birkaç çok uzun satır) → char-bazlı kırp.
    const half = Math.floor(cfg.maxToolOutputChars / 2);
    const head = s.slice(0, half);
    const tail = s.slice(s.length - half);
    return `${head}\n...[${s.length - 2 * half} karakter kısaltıldı - token tasarrufu]...\n${tail}`;
  }
  const omitted = lines.length - keep;
  return [
    ...lines.slice(0, cfg.headLines),
    `...[${omitted} satır kısaltıldı - token tasarrufu]...`,
    ...lines.slice(lines.length - cfg.tailLines),
  ].join("\n");
}

/** Tek bir tool çıktısı metnini sıkıştır (kayıpsız zincir + dev-çıktı kırpma). */
export function compressToolText(text: string, cfg: TokenSaverConfig): string {
  // ReDoS/CPU guard: aşırı büyük girdiyi regex zincirinden ÖNCE kabaca kırp ki
  // regex/split'in göreceği boyut sınırlı kalsın (worst-case CPU'yu sabitler).
  const hardCap = cfg.maxToolOutputChars * 4;
  let t = text;
  if (t.length > hardCap) {
    const half = cfg.maxToolOutputChars;
    t = `${t.slice(0, half)}\n...[${t.length - 2 * half} karakter kısaltıldı - token tasarrufu]...\n${t.slice(t.length - half)}`;
  }
  t = stripAnsi(t);
  t = collapseBlankAndTrim(t);
  t = foldRepeatedLines(t);
  t = truncateHuge(t, cfg);
  return t;
}

// ── mesaj gövdesi gezgini ────────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

/** Bir content-blok dizisindeki tool_result bloklarını sıkıştır (Anthropic). {kısalan, işlenen char}. */
function compressContentBlocks(blocks: unknown[], cfg: TokenSaverConfig): { saved: number; processed: number } {
  let saved = 0;
  let processed = 0;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as AnyObj;
    if (b.type !== "tool_result") continue;
    const c = b.content;
    if (typeof c === "string") {
      processed += c.length;
      const next = compressToolText(c, cfg);
      saved += c.length - next.length;
      b.content = next;
    } else if (Array.isArray(c)) {
      // tool_result.content = [{type:"text", text:"..."}]
      for (const part of c) {
        if (part && typeof part === "object" && (part as AnyObj).type === "text" && typeof (part as AnyObj).text === "string") {
          const p = part as AnyObj;
          const orig = p.text as string;
          processed += orig.length;
          const next = compressToolText(orig, cfg);
          saved += orig.length - next.length;
          p.text = next;
        }
      }
    }
  }
  return { saved, processed };
}

/**
 * Gövdedeki tool çıktılarını YERİNDE sıkıştır. body.messages'ı mutasyona uğratır.
 * Döner: kısaltılan toplam karakter. ASLA throw etmez.
 */
/** İstek başına işlenecek toplam tool-çıktısı karakter bütçesi (lineer-amplifikasyon kalkanı). */
const PER_REQUEST_WORK_BUDGET = 3_000_000;

export function compressToolOutputs(body: AnyObj, cfg: TokenSaverConfig): number {
  try {
    const messages = body?.messages;
    if (!Array.isArray(messages)) return 0;
    let saved = 0;
    let processed = 0; // işlenen toplam tool-çıktısı char (bütçe aşılınca kalanları ATLA)
    for (const msg of messages) {
      if (processed > PER_REQUEST_WORK_BUDGET) break;
      if (!msg || typeof msg !== "object") continue;
      const m = msg as AnyObj;
      // OpenAI: role:"tool" + string content
      if (m.role === "tool" && typeof m.content === "string") {
        const orig = m.content as string;
        processed += orig.length;
        const next = compressToolText(orig, cfg);
        saved += orig.length - next.length;
        m.content = next;
        continue;
      }
      // Anthropic (ve multimodal): content = blok dizisi → tool_result blokları
      if (Array.isArray(m.content)) {
        const r = compressContentBlocks(m.content, cfg);
        saved += r.saved;
        processed += r.processed;
      }
    }
    return saved > 0 ? saved : 0;
  } catch {
    return 0; // güvenlik: herhangi bir hata → hiçbir şey değiştirme
  }
}

/**
 * Runtime config'ten flag/eşikleri okuyup gövdeyi (gerekirse) sıkıştıran sarmalayıcı.
 * forward fn'lerinde upstream'e göndermeden ÖNCE çağrılır. Kapalıysa no-op.
 */
export function maybeCompressToolOutputs(
  body: unknown,
  runtimeConfig: { tokenSaverEnabled?: boolean } | null | undefined,
): number {
  if (!runtimeConfig?.tokenSaverEnabled) return 0;
  if (!body || typeof body !== "object") return 0;
  const cfg: TokenSaverConfig = {
    enabled: true,
    maxToolOutputChars: TOKEN_SAVER_DEFAULTS.maxToolOutputChars,
    headLines: TOKEN_SAVER_DEFAULTS.headLines,
    tailLines: TOKEN_SAVER_DEFAULTS.tailLines,
  };
  return compressToolOutputs(body as AnyObj, cfg);
}
