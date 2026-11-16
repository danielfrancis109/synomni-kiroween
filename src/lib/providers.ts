import { validateLocalUrl } from "./security.js";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompleteOpts {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface Provider {
  complete(messages: Message[], opts: CompleteOpts): Promise<string>;
}

export type ProviderId = "demo" | "anthropic" | "openai" | "xai" | "local";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ProviderTimeoutError extends Error {
  code = "PROVIDER_TIMEOUT";
  constructor() {
    super("Provider timeout");
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderHTTPError extends Error {
  code: string;
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderHTTPError";
    this.status = status;
    this.code = `HTTP_${status}`;
  }
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function mapHttpStatus(status: number): ProviderHTTPError {
  switch (status) {
    case 401:
      return new ProviderHTTPError(401, "Invalid or missing API key");
    case 429:
      return new ProviderHTTPError(429, "Rate limit exceeded");
    case 500:
      return new ProviderHTTPError(500, "Provider internal server error");
    case 503:
      return new ProviderHTTPError(503, "Provider service unavailable");
    default:
      return new ProviderHTTPError(status, `Provider returned HTTP ${status}`);
  }
}

// ---------------------------------------------------------------------------
// Demo provider — deterministic, no network
// ---------------------------------------------------------------------------

const DEMO_PERSONAS: Record<string, string[]> = {
  default: [
    "As the Demo AI, I find this prompt fascinating. The answer lies in careful analysis.",
    "Demo perspective: This is a classic problem. The key insight is modularity.",
    "The Demo model responds: Consider the trade-offs carefully before proceeding.",
    "Demo says: Great question! Empirical observation and reasoning lead to this conclusion.",
    "From the Demo AI: The simplest approach is often the most effective one.",
  ],
  scientist: [
    "Laboratory data suggests the hypothesis holds under controlled conditions.",
    "Empirical analysis complete. Results indicate a statistically significant pattern.",
    "Scientific consensus: Further experimentation would strengthen these findings.",
  ],
  philosopher: [
    "The question itself reveals a deeper truth about the nature of inquiry.",
    "Socratic method applied: What do we mean when we ask this?",
    "Philosophy tells us: the examined premise is worth challenging.",
  ],
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export class DemoProvider implements Provider {
  async complete(messages: Message[], _opts: CompleteOpts): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const seed = lastUser ? lastUser.content : "default";
    const persona = _opts.model?.includes("philosopher")
      ? "philosopher"
      : _opts.model?.includes("scientist")
      ? "scientist"
      : "default";
    const templates = DEMO_PERSONAS[persona] ?? DEMO_PERSONAS["default"]!;
    const idx = hashString(seed) % templates.length;
    return templates[idx]!;
  }
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

export class AnthropicProvider implements Provider {
  async complete(messages: Message[], opts: CompleteOpts): Promise<string> {
    const timeoutMs =
      opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000);
    const system = messages.find((m) => m.role === "system")?.content;
    const userMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: 1024,
      messages: userMessages,
    };
    if (system) body.system = system;

    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": opts.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      timeoutMs
    );

    if (!response.ok) throw mapHttpStatus(response.status);

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible base class
// ---------------------------------------------------------------------------

class OpenAICompatibleProvider implements Provider {
  constructor(protected readonly endpoint: string) {}

  async complete(messages: Message[], opts: CompleteOpts): Promise<string> {
    const timeoutMs =
      opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000);

    const response = await fetchWithTimeout(
      this.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey ?? ""}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      },
      timeoutMs
    );

    if (!response.ok) throw mapHttpStatus(response.status);

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message.content ?? "";
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super("https://api.openai.com/v1/chat/completions");
  }
}

export class XAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super("https://api.x.ai/v1/chat/completions");
  }
}

// ---------------------------------------------------------------------------
// Local provider — SSRF guarded
// ---------------------------------------------------------------------------

export class LocalProvider implements Provider {
  async complete(messages: Message[], opts: CompleteOpts): Promise<string> {
    const baseUrl = opts.baseUrl ?? "http://localhost:11434";
    validateLocalUrl(baseUrl);
    const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const timeoutMs =
      opts.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? 30000);

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey ?? "none"}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      },
      timeoutMs
    );

    if (!response.ok) throw mapHttpStatus(response.status);

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message.content ?? "";
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const providerInstances: Partial<Record<ProviderId, Provider>> = {};

export function getProvider(id: ProviderId): Provider {
  if (!providerInstances[id]) {
    switch (id) {
      case "demo":
        providerInstances[id] = new DemoProvider();
        break;
      case "anthropic":
        providerInstances[id] = new AnthropicProvider();
        break;
      case "openai":
        providerInstances[id] = new OpenAIProvider();
        break;
      case "xai":
        providerInstances[id] = new XAIProvider();
        break;
      case "local":
        providerInstances[id] = new LocalProvider();
        break;
      default:
        throw new Error(`Unknown provider: ${id as string}`);
    }
  }
  return providerInstances[id]!;
}
