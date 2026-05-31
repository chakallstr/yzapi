import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSchedule = vi.fn();
vi.mock("node-cron", () => ({ default: { schedule: mockSchedule } }));

const mockRunScanIfActivity = vi.fn();
vi.mock("../services/mali-izleme-service.js", () => ({
  runScanIfActivity: (...args: unknown[]) => mockRunScanIfActivity(...args),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// env.NODE_ENV testten testişe değiştirilebilsin diye mutable mock.
const envMock: { NODE_ENV: string } = { NODE_ENV: "test" };
vi.mock("../lib/env.js", () => ({ env: envMock }));

describe("startMaliIzlemeJob — aktivite-kapılı job (R1/R19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NODE_ENV = "test";
  });

  it("NODE_ENV=test → cron KAYDEDİLMEZ (R1.6)", async () => {
    const { startMaliIzlemeJob } = await import("./mali-izleme-job.js");
    startMaliIzlemeJob();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("NODE_ENV=production → cron 60sn periyotla kaydedilir", async () => {
    envMock.NODE_ENV = "production";
    const { startMaliIzlemeJob } = await import("./mali-izleme-job.js");
    startMaliIzlemeJob();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0]).toBe("* * * * *");
  });

  it("cron tetiklenince runScanIfActivity('cron') çağrılır", async () => {
    envMock.NODE_ENV = "production";
    mockRunScanIfActivity.mockResolvedValueOnce({ verdict: "SORUN_YOK", findings: [], durationMs: 5 });
    const { startMaliIzlemeJob } = await import("./mali-izleme-job.js");
    startMaliIzlemeJob();
    const cb = mockSchedule.mock.calls[0][1] as () => Promise<void>;
    await cb();
    expect(mockRunScanIfActivity).toHaveBeenCalledWith("cron");
  });

  it("aktivite yoksa (null) çevrim sessiz tamamlanır — hata yok", async () => {
    envMock.NODE_ENV = "production";
    mockRunScanIfActivity.mockResolvedValueOnce(null); // aktivite yok
    const { startMaliIzlemeJob } = await import("./mali-izleme-job.js");
    startMaliIzlemeJob();
    const cb = mockSchedule.mock.calls[0][1] as () => Promise<void>;
    await expect(cb()).resolves.toBeUndefined();
    expect(mockRunScanIfActivity).toHaveBeenCalledOnce();
  });

  it("DB hatası job'u ÇÖKERTMEZ — yakalanır, sonraki çevrime devam (R19.1)", async () => {
    envMock.NODE_ENV = "production";
    mockRunScanIfActivity.mockRejectedValueOnce(new Error("db down"));
    const { startMaliIzlemeJob } = await import("./mali-izleme-job.js");
    startMaliIzlemeJob();
    const cb = mockSchedule.mock.calls[0][1] as () => Promise<void>;
    // Hata fırlatmaz (try/catch içinde yutulur)
    await expect(cb()).resolves.toBeUndefined();
  });
});
