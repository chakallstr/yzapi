import { describe, it, expect, afterEach } from "vitest";
import { isKiroRestrictedModel, isKiroBetaUser, packageGrantsRestrictedModel, isKiroBetaPackage } from "./kiro-beta-service.js";

const ORIG_U = process.env.KIRO_BETA_USER_IDS;
const ORIG_M = process.env.KIRO_RESTRICTED_MODELS;
afterEach(() => {
  if (ORIG_U === undefined) delete process.env.KIRO_BETA_USER_IDS; else process.env.KIRO_BETA_USER_IDS = ORIG_U;
  if (ORIG_M === undefined) delete process.env.KIRO_RESTRICTED_MODELS; else process.env.KIRO_RESTRICTED_MODELS = ORIG_M;
});

describe("isKiroRestrictedModel", () => {
  it("flags the default restricted id opus-4.8 (case-insensitive)", () => {
    delete process.env.KIRO_RESTRICTED_MODELS;
    expect(isKiroRestrictedModel("opus-4.8")).toBe(true);
    expect(isKiroRestrictedModel("Opus-4.8")).toBe(true);
    expect(isKiroRestrictedModel("OPUS-4.8")).toBe(true);
  });
  it("still flags leftover beta- ids (safety fallback)", () => {
    expect(isKiroRestrictedModel("beta-opus-4.8")).toBe(true);
  });
  it("does NOT flag the public claude-opus-4.8 or other models", () => {
    for (const id of ["claude-opus-4.8", "claude-sonnet-4.5", "gpt-5.6", "auto", "gemini-2.5-pro"]) {
      expect(isKiroRestrictedModel(id)).toBe(false);
    }
  });
  it("honors a custom KIRO_RESTRICTED_MODELS list", () => {
    process.env.KIRO_RESTRICTED_MODELS = "opus-4.8, sonnet-5";
    expect(isKiroRestrictedModel("sonnet-5")).toBe(true);
    expect(isKiroRestrictedModel("opus-4.8")).toBe(true);
    expect(isKiroRestrictedModel("haiku-4.5")).toBe(false);
  });
  it("null/undefined/empty safe", () => {
    expect(isKiroRestrictedModel(null)).toBe(false);
    expect(isKiroRestrictedModel(undefined)).toBe(false);
    expect(isKiroRestrictedModel("")).toBe(false);
  });
});

describe("packageGrantsRestrictedModel", () => {
  it("true when allowed_models contains a restricted id", () => {
    expect(packageGrantsRestrictedModel(["opus-4.8"])).toBe(true);
    expect(packageGrantsRestrictedModel(["gpt-5.6", "opus-4.8"])).toBe(true);
  });
  it("false for public-only packages", () => {
    expect(packageGrantsRestrictedModel(["claude-opus-4.8"])).toBe(false);
    expect(packageGrantsRestrictedModel(["gpt-5.6"])).toBe(false);
    expect(packageGrantsRestrictedModel([])).toBe(false);
    expect(packageGrantsRestrictedModel(null)).toBe(false);
    expect(packageGrantsRestrictedModel("nope")).toBe(false);
  });
});

describe("isKiroBetaPackage", () => {
  const O = process.env.KIRO_BETA_PACKAGE_IDS;
  afterEach(() => { if (O === undefined) delete process.env.KIRO_BETA_PACKAGE_IDS; else process.env.KIRO_BETA_PACKAGE_IDS = O; });
  it("flags the default opus package (env can't turn it off)", () => {
    delete process.env.KIRO_BETA_PACKAGE_IDS;
    expect(isKiroBetaPackage("beta-opus-500-24h")).toBe(true);
    process.env.KIRO_BETA_PACKAGE_IDS = "";
    expect(isKiroBetaPackage("beta-opus-500-24h")).toBe(true);
  });
  it("does not flag public packages", () => {
    expect(isKiroBetaPackage("yeni-uye-30")).toBe(false);
    expect(isKiroBetaPackage("glm-kimi-500-30g")).toBe(false);
    expect(isKiroBetaPackage(null)).toBe(false);
  });
  it("honors extra ids from env", () => {
    process.env.KIRO_BETA_PACKAGE_IDS = "another-kiro-pkg";
    expect(isKiroBetaPackage("another-kiro-pkg")).toBe(true);
    expect(isKiroBetaPackage("beta-opus-500-24h")).toBe(true);
  });
});

describe("isKiroBetaUser", () => {
  it("empty/unset allowlist denies everyone (fail-closed)", () => {
    delete process.env.KIRO_BETA_USER_IDS;
    expect(isKiroBetaUser("d76e275b-b6fb-4c75-8416-b5e6eb72fa4b")).toBe(false);
  });
  it("allows a listed user, denies others (case-insensitive)", () => {
    process.env.KIRO_BETA_USER_IDS = "d76e275b-b6fb-4c75-8416-b5e6eb72fa4b";
    expect(isKiroBetaUser("d76e275b-b6fb-4c75-8416-b5e6eb72fa4b")).toBe(true);
    expect(isKiroBetaUser("D76E275B-B6FB-4C75-8416-B5E6EB72FA4B")).toBe(true);
    expect(isKiroBetaUser("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
  it("null/undefined userId denied", () => {
    process.env.KIRO_BETA_USER_IDS = "aaa";
    expect(isKiroBetaUser(null)).toBe(false);
    expect(isKiroBetaUser(undefined)).toBe(false);
  });
});
