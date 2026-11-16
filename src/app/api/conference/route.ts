import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { securityHeaders, redactKeys } from "@/lib/security";
import { getProvider, ProviderTimeoutError, ProviderHTTPError } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";
import {
  nextAgentIndex,
  isComplete,
  ConferenceCompleteError,
} from "@/lib/conference";
import type { ConferenceState, Turn } from "@/lib/conference";
import { checkRateLimit, isRateLimitEnabled, clientIp } from "@/lib/ratelimit";

const BODY_SIZE_LIMIT = 256 * 1024; // 256 KB

const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  persona: z.string(),
  providerId: z.string(),
  model: z.string(),
});

const TurnSchema = z.object({
  agentId: z.string(),
  content: z.string(),
  pass: z.boolean(),
  passReason: z.string().optional(),
  timestamp: z.number(),
});

const ConferenceStateSchema = z.object({
  agents: z.array(AgentSchema).min(2).max(3),
  transcript: z.array(TurnSchema),
  policy: z.enum(["round-robin", "open-floor"]),
  maxTurns: z.number().int().positive(),
  topic: z.string().max(500).optional(),
});

const ConferenceRequestSchema = z.object({
  state: ConferenceStateSchema,
  apiKeys: z.record(z.string(), z.string()).optional(),
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

  const parsed = ConferenceRequestSchema.safeParse(body);
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

  const { state, apiKeys } = parsed.data as {
    state: ConferenceState;
    apiKeys?: Record<string, string>;
  };
  const typedState = state;

  // Reject local provider in hosted mode.
  if (hosted) {
    for (const agent of typedState.agents) {
      if (agent.providerId === "local") {
        return NextResponse.json(
          { error: { code: "LOCAL_DISABLED", message: "The Local provider is not available in hosted mode." } },
          { status: 403, headers }
        );
      }
    }
  }

  let agentIdx: number;
  try {
    agentIdx = nextAgentIndex(typedState);
  } catch (err) {
    if (err instanceof ConferenceCompleteError) {
      return NextResponse.json(
        { complete: true, updatedState: typedState },
        { headers }
      );
    }
    throw err;
  }

  const agent = typedState.agents[agentIdx]!;
  const apiKey = apiKeys?.[agent.providerId];

  let provider;
  try {
    provider = getProvider(agent.providerId as ProviderId);
  } catch {
    return NextResponse.json(
      { error: { code: "UNKNOWN_PROVIDER", message: `Unknown provider: ${agent.providerId}` } },
      { status: 400, headers }
    );
  }

  // Build transcript messages for this agent's context
  const passRule =
    'If you have nothing new to add, reply exactly "PASS: <one-line reason>" instead of speaking.';
  const systemMsg = [
    {
      role: "system" as const,
      content: `You are ${agent.name} in a moderated conference.${agent.persona ? ` ${agent.persona}` : ""} ${passRule}`,
    },
  ];
  const transcriptMsgs = typedState.transcript.map((t) => {
    const speaker = typedState.agents.find((a) => a.id === t.agentId);
    return {
      role: "user" as const,
      content: t.pass
        ? `${speaker?.name ?? "Unknown"}: PASS — ${t.passReason ?? "nothing to add"}`
        : `${speaker?.name ?? "Unknown"}: ${t.content}`,
    };
  });

  // Build the final user turn: include topic if set, then "Your turn, <Name>."
  const topicPrefix = typedState.topic
    ? `Topic: ${typedState.topic}\n\n`
    : "";
  const yourTurn = `${topicPrefix}Your turn, ${agent.name}.`;

  const messages = [...systemMsg, ...transcriptMsgs, { role: "user" as const, content: yourTurn }];

  try {
    const rawContent = await provider.complete(messages, {
      model: agent.model,
      apiKey,
      // In hosted mode, never use a client-supplied baseUrl.
      baseUrl: hosted ? undefined : undefined,
      timeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000),
    });

    // Parse PASS: <reason> replies (10.5)
    const passMatch = rawContent.match(/^PASS:\s*(.+)/is);
    const isPass = passMatch !== null;
    const passReason = passMatch ? passMatch[1]!.trim().slice(0, 300) : undefined;

    const turn: Turn = {
      agentId: agent.id,
      content: isPass ? "" : rawContent,
      pass: isPass,
      passReason,
      timestamp: Date.now(),
    };

    const updatedState: ConferenceState = {
      ...typedState,
      transcript: [...typedState.transcript, turn],
    };

    return NextResponse.json(
      { turn, updatedState, complete: isComplete(updatedState) },
      { headers }
    );
  } catch (err) {
    if (err instanceof ProviderTimeoutError) {
      return NextResponse.json(
        { error: { code: "PROVIDER_TIMEOUT", message: "Provider timeout" } },
        { status: 504, headers }
      );
    }
    if (err instanceof ProviderHTTPError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 502, headers }
      );
    }

    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[conference]", redactKeys(message));

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            process.env.NODE_ENV === "production"
              ? "Internal server error"
              : redactKeys(message),
        },
      },
      { status: 500, headers }
    );
  }
}
