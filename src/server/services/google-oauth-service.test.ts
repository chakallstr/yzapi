import { describe, expect, it } from "vitest";

describe("Google OAuth state", () => {
  it("creates a signed state that verifies without in-memory process state", async () => {
    const { createOAuthState, verifyOAuthState } = await import("./google-oauth-service.js");

    const state = createOAuthState(1_000);

    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(40);
    expect(verifyOAuthState(state, 60_000)).toBe(true);
  });

  it("rejects tampered or expired OAuth state values", async () => {
    const { createOAuthState, verifyOAuthState } = await import("./google-oauth-service.js");

    const state = createOAuthState(1_000);
    const [payload, signature] = state.split(".");
    const replacement = payload.startsWith("a") ? "b" : "a";
    const tampered = `${replacement}${payload.slice(1)}.${signature}`;

    expect(verifyOAuthState(tampered, 60_000)).toBe(false);
    expect(verifyOAuthState(state, 6 * 60 * 1000 + 1_001)).toBe(false);
  });
});
