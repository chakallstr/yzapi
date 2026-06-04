import { describe, it, expect } from "vitest";
import { withImageSlot, imageQueueStatus } from "./image-queue.js";

describe("image-queue (semaphore)", () => {
  it("never exceeds max concurrency and completes all tasks", async () => {
    let running = 0;
    let peak = 0;
    const task = () =>
      new Promise<void>((resolve) => {
        running += 1;
        peak = Math.max(peak, running);
        setTimeout(() => { running -= 1; resolve(); }, 10);
      });

    await Promise.all(Array.from({ length: 12 }, () => withImageSlot(task)));

    expect(peak).toBeLessThanOrEqual(imageQueueStatus().max);
    expect(peak).toBeGreaterThan(0);
    expect(running).toBe(0);
    expect(imageQueueStatus().active).toBe(0);
    expect(imageQueueStatus().queued).toBe(0);
  });

  it("propagates the task result and releases the slot on throw", async () => {
    const ok = await withImageSlot(async () => 42);
    expect(ok).toBe(42);
    await expect(withImageSlot(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(imageQueueStatus().active).toBe(0);
  });
});
