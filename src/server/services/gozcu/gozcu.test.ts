// Gözcü — saf modül birim testleri (DB gerektirmez; deterministik saat enjekte edilir).

import { describe, it, expect, beforeEach } from "vitest";
import {
  __reset as resetMetrics,
  __setClock as setMetricsClock,
  recordHttp,
  recordAuthFailure,
  recordRateLimited,
  recordUnhandled,
  windowSnapshot,
  hashIp,
} from "./metrics-collector.js";
import {
  __reset as resetHb,
  __setClock as setHbClock,
  markJobsStarted,
  recordHeartbeat,
  snapshotHeartbeats,
} from "./heartbeat.js";

describe("gozcu metrics-collector", () => {
  let now = 0;
  beforeEach(() => {
    now = 1_000_000 * 60_000;
    resetMetrics();
    setMetricsClock(() => now);
  });

  it("aynı dakikada sayar ve 5xx oranını hesaplar", () => {
    for (let i = 0; i < 19; i++) recordHttp(200);
    recordHttp(500);
    const w = windowSnapshot();
    expect(w.total).toBe(20);
    expect(w.s5xx).toBe(1);
    expect(w.s2xx).toBe(19);
    expect(w.fivexxRate).toBeCloseTo(1 / 20, 5);
  });

  it("15 dakikadan eski bucket'ları pencereden düşürür", () => {
    recordHttp(500);
    expect(windowSnapshot().total).toBe(1);
    now += 16 * 60_000;
    expect(windowSnapshot().total).toBe(0);
  });

  it("auth-fail tek-IP yoğunluğunu izler (maxIpFail)", () => {
    const ip = hashIp("1.2.3.4");
    for (let i = 0; i < 7; i++) recordAuthFailure(ip);
    recordAuthFailure(hashIp("9.9.9.9"));
    const w = windowSnapshot();
    expect(w.auth401).toBe(8);
    expect(w.maxIpFail).toBe(7);
  });

  it("429/500 sayaçlarını ayrı tutar", () => {
    recordRateLimited();
    recordRateLimited();
    recordUnhandled();
    const w = windowSnapshot();
    expect(w.rate429).toBe(2);
    expect(w.unhandled500).toBe(1);
  });

  it("IP_CAP aşılınca ipCapExceeded bayrağı set olur (sayaç doğru kalır)", () => {
    for (let i = 0; i < 210; i++) recordAuthFailure(hashIp(`ip_${i}`));
    const w = windowSnapshot();
    expect(w.auth401).toBe(210); // sayaç tüm 401'leri görür
    expect(w.ipCapExceeded).toBe(true); // ama yeni IP'ler izlenemedi → bayrak
  });

  it("hashIp ham IP'yi sızdırmaz ve kararlıdır", () => {
    const h = hashIp("1.2.3.4");
    expect(h).not.toContain("1.2.3.4");
    expect(h).toBe(hashIp("1.2.3.4"));
    expect(h).toHaveLength(16);
  });
});

describe("gozcu heartbeat", () => {
  let now = 0;
  beforeEach(() => {
    now = 1_000_000 * 60_000;
    resetHb();
    setHbClock(() => now);
  });

  it("yeni kaydedilmiş job stale değildir", () => {
    markJobsStarted();
    recordHeartbeat("gozcu-job");
    now += 30_000;
    const gz = snapshotHeartbeats().find((h) => h.job === "gozcu-job");
    expect(gz?.stale).toBe(false);
  });

  it("çalışıp duran job 2×beklenen aşımıyla stale olur", () => {
    markJobsStarted();
    recordHeartbeat("gozcu-job");
    now += 130_000; // > 2×60s
    const gz = snapshotHeartbeats().find((h) => h.job === "gozcu-job");
    expect(gz?.stale).toBe(true);
  });

  it("hiç çalışmamış job, joblar başlatıldıktan makul süre sonra stale olur", () => {
    markJobsStarted();
    now += 130_000;
    const mali = snapshotHeartbeats().find((h) => h.job === "mali-izleme-job");
    expect(mali?.stale).toBe(true);
  });

  it("joblar başlatılmadıysa null-heartbeat stale sayılmaz (test/dev false-positive yok)", () => {
    now += 999_000;
    const mali = snapshotHeartbeats().find((h) => h.job === "mali-izleme-job");
    expect(mali?.stale).toBe(false);
  });
});
