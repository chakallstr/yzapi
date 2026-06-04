// Görsel üretimi için global, in-memory eşzamanlılık kapısı (sayan semafor).
// Upstream görsel işlerini max-N ile sınırlar (CodeFast Studio "0/3 sistem kuyruğu").
// Tek-process; çok-instance'ta her process kendi limitini uygular (Faz 4a için yeterli).

const MAX_CONCURRENT = Math.max(1, Number(process.env.IMAGE_MAX_CONCURRENT ?? 3) || 3);

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => queue.push(resolve));
}

function release(): void {
  active -= 1;
  if (queue.length > 0 && active < MAX_CONCURRENT) {
    active += 1;
    const next = queue.shift();
    if (next) next();
  }
}

export function imageQueueStatus(): { active: number; queued: number; max: number } {
  return { active, queued: queue.length, max: MAX_CONCURRENT };
}

/** İşi bir slot içinde çalıştır; slot doluysa sıraya girer (FIFO). */
export async function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
