/**
 * Unit tests for Local-provider rejection when HOSTED_DEMO=true.
 * These test the route-layer logic by calling the route handler directly.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// We import the route module after stubbing env vars so the env is correct
// at the time the module runs any module-level code.  Route handlers are
// functions so we can call them directly without a real HTTP server.
// ---------------------------------------------------------------------------

async function buildChatRequest(body: unknown, hosted: boolean) {
  vi.stubEnv("HOSTED_DEMO", hosted ? "true" : "false");
  vi.stubEnv("RATE_LIMIT", "false");

  // Dynamic import after env setup so the module picks up the env on each
  // test run via process.env reads inside the handler.
  const { POST } = await import("../src/app/api/chat/route.js");

  const req = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Next.js NextRequest wraps the standard Request; here we pass a plain
  // Request cast to NextRequest — the handler only calls .json() and
  // .headers, which are available on plain Request.
  return POST(req as unknown as import("next/server").NextRequest);
}

describe("POST /api/chat — Local provider rejection in hosted mode", () => {
  beforeEach(() => {
    // Ensure rate-limit store is clean
    vi.stubEnv("RATE_LIMIT", "false");
  });

  it("returns 403 LOCAL_DISABLED when providerId=local and HOSTED_DEMO=true", async () => {
    const res = await buildChatRequest(
      {
        providerId: "local",
        model: "llama3",
        messages: [{ role: "user", content: "hello" }],
      },
      true
    );
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("LOCAL_DISABLED");
  });

  it("allows local provider when HOSTED_DEMO is not set", async () => {
    // We only test that the request gets past the guard (it'll fail with
    // SSRF or missing baseUrl, but not 403 LOCAL_DISABLED).
    const res = await buildChatRequest(
      {
        providerId: "local",
        model: "llama3",
        messages: [{ role: "user", content: "hello" }],
        baseUrl: "http://localhost:11434",
      },
      false
    );
    // Should not be 403
    expect(res.status).not.toBe(403);
  });

  it("allows demo provider regardless of HOSTED_DEMO", async () => {
    const res = await buildChatRequest(
      {
        providerId: "demo",
        model: "demo",
        messages: [{ role: "user", content: "hello" }],
      },
      true
    );
    expect(res.status).toBe(200);
  });
});
