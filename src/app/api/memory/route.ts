import { NextRequest, NextResponse } from "next/server";
import { securityHeaders, SaveNoteSchema, redactKeys } from "@/lib/security";
import { saveNote, listNotes, searchNotes, NoteNotFoundError } from "@/lib/memory";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const headers = securityHeaders();

  try {
    const q = req.nextUrl.searchParams.get("q");
    if (q && q.trim()) {
      const results = searchNotes(q);
      return NextResponse.json({ results }, { headers });
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
          message: parsed.error.errors[0]?.message ?? "Invalid request",
        },
      },
      { status: 400, headers }
    );
  }

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
