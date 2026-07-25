import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetLaneSchedulerState,
  resolveLanesForModel,
  acquireLane,
  isLaneAvailable,
  laneToContext,
  recordLaneBackoff,
  clearLaneBackoff,
  enqueueRequest,
  drainQueue,
  releaseLane,
  backoffMsFromRetryAfter,
  getLaneDispatchCount,
  getLaneBackoffUntil,
  getQueueLength,
  type LaneInfo,
} from "./lane-scheduler.js";
import type { ParsedProfile } from "./provider-config-service.js";

// Test için minimal lane profilleri — null/undefined değerleri EZMEZ (in kontrolü)
const makeProfile = (over: Partial<ParsedProfile>): ParsedProfile => ({
  id: over.id ?? "test-lane",
  baseUrl: over.baseUrl ?? "https://upstream.example/v1",
  apiKey: "apiKey" in over ? over.apiKey : "key_test",
  supportedModelIds: over.supportedModelIds ?? ["claude-sonnet-4-6"],
  modelMap: over.modelMap ?? {},
  fallbackProviderId: over.fallbackProviderId ?? null,
  laneModel: over.laneModel ?? "sonnet",
  laneRegion: over.laneRegion ?? "geo",
  rpmLimit: "rpmLimit" in over ? over.rpmLimit ?? 10 : 10,
  lanePriority: "lanePriority" in over ? over.lanePriority ?? null : 1,
});

const makeLane = (over: Partial<ParsedProfile> & { priority?: number; rpmLimit?: number }): LaneInfo => ({
  profile: makeProfile(over),
  priority: over.lanePriority ?? over.priority ?? 1,
  rpmLimit: over.rpmLimit ?? 10,
});

// Mock readAllEnabledProfiles
vi.mock("./provider-config-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./provider-config-service.js")>();
  return {
    ...actual,
    readAllEnabledProfiles: vi.fn(),
    providerSupportsModelId: actual.providerSupportsModelId,
  };
});

import { readAllEnabledProfiles, providerSupportsModelId } from "./provider-config-service.js";

const mockProfiles = (profiles: ParsedProfile[]) => {
  vi.mocked(readAllEnabledProfiles).mockResolvedValue(profiles);
};

beforeEach(() => {
  resetLaneSchedulerState();
  vi.clearAllMocks();
});

// ── RPM cooldown + priority dispatch ──────────────────────────────────────────

describe("lane-scheduler — RPM cooldown + priority dispatch", () => {
  it("priority sırasına göre lane'leri döndürür (1=en yüksek)", async () => {
    const lanes = [
      makeLane({ id: "sonnet-geo", lanePriority: 1 }),
      makeLane({ id: "sonnet-global", lanePriority: 2 }),
      makeLane({ id: "opus-geo", lanePriority: 3 }),
      makeLane({ id: "opus-global", lanePriority: 4 }),
      makeLane({ id: "haiku", lanePriority: 5 }),
    ];
    mockProfiles(lanes.map((l) => l.profile));

    const result = await resolveLanesForModel("claude-sonnet-4-6");
    expect(result.map((l) => l.profile.id)).toEqual([
      "sonnet-geo", "sonnet-global", "opus-geo", "opus-global", "haiku",
    ]);
  });

  it("lanePriority null olan profilleri filtreler (lane değil)", async () => {
    mockProfiles([
      makeProfile({ id: "metro", lanePriority: null }),
      makeProfile({ id: "sonnet-geo", lanePriority: 1 }),
    ]);

    const result = await resolveLanesForModel("claude-sonnet-4-6");
    expect(result).toHaveLength(1);
    expect(result[0].profile.id).toBe("sonnet-geo");
  });

  it("apiKey yoksa lane olarak kabul etmez", async () => {
    mockProfiles([
      makeProfile({ id: "no-key", apiKey: undefined, lanePriority: 1 }),
    ]);

    const result = await resolveLanesForModel("claude-sonnet-4-6");
    expect(result).toHaveLength(0);
  });

  it("model desteklenmiyorsa lane olarak kabul etmez", async () => {
    mockProfiles([
      makeProfile({ id: "wrong-model", supportedModelIds: ["gpt-4o"], lanePriority: 1 }),
    ]);

    const result = await resolveLanesForModel("claude-sonnet-4-6");
    expect(result).toHaveLength(0);
  });

  it("ilk acquireLane en yüksek priority lane'i verir", () => {
    const lanes = [
      makeLane({ id: "sonnet-geo", lanePriority: 1 }),
      makeLane({ id: "opus-geo", lanePriority: 3 }),
    ];

    const lane = acquireLane(lanes);
    expect(lane?.profile.id).toBe("sonnet-geo");
  });

  it("RPM limit dolunca sıradaki lane'e geçer", () => {
    const lanes = [
      makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 2 }),
      makeLane({ id: "sonnet-global", lanePriority: 2, rpmLimit: 10 }),
    ];

    // İlk 2 dispatch sonnet-geo'ya gider
    expect(acquireLane(lanes)?.profile.id).toBe("sonnet-geo");
    expect(acquireLane(lanes)?.profile.id).toBe("sonnet-geo");
    // 3. dispatch — sonnet-geo RPM dolu → sonnet-global'e geç
    expect(acquireLane(lanes)?.profile.id).toBe("sonnet-global");
  });

  it("RPM limit dolunca dispatch count artar", () => {
    const lanes = [makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 3 })];

    acquireLane(lanes);
    acquireLane(lanes);
    expect(getLaneDispatchCount("sonnet-geo")).toBe(2);

    acquireLane(lanes);
    expect(getLaneDispatchCount("sonnet-geo")).toBe(3);

    // 4. dispatch — RPM dolu → null
    expect(acquireLane(lanes)).toBeNull();
  });

  it("rpmLimit null (sınırsız) → her zaman available", () => {
    const lanes = [makeLane({ id: "unlimited", lanePriority: 1, rpmLimit: Infinity })];
    for (let i = 0; i < 100; i++) {
      acquireLane(lanes);
    }
    expect(acquireLane(lanes)?.profile.id).toBe("unlimited");
  });

  it("isLaneAvailable — backoff'ta olan lane false döner", () => {
    const lane = makeLane({ id: "backed-off", lanePriority: 1 });
    recordLaneBackoff("backed-off", 10_000);
    expect(isLaneAvailable(lane)).toBe(false);
  });

  it("isLaneAvailable — backoff süresi dolunca true döner", () => {
    const lane = makeLane({ id: "recovered", lanePriority: 1 });
    recordLaneBackoff("recovered", 1); // 1ms backoff
    expect(isLaneAvailable(lane, Date.now() + 10)).toBe(true);
  });

  it("clearLaneBackoff — backoff'u temizler", () => {
    const lane = makeLane({ id: "cleared", lanePriority: 1 });
    recordLaneBackoff("cleared", 60_000);
    expect(isLaneAvailable(lane)).toBe(false);
    clearLaneBackoff("cleared");
    expect(isLaneAvailable(lane)).toBe(true);
  });

  it("laneToContext — ProviderContext'e doğru çevirir", () => {
    const lane = makeLane({
      id: "sonnet-geo",
      baseUrl: "https://us.anthropic/v1",
      apiKey: "key_geo",
      modelMap: { "claude-sonnet-4-6": "claude-sonnet-4.6" },
    });

    const ctx = laneToContext(lane);
    expect(ctx.profileId).toBe("sonnet-geo");
    expect(ctx.baseUrl).toBe("https://us.anthropic/v1");
    expect(ctx.apiKey).toBe("key_geo");
    expect(ctx.modelMap["claude-sonnet-4-6"]).toBe("claude-sonnet-4.6");
  });
});

// ── Backoff ───────────────────────────────────────────────────────────────────

describe("lane-scheduler — backoff", () => {
  it("recordLaneBackoff — backoffUntil set eder", () => {
    recordLaneBackoff("test-lane", 5_000);
    const until = getLaneBackoffUntil("test-lane");
    expect(until).toBeDefined();
    expect(until! - Date.now()).toBeGreaterThan(4_000);
  });

  it("backoff'taki lane acquireLane'de atlanır", () => {
    const lanes = [
      makeLane({ id: "lane-a", lanePriority: 1 }),
      makeLane({ id: "lane-b", lanePriority: 2 }),
    ];

    recordLaneBackoff("lane-a", 60_000);
    const lane = acquireLane(lanes);
    expect(lane?.profile.id).toBe("lane-b"); // lane-a atlandı
  });

  it("tüm lane'ler backoff'ta → acquireLane null döner", () => {
    const lanes = [
      makeLane({ id: "lane-a", lanePriority: 1 }),
      makeLane({ id: "lane-b", lanePriority: 2 }),
    ];

    recordLaneBackoff("lane-a", 60_000);
    recordLaneBackoff("lane-b", 60_000);
    expect(acquireLane(lanes)).toBeNull();
  });
});

// ── Queue ─────────────────────────────────────────────────────────────────────

describe("lane-scheduler — queue", () => {
  it("tüm lane'ler doluyken enqueueRequest queue'ya alır", async () => {
    const lanes = [makeLane({ id: "only-lane", lanePriority: 1, rpmLimit: 1 })];

    // RPM'i doldur
    acquireLane(lanes);
    expect(acquireLane(lanes)).toBeNull();

    // Queue'a al — timeout kısa olsun
    const promise = enqueueRequest("claude-sonnet-4-6", lanes, 100);
    expect(getQueueLength()).toBeGreaterThan(0);

    // Timeout sonrası reject
    await expect(promise).rejects.toThrow("queue timeout");
    expect(getQueueLength()).toBe(0);
  });

  it("queue timeout → temizlik", async () => {
    const lanes: LaneInfo[] = []; // hiç lane yok
    const promise = enqueueRequest("claude-sonnet-4-6", lanes, 50);
    await expect(promise).rejects.toThrow("queue timeout");
    expect(getQueueLength()).toBe(0);
  });
});

// ── providerSupportsModelId integration ───────────────────────────────────────

describe("lane-scheduler — model matching", () => {
  it("claude-sonnet-4-6 destekleyen lane bulunur", async () => {
    mockProfiles([
      makeProfile({ id: "sonnet-geo", supportedModelIds: ["claude-sonnet-4-6"], lanePriority: 1 }),
      makeProfile({ id: "opus-geo", supportedModelIds: ["claude-opus-4-6"], lanePriority: 2 }),
    ]);

    const result = await resolveLanesForModel("claude-sonnet-4-6");
    expect(result).toHaveLength(1);
    expect(result[0].profile.id).toBe("sonnet-geo");
  });

  it("hem sonnet hem opus destekleyen lane — ikisi de bulunur", async () => {
    mockProfiles([
      makeProfile({ id: "sonnet-geo", supportedModelIds: ["claude-sonnet-4-6"], lanePriority: 1 }),
      makeProfile({ id: "opus-geo", supportedModelIds: ["claude-sonnet-4-6", "claude-opus-4-6"], lanePriority: 2 }),
    ]);

    // claude-sonnet-4-6 iste → her iki lane de destekler (opus lane'i sonnet isteğini opus'a map eder)
    const result = await resolveLanesForModel("claude-sonnet-4-6");
    expect(result).toHaveLength(2);
    expect(result[0].profile.id).toBe("sonnet-geo");
    expect(result[1].profile.id).toBe("opus-geo");
  });
});

// ── releaseLane: hayalet RPM tüketimi ─────────────────────────────────────────
// Lane zincir kurulurken acquire ediliyor, ardından CF/paket override zinciri onu
// atabiliyor. Kota o zaman geri verilmezse lane'e hiç istek gitmediği hâlde sayaç
// yanmış kalır → gerçek Sonnet kapasitesi sessizce erir.

describe("lane-scheduler — releaseLane (hayalet tüketim)", () => {
  it("acquire edilip kullanılmayan lane'in kotası geri verilir", () => {
    const lanes = [makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 2 })];

    acquireLane(lanes);
    expect(getLaneDispatchCount("sonnet-geo")).toBe(1);

    releaseLane("sonnet-geo");
    expect(getLaneDispatchCount("sonnet-geo")).toBe(0);
  });

  it("kota geri verilince dolu lane tekrar kullanılabilir olur", () => {
    const lanes = [makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 1 })];

    expect(acquireLane(lanes)?.profile.id).toBe("sonnet-geo");
    expect(acquireLane(lanes)).toBeNull(); // RPM dolu

    releaseLane("sonnet-geo");
    expect(acquireLane(lanes)?.profile.id).toBe("sonnet-geo");
  });

  it("hiç acquire edilmemiş lane'de releaseLane no-op (sayaç negatife düşmez)", () => {
    releaseLane("hic-kullanilmadi");
    expect(getLaneDispatchCount("hic-kullanilmadi")).toBe(0);
  });

  it("iki acquire + bir release → bir dispatch kalır", () => {
    const lanes = [makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 5 })];
    acquireLane(lanes);
    acquireLane(lanes);
    releaseLane("sonnet-geo");
    expect(getLaneDispatchCount("sonnet-geo")).toBe(1);
  });
});

// ── Kuyruk modele bağlı + FIFO ────────────────────────────────────────────────

describe("lane-scheduler — kuyruk modele bağlı", () => {
  it("başka modelin drain'i bekleyen isteği ÇÖZMEZ", async () => {
    const sonnetLanes = [makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 1 })];
    const opusLanes = [makeLane({ id: "opus-geo", lanePriority: 1, rpmLimit: 5 })];

    acquireLane(sonnetLanes); // sonnet lane'i doldur
    const pending = enqueueRequest("claude-sonnet-4-6", sonnetLanes, 300);
    expect(getQueueLength()).toBe(1);

    // Opus lane'i boş — ama bekleyen SONNET istiyor. Opus drain'i onu çözmemeli.
    await drainQueue("claude-opus-4-6", opusLanes);
    expect(getQueueLength()).toBe(1);

    await expect(pending).rejects.toThrow("queue timeout");
  });

  it("kendi modelinin drain'i bekleyen isteği çözer ve doğru lane'i verir", async () => {
    const lanes = [makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 1 })];

    acquireLane(lanes);
    const pending = enqueueRequest("claude-sonnet-4-6", lanes, 1_000);
    expect(getQueueLength()).toBe(1);

    releaseLane("sonnet-geo"); // kota boşaldı
    await drainQueue("claude-sonnet-4-6", lanes);

    const ctx = await pending;
    expect(ctx.profileId).toBe("sonnet-geo");
    expect(getQueueLength()).toBe(0);
  });

  it("FIFO: en eski bekleyen ilk çözülür", async () => {
    const lanes = [makeLane({ id: "sonnet-geo", lanePriority: 1, rpmLimit: 1 })];
    acquireLane(lanes); // lane dolu

    const order: string[] = [];
    const first = enqueueRequest("claude-sonnet-4-6", lanes, 1_000).then(() => { order.push("first"); });
    const second = enqueueRequest("claude-sonnet-4-6", lanes, 1_000).then(() => { order.push("second"); });
    expect(getQueueLength()).toBe(2);

    // Tek slot aç → yalnız BİRİ çözülmeli ve o "first" olmalı.
    releaseLane("sonnet-geo");
    await drainQueue("claude-sonnet-4-6", lanes);
    await first;

    expect(order).toEqual(["first"]);
    expect(getQueueLength()).toBe(1);

    // Kalanı da çöz ki asılı promise kalmasın.
    releaseLane("sonnet-geo");
    await drainQueue("claude-sonnet-4-6", lanes);
    await second;
    expect(order).toEqual(["first", "second"]);
  });
});

// ── Retry-After farkında backoff ──────────────────────────────────────────────

describe("lane-scheduler — backoffMsFromRetryAfter", () => {
  it("saniye biçimini (delta-seconds) kullanır", () => {
    expect(backoffMsFromRetryAfter("30")).toBe(30_000);
    expect(backoffMsFromRetryAfter("0")).toBe(0);
  });

  it("HTTP-date biçimini kalan süreye çevirir", () => {
    const now = Date.UTC(2026, 6, 25, 12, 0, 0);
    const at = new Date(now + 20_000).toUTCString();
    const ms = backoffMsFromRetryAfter(at, now);
    // toUTCString saniyeye yuvarlar → 19–20sn arası kabul
    expect(ms).toBeGreaterThan(18_000);
    expect(ms).toBeLessThanOrEqual(20_000);
  });

  it("geçmiş tarih → sabit süreye düşer", () => {
    const now = Date.UTC(2026, 6, 25, 12, 0, 0);
    expect(backoffMsFromRetryAfter(new Date(now - 60_000).toUTCString(), now)).toBe(5_000);
  });

  it("başlık yok/geçersiz → sabit 5sn", () => {
    expect(backoffMsFromRetryAfter(null)).toBe(5_000);
    expect(backoffMsFromRetryAfter(undefined)).toBe(5_000);
    expect(backoffMsFromRetryAfter("")).toBe(5_000);
    expect(backoffMsFromRetryAfter("yakinda")).toBe(5_000);
  });

  it("uçuk değerler üst sınırla kırpılır (lane sonsuza kilitlenmesin)", () => {
    expect(backoffMsFromRetryAfter("99999")).toBe(120_000);
  });

  it("recordLaneBackoff Retry-After süresini uygular", () => {
    const lane = makeLane({ id: "sonnet-geo", lanePriority: 1 });
    recordLaneBackoff("sonnet-geo", backoffMsFromRetryAfter("30"));

    expect(isLaneAvailable(lane)).toBe(false);
    expect(isLaneAvailable(lane, Date.now() + 29_000)).toBe(false);
    expect(isLaneAvailable(lane, Date.now() + 31_000)).toBe(true);
  });
});
