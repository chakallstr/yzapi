import { afterEach, describe, expect, it } from "vitest";
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from "undici";

import { installUpstreamDispatcher, upstreamDispatcher } from "./upstream-dispatcher.js";

// The LIVE incident (2026-06-04) was undici's DEFAULT 10s connectTimeout firing while
// Popusk was slow to accept a new TLS connection. The default global dispatcher has no
// keep-alive reuse and a 10s connect ceiling. This module installs a custom dispatcher
// with a raised connect timeout + a warm keep-alive pool so cold handshakes (and the
// connect-timeout 500s) become rare.

describe("upstream dispatcher", () => {
  const original = getGlobalDispatcher();
  afterEach(() => setGlobalDispatcher(original));

  it("is a custom undici Agent (raised connect timeout + keep-alive pool)", () => {
    expect(upstreamDispatcher).toBeInstanceOf(Agent);
  });

  it("installUpstreamDispatcher() makes it the global fetch dispatcher", () => {
    expect(getGlobalDispatcher()).not.toBe(upstreamDispatcher);
    installUpstreamDispatcher();
    expect(getGlobalDispatcher()).toBe(upstreamDispatcher);
  });
});
