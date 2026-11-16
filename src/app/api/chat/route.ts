import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MessagesSchema, securityHeaders, redactKeys } from "@/lib/security";
import { getProvider, ProviderTimeoutError, ProviderHTTPError } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import { checkRateLimit, isRateLimitEnabled, clientIp } from "@/lib/ratelimit";

const BODY_SIZE_LIMIT = 256 * 1024; // 256 KB

const ChatRequestSchema = z.object({
  messages: MessagesSchema,
  providerId: z.string(),
  model: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const headers = securityHeaders();
  const hosted = process.env.HOSTED_DEMO === "true";

  // Body size guard (hosted mode)
  if (hosted) {
    const contentLength = req.headers.get("content-length");
    if (contentLength && Number(contentLength) > BODY_SIZE_LIMIT) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 256 KB limit" } },
        { status: 413, headers }
      );
    }
  }

  // Rate limiting
  if (isRateLimitEnabled()) {
    const ip = clientIp(req.headers);
    const result = checkRateLimit(ip, "chat");
    if (!result.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Rate limit exceeded. Try again shortly." } },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": String(result.retryAfterSeconds),
          },
        }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400, headers }
    );
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid request",
        },
      },
      { status: 400, headers }
    );
  }

  const { messages, providerId, model, apiKey } = parsed.data;
  // In hosted mode, ignore any client-supplied baseUrl for security.
  const baseUrl = hosted ? undefined : parsed.data.baseUrl;

  // Reject local provider in hosted mode.
  if (hosted && providerId === "local") {
    return NextResponse.json(
      { error: { code: "LOCAL_DISABLED", message: "The Local provider is not available in hosted mode." } },
      { status: 403, headers }
    );
  }

  let provider;
  try {
    provider = getProvider(providerId as ProviderId);
  } catch {
    return NextResponse.json(
      { error: { code: "UNKNOWN_PROVIDER", message: `Unknown provider: ${providerId}` } },
      { status: 400, headers }
    );
  }

  try {
    const content = await provider.complete(
      messages.map((m) => ({ role: m.role, content: m.content })),
      {
        model,
        apiKey,
        baseUrl,
        timeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000),
      }
    );
    return NextResponse.json({ content }, { headers });
  } catch (err) {
    if (err instanceof ProviderTimeoutError) {
      return NextResponse.json(
        { error: { code: "PROVIDER_TIMEOUT", message: "Provider timeout" } },
        { status: 504, headers }
      );
    }
    if (err instanceof ProviderHTTPError) {
      const status = err.status === 401 ? 502 : err.status === 429 ? 429 : 502;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status, headers }
      );
    }

    const message = err instanceof Error ? err.message : "Internal server error";
    const safeMessage = redactKeys(message);
    console.error("[chat]", safeMessage);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            process.env.NODE_ENV === "production"
              ? "Internal server error"
              : safeMessage,
        },
      },
      { status: 500, headers }
    );
  }
}
