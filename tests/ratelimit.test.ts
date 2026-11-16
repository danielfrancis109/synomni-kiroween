import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  isRateLimitEnabled,
  clientIp,
  _resetStore,
} from "../src/lib/ratelimit.js";

beforeEach(() => {
  _resetStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkRateLimit — chat bucket", () => {
  it("allows requests under the limit", () => {
    vi.stubEnv("RATE_LIMIT_CHAT_PER_MIN", "5");
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("1.2.3.4", "chat").allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    vi.stubEnv("RATE_LIMIT_CHAT_PER_MIN", "3");
    checkRateLimit("1.2.3.4", "chat");
    checkRateLimit("1.2.3.4", "chat");
    checkRateLimit("1.2.3.4", "chat");
    const result = checkRateLimit("1.2.3.4", "chat");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    vi.stubEnv("RATE_LIMIT_CHAT_PER_MIN", "1");
    expect(checkRateLimit("10.0.0.1", "chat").allowed).toBe(true);
    expect(checkRateLimit("10.0.0.2", "chat").allowed).toBe(true);
    // First IP is now exhausted
    expect(checkRateLimit("10.0.0.1", "chat").allowed).toBe(false);
    // Second IP is also exhausted
    expect(checkRateLimit("10.0.0.2", "chat").allowed).toBe(false);
  });

  it("resets after the window expires", async () => {
    vi.stubEnv("RATE_LIMIT_CHAT_PER_MIN", "1");
    expect(checkRateLimit("5.5.5.5", "chat").allowed).toBe(true);
    expect(checkRateLimit("5.5.5.5", "chat").allowed).toBe(false);

    // Manually manipulate time by moving the store entry's windowStart into the past.
    // We achieve this by patching Date.now for a fresh call after resetting.
    _resetStore();
    const realNow = Date.now;
    // Simulate the window having expired by running 61 s into the future.
    const future = Date.now() + 61_000;
    vi.spyOn(Date, "now").mockReturnValue(future);
    try {
      expect(checkRateLimit("5.5.5.5", "chat").allowed).toBe(true);
    } finally {
      vi.spyOn(Date, "now").mockImplementation(realNow);
    }
  });
});

describe("checkRateLimit — write bucket", () => {
  it("uses RATE_LIMIT_WRITE_PER_MIN env var", () => {
    vi.stubEnv("RATE_LIMIT_WRITE_PER_MIN", "2");
    expect(checkRateLimit("7.7.7.7", "write").allowed).toBe(true);
    expect(checkRateLimit("7.7.7.7", "write").allowed).toBe(true);
    expect(checkRateLimit("7.7.7.7", "write").allowed).toBe(false);
  });

  it("write and chat buckets are independent for the same IP", () => {
    vi.stubEnv("RATE_LIMIT_WRITE_PER_MIN", "1");
    vi.stubEnv("RATE_LIMIT_CHAT_PER_MIN", "1");
    expect(checkRateLimit("8.8.8.8", "write").allowed).toBe(true);
    expect(checkRateLimit("8.8.8.8", "chat").allowed).toBe(true);
    // Both now exhausted independently
    expect(checkRateLimit("8.8.8.8", "write").allowed).toBe(false);
    expect(checkRateLimit("8.8.8.8", "chat").allowed).toBe(false);
  });
});

describe("isRateLimitEnabled", () => {
  it("returns false by default", () => {
    vi.stubEnv("HOSTED_DEMO", "");
    vi.stubEnv("RATE_LIMIT", "");
    expect(isRateLimitEnabled()).toBe(false);
  });

  it("returns true when HOSTED_DEMO=true", () => {
    vi.stubEnv("HOSTED_DEMO", "true");
    expect(isRateLimitEnabled()).toBe(true);
  });

  it("returns true when RATE_LIMIT=true", () => {
    vi.stubEnv("HOSTED_DEMO", "");
    vi.stubEnv("RATE_LIMIT", "true");
    expect(isRateLimitEnabled()).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the last x-forwarded-for entry (the proxy-set one; earlier entries are client-controlled)", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(h)).toBe("5.6.7.8");
  });

  it("falls back to unknown when header is absent", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("handles a single IP without a comma", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9" });
    expect(clientIp(h)).toBe("9.9.9.9");
  });
});
