import { NextRequest, NextResponse } from "next/server";
import { securityHeaders, redactKeys } from "@/lib/security";
import {
  deleteNote,
  deleteNoteForSession,
  NoteNotFoundError,
  runSessionCleanupIfDue,
} from "@/lib/memory";
import { checkRateLimit, isRateLimitEnabled, clientIp } from "@/lib/ratelimit";
import { randomUUID } from "node:crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COOKIE = "chamber_sid";

function isHosted(): boolean {
  return process.env.HOSTED_DEMO === "true";
}

function getSessionId(req: NextRequest): string | null {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid || !UUID_RE.test(sid)) return null;
  return sid;
}

function newSessionCookie(sid: string): string {
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax`;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const headers = securityHeaders();
  const hosted = isHosted();
  const { id } = await params;

  // Rate limiting for writes (deletes count as writes)
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

  if (hosted) {
    runSessionCleanupIfDue();

    let sid = getSessionId(req);
    const isNewSession = !sid;
    if (!sid) sid = randomUUID();

    try {
      await deleteNoteForSession(sid, id);
      const responseHeaders: Record<string, string> = { ...headers };
      if (isNewSession) {
        responseHeaders["Set-Cookie"] = newSessionCookie(sid);
      }
      return NextResponse.json({ ok: true }, { headers: responseHeaders });
    } catch (err) {
      if (err instanceof NoteNotFoundError) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: err.message } },
          { status: 404, headers }
        );
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[memory:DELETE:hosted]", redactKeys(message));
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
        { status: 500, headers }
      );
    }
  }

  // Non-hosted: original behaviour
  try {
    await deleteNote(id);
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: err.message } },
        { status: 404, headers }
      );
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[memory:DELETE]", redactKeys(message));
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500, headers }
    );
  }
}
