import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(32000, "Message content exceeds 32 000 character limit"),
});

export const MessagesSchema = z
  .array(MessageSchema)
  .max(50, "Request exceeds 50 message limit");

export const SaveNoteSchema = z.object({
  title: z.string().min(1).max(200, "Note title exceeds 200 character limit"),
  content: z.string().min(1).max(10000, "Note content exceeds 10 000 character limit"),
});

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self' https://api.anthropic.com https://api.openai.com https://api.x.ai https://synomni.infinitybuilds.download",
    ].join("; "),
  };
}

// ---------------------------------------------------------------------------
// Key redaction
// ---------------------------------------------------------------------------

export function redactKeys(s: string): string {
  return s.replace(/\b(sk-ant-|sk-|omk_|Bearer )\S+/g, "[REDACTED]");
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^0\.0\.0\.0$/,
  /^localhost$/i,
];

function isPrivateOrLoopback(hostname: string): boolean {
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) return true;
  }
  // bare hostname without TLD (no dots and not an IP-like string)
  if (!hostname.includes(".") && !hostname.includes(":")) return true;
  return false;
}

export function validateLocalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SSRFError(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SSRFError(
      `Disallowed URL scheme "${parsed.protocol}". Only http and https are permitted.`
    );
  }

  const allowLocalUrls = process.env.ALLOW_LOCAL_URLS === "true";

  if (!allowLocalUrls && isPrivateOrLoopback(parsed.hostname)) {
    throw new SSRFError(
      `URL resolves to a private or loopback address. Set ALLOW_LOCAL_URLS=true to override.`
    );
  }

  const allowlist = process.env.LOCAL_URL_ALLOWLIST;
  if (allowlist) {
    const allowed = allowlist
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (!allowed.includes(parsed.hostname)) {
      throw new SSRFError(
        `Hostname "${parsed.hostname}" is not in LOCAL_URL_ALLOWLIST.`
      );
    }
  }
}
