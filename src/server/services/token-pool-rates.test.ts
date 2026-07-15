import { describe, it, expect } from "vitest";
import {
  poolRateUsdPerM,
  poolCacheWeight,
  poolDrainAmount,
  POOL_CACHE_READ_USD_PER_M,
} from "./token-pool-rates.js";

describe("token-pool-rates — cache-read carve-out math", () => {
  it("poolRateUsdPerM: table + default + norm (dot/dash)", () => {
    expect(poolRateUsdPerM("claude-fable-5")).toBe(0.6);
    expect(poolRateUsdPerM("gpt-5-6-sol")).toBe(0.7);
    expect(poolRateUsdPerM("gpt-5.6-sol")).toBe(0.7); // dot form normalizes
    expect(poolRateUsdPerM("claude-opus-4-8")).toBe(0.5); // not in table → default
    expect(poolRateUsdPerM(null)).toBe(0.5);
    expect(poolRateUsdPerM(undefined)).toBe(0.5);
  });

  it("poolCacheWeight = 0.06 / poolRate, model-form independent", () => {
    // opus/standart $0.50/M → 0.12 ; fable $0.60/M → 0.10 ; gpt-5.6 $0.70/M → ~0.0857
    expect(poolCacheWeight("claude-opus-4-8")).toBeCloseTo(0.12, 6);
    expect(poolCacheWeight("claude-fable-5")).toBeCloseTo(0.1, 6);
    expect(poolCacheWeight("gpt-5-6-sol")).toBeCloseTo(0.085714, 5);
    expect(poolCacheWeight("gpt-5.6-sol")).toBeCloseTo(0.085714, 5); // dot form
    expect(POOL_CACHE_READ_USD_PER_M).toBe(0.06);
  });

  it("poolDrainAmount: cacheWeight omitted → old behavior (full weight, no free cache)", () => {
    // 1000 raw, weight 1.0, no cacheWeight → drains full 1000 (identical to pre-change)
    expect(poolDrainAmount(1000, 1.0)).toBe(1000);
    expect(poolDrainAmount(1000, 1.0, 800 /* cacheRead */ /* no cacheWeight */)).toBe(1000);
    // secondary weight 0.83, no cacheWeight
    expect(poolDrainAmount(1000, 0.83)).toBe(830);
  });

  it("poolDrainAmount: cache-read subset drains at cacheWeight, rest at weight", () => {
    // raw 1000 (800 cache + 200 non-cache), weight 1.0, cacheWeight 0.12 (opus pool)
    //   = 200*1.0 + 800*0.12 = 200 + 96 = 296
    expect(poolDrainAmount(1000, 1.0, 800, 0.12)).toBe(296);
    // all cache: raw 1000, cache 1000, cacheWeight 0.12 → 0*1 + 1000*0.12 = 120
    expect(poolDrainAmount(1000, 1.0, 1000, 0.12)).toBe(120);
    // fable pool cacheWeight 0.10: 200*1 + 800*0.10 = 280
    expect(poolDrainAmount(1000, 1.0, 800, 0.1)).toBe(280);
  });

  it("poolDrainAmount: cache clamped to raw; never negative; rounds to 2dp", () => {
    // cacheRead > raw → clamp to raw (no negative normal)
    expect(poolDrainAmount(500, 1.0, 9999, 0.12)).toBe(60); // 500*0.12
    // zero raw → 0
    expect(poolDrainAmount(0, 1.0, 0, 0.12)).toBe(0);
    // rounding: 333 cache * 0.12 = 39.96
    expect(poolDrainAmount(333, 1.0, 333, 0.12)).toBe(39.96);
  });

  it("poolDrainAmount: secondary model served + cache discount independent of served weight", () => {
    // sonnet (weight 0.83) in opus pool, 1000 raw, 800 cache, cacheWeight 0.12
    //   = 200*0.83 + 800*0.12 = 166 + 96 = 262
    expect(poolDrainAmount(1000, 0.83, 800, 0.12)).toBe(262);
  });
});
