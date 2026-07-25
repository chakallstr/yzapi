/**
 * Görsel kesin-boyut resize'ı (ffmpeg ile, arka planda).
 *
 * NEDEN: gpt-image (CF) istenen TAM pikseli ÜRETMEZ — kendi çözünürlüğünü seçer
 * (ör. müşteri 1920x1080 ister, model 1672x941 döner; aspect korunur, mutlak boyut farklı).
 * Müşteri "Özel" alanına yazdığı kesin px'i almak istiyor → çıkan görseli istenen W×H'ye
 * cover+crop ile resize ederiz (bozulma YOK; aspect zaten yakın olduğundan kırpma minimal).
 *
 * ffmpeg sistemde mevcut (VPS /usr/local/bin/ffmpeg) → ek npm bağımlılığı YOK.
 * ASLA throw etmez: herhangi bir hatada orijinal görseli döndürür (resized:false).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../lib/logger.js";

const execFileP = promisify(execFile);
const ffmpegBin = (): string => process.env.FFMPEG_PATH || "/usr/local/bin/ffmpeg";

/** "WxH" → {w,h} yalnız her ikisi geçerli tam-sayı ve [64,4096] aralığındaysa; aksi (auto/bozuk) → null. */
export function parseRequestedSize(size: unknown): { w: number; h: number } | null {
  if (typeof size !== "string") return null;
  const m = size.trim().match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 64 || h < 64 || w > 4096 || h > 4096) return null;
  return { w, h };
}

/**
 * base64 PNG'yi TAM w×h'ye resize et (cover+crop, bozulmasız). Hata → orijinal b64 (asla throw).
 * Dönüş: { b64, resized } — resized=false ise dokunulmadı.
 */
export async function resizeB64ToExact(b64: string, w: number, h: number, tag: string): Promise<{ b64: string; resized: boolean }> {
  const safeTag = String(tag).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "img";
  const inP = join(tmpdir(), `yzimg-${safeTag}-in.png`);
  const outP = join(tmpdir(), `yzimg-${safeTag}-out.png`);
  try {
    await writeFile(inP, Buffer.from(b64, "base64"));
    await execFileP(
      ffmpegBin(),
      ["-y", "-i", inP, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, "-frames:v", "1", outP],
      { timeout: 25_000, maxBuffer: 64 * 1024 * 1024 },
    );
    const out = await readFile(outP);
    if (!out.length) return { b64, resized: false };
    return { b64: out.toString("base64"), resized: true };
  } catch (e) {
    logger.warn({ err: (e as Error)?.message, w, h }, "image resize failed — returning original");
    return { b64, resized: false };
  } finally {
    void unlink(inP).catch(() => {});
    void unlink(outP).catch(() => {});
  }
}
