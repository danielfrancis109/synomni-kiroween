import { NextRequest, NextResponse } from "next/server";
import { securityHeaders, SaveNoteSchema, redactKeys } from "@/lib/security";
import {
  saveNote,
  listNotes,
  searchNotes,
  saveNoteForSession,
  listNotesForSession,
  searchNotesForSession,
  MemoryFullError,
  runSessionCleanupIfDue,
} from "@/lib/memory";
import { checkRateLimit, isRateLimitEnabled, clientIp } from "@/lib/ratelimit";
import { randomUUID } from "node:crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COOKIE = "chamber_sid";
const BODY_SIZE_LIMIT = 256 * 1024;

function isHosted(): boolean {
  return process.env.HOSTED_DEMO === "true";
}

/** Extract validated session ID from request cookies, or null if absent/invalid. */
function getSessionId(req: NextRequest): string | null {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid || !UUID_RE.test(sid)) return null;
  return sid;
}

/** Build Set-Cookie header for a new session. */
function newSessionCookie(sid: string): string {
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const headers = securityHeaders();

  if (isHosted()) {
    runSessionCleanupIfDue();

    let sid = getSessionId(req);
    const isNewSession = !sid;
    if (!sid) sid = randomUUID();

    const q = req.nextUrl.searchParams.get("q");
    let notes;
    try {
      if (q && q.trim()) {
        const results = searchNotesForSession(sid, q);
        notes = results.map((r) => r.note);
      } else {
        notes = listNotesForSession(sid);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[memory:GET:hosted]", redactKeys(message));
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
        { status: 500, headers }
      );
    }

    const responseHeaders: Record<string, string> = { ...headers };
    if (isNewSession) {
      responseHeaders["Set-Cookie"] = newSessionCookie(sid);
    }
    return NextResponse.json({ notes }, { headers: responseHeaders });
  }

  // Non-hosted: original behaviour
  try {
    const q = req.nextUrl.searchParams.get("q");
    if (q && q.trim()) {
      const results = searchNotes(q);
      const notes = results.map((r) => r.note);
      return NextResponse.json({ notes }, { headers });
    }
    const notes = listNotes();
    return NextResponse.json({ notes }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[memory:GET]", redactKeys(message));
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500, headers }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const headers = securityHeaders();
  const hosted = isHosted();

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

  // Rate limiting for writes
  if (isRateLimitEnabled()) {
    const ip = clientIp(req.headers);
    const result = checkRateLimit(ip, "write");
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

  const parsed = SaveNoteSchema.safeParse(body);
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

  if (hosted) {
    runSessionCleanupIfDue();

    let sid = getSessionId(req);
    const isNewSession = !sid;
    if (!sid) sid = randomUUID();

    try {
      const note = await saveNoteForSession(sid, parsed.data.title, parsed.data.content);
      const responseHeaders: Record<string, string> = { ...headers };
      if (isNewSession) {
        responseHeaders["Set-Cookie"] = newSessionCookie(sid);
      }
      return NextResponse.json({ note }, { status: 201, headers: responseHeaders });
    } catch (err) {
      if (err instanceof MemoryFullError) {
        return NextResponse.json(
          { error: { code: "MEMORY_FULL", message: err.message } },
          { status: 409, headers }
        );
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[memory:POST:hosted]", redactKeys(message));
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
        { status: 500, headers }
      );
    }
  }

  // Non-hosted: original behaviour
  try {
    const note = await saveNote(parsed.data.title, parsed.data.content);
    return NextResponse.json({ note }, { status: 201, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[memory:POST]", redactKeys(message));
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500, headers }
    );
  }
}
