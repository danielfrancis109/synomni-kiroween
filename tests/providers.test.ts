import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DemoProvider,
  fetchWithTimeout,
  ProviderTimeoutError,
  ProviderHTTPError,
  getProvider,
} from "../src/lib/providers.js";

// ---------------------------------------------------------------------------
// Demo provider — determinism
// ---------------------------------------------------------------------------

describe("DemoProvider", () => {
  const demo = new DemoProvider();

  it("returns the same output for identical inputs", async () => {
    const messages = [{ role: "user" as const, content: "Hello world" }];
    const opts = { model: "demo" };
    const a = await demo.complete(messages, opts);
    const b = await demo.complete(messages, opts);
    expect(a).toBe(b);
  });

  it("returns different output for different inputs", async () => {
    const opts = { model: "demo" };
    // Use inputs with different hash values to get different template indices
    const results = new Set<string>();
    const inputs = [
      "short",
      "a bit longer message",
      "this is a much longer message that should hash differently and pick a different template index from the ones above",
      "another completely different message for good measure to populate the set",
      "yet one more unique message string to ensure variety in demo outputs",
    ];
    for (const content of inputs) {
      const r = await demo.complete(
        [{ role: "user", content }],
        opts
      );
      results.add(r);
    }
    // With 5 inputs across 5 templates, expect at least 2 distinct outputs
    expect(results.size).toBeGreaterThanOrEqual(2);
  });

  it("returns a non-empty string", async () => {
    const r = await demo.complete(
      [{ role: "user", content: "test" }],
      { model: "demo" }
    );
    expect(typeof r).toBe("string");
    expect(r.length).toBeGreaterThan(0);
  });

  it("is deterministic across separate instances", async () => {
    const d1 = new DemoProvider();
    const d2 = new DemoProvider();
    const messages = [{ role: "user" as const, content: "reproducibility check" }];
    const opts = { model: "demo" };
    expect(await d1.complete(messages, opts)).toBe(
      await d2.complete(messages, opts)
    );
  });
});

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves when fetch returns quickly", async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(mockResponse));

    const result = await fetchWithTimeout("http://example.com", {}, 5000);
    expect(result.status).toBe(200);
  });

  it("throws ProviderTimeoutError when fetch is too slow", async () => {
    // fetch never resolves
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (signal) {
              signal.addEventListener("abort", () => {
                const err = new DOMException("Aborted", "AbortError");
                reject(err);
              });
            }
          })
      )
    );

    const promise = fetchWithTimeout("http://example.com", {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});

// ---------------------------------------------------------------------------
// HTTP error mapping
// ---------------------------------------------------------------------------

describe("HTTP error mapping via OpenAI-compatible provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function callWithStatus(status: number): Promise<ProviderHTTPError> {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("{}", { status }))
    );
    const { OpenAIProvider } = await import("../src/lib/providers.js");
    const provider = new OpenAIProvider();
    try {
      await provider.complete(
        [{ role: "user", content: "test" }],
        { model: "gpt-4", apiKey: "sk-test" }
      );
      throw new Error("Expected ProviderHTTPError");
    } catch (err) {
      if (err instanceof ProviderHTTPError) return err;
      throw err;
    }
  }

  it("maps 401 to 'Invalid or missing API key'", async () => {
    const err = await callWithStatus(401);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/key/i);
  });

  it("maps 429 to 'Rate limit exceeded'", async () => {
    const err = await callWithStatus(429);
    expect(err.status).toBe(429);
    expect(err.message).toMatch(/rate limit/i);
  });

  it("maps 500 to 'Provider internal server error'", async () => {
    const err = await callWithStatus(500);
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/internal/i);
  });
});

// ---------------------------------------------------------------------------
// getProvider factory
// ---------------------------------------------------------------------------

describe("getProvider", () => {
  it("returns a DemoProvider for id 'demo'", () => {
    const p = getProvider("demo");
    expect(p).toBeInstanceOf(DemoProvider);
  });

  it("throws for unknown provider id", () => {
    expect(() => getProvider("unknown" as never)).toThrow();
  });
});
