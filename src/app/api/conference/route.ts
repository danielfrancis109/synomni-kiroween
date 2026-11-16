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
});

const ConferenceRequestSchema = z.object({
  state: ConferenceStateSchema,
  apiKeys: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const headers = securityHeaders();

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
          message: parsed.error.errors[0]?.message ?? "Invalid request",
        },
      },
      { status: 400, headers }
    );
  }

  const { state, apiKeys } = parsed.data;
  const typedState = state as ConferenceState;

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
  const systemMsg = agent.persona
    ? [{ role: "system" as const, content: agent.persona }]
    : [];
  const transcriptMsgs = typedState.transcript.map((t) => {
    const speaker = typedState.agents.find((a) => a.id === t.agentId);
    return {
      role: "user" as const,
      content: `${speaker?.name ?? "Unknown"}: ${t.content}`,
    };
  });
  const messages = [...systemMsg, ...transcriptMsgs, { role: "user" as const, content: "Your turn." }];

  try {
    const content = await provider.complete(messages, {
      model: agent.model,
      apiKey,
      timeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000),
    });

    const turn: Turn = {
      agentId: agent.id,
      content,
      pass: false,
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
