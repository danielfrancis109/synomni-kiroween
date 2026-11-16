import { NextRequest, NextResponse } from "next/server";
import { securityHeaders, redactKeys } from "@/lib/security";
import { deleteNote, NoteNotFoundError } from "@/lib/memory";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const headers = securityHeaders();
  const { id } = await params;

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
