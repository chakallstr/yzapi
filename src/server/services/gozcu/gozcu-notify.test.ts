// Gözcü — delivery (format + cooldown spam önleme) testleri.

import { describe, it, expect, beforeEach, vi } from "vitest";

// notifyAdmin'i mock'la (gerçek WhatsApp çağrısı yapma); formatAdminEvent gerçek kalsın.
vi.mock("../admin-notify-service.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, notifyAdmin: vi.fn(async () => {}) };
});

import { notifyAdmin, formatAdminEvent } from "../admin-notify-service.js";
import { notifyRedFindings, noteRecoveries, __reset as resetNotify, __setClock as setNotifyClock } from "./notify.js";
import type { GozcuCheckResult } from "./types.js";

function red(name: string): GozcuCheckResult {
  return { name, domain: "uptime", signalSource: "test", measured: "x", threshold: "y", severity: "red" };
}

describe("gozcu delivery", () => {
  let now = 0;
  beforeEach(() => {
    now = 1_000_000 * 60_000;
    resetNotify();
    setNotifyClock(() => now);
    vi.mocked(notifyAdmin).mockClear();
  });

  it("formatAdminEvent sistem_uyarisi red → 🔴, yellow → 🟡", () => {
    expect(formatAdminEvent({ kind: "sistem_uyarisi", severity: "red", title: "x" })).toMatch(/^🔴/);
    expect(formatAdminEvent({ kind: "sistem_uyarisi", severity: "yellow", title: "x" })).toMatch(/^🟡/);
  });

  it("aynı dedup_key cooldown içinde yalnız 1 kez bildirir", async () => {
    await notifyRedFindings([red("db_pool_health")]);
    await notifyRedFindings([red("db_pool_health")]); // cooldown içinde → atlanır
    expect(vi.mocked(notifyAdmin)).toHaveBeenCalledTimes(1);
  });

  it("cooldown geçince yeniden bildirir", async () => {
    await notifyRedFindings([red("db_pool_health")]);
    now += 61 * 60 * 1000; // > 60 dk
    await notifyRedFindings([red("db_pool_health")]);
    expect(vi.mocked(notifyAdmin)).toHaveBeenCalledTimes(2);
  });

  it("yalnız kırmızıları bildirir (yellow/green atlanır)", async () => {
    const yellow: GozcuCheckResult = { ...red("x"), severity: "yellow" };
    const green: GozcuCheckResult = { ...red("y"), severity: "green" };
    await notifyRedFindings([yellow, green]);
    expect(vi.mocked(notifyAdmin)).not.toHaveBeenCalled();
  });

  it("recovery (green) cooldown'ı sıfırlar → red→green→red tekrar bildirir", async () => {
    await notifyRedFindings([red("db_pool_health")]);
    expect(vi.mocked(notifyAdmin)).toHaveBeenCalledTimes(1);
    noteRecoveries([{ ...red("db_pool_health"), severity: "green" }]); // green recovery
    await notifyRedFindings([red("db_pool_health")]); // cooldown içinde ama recovery oldu → bildirir
    expect(vi.mocked(notifyAdmin)).toHaveBeenCalledTimes(2);
  });
});
