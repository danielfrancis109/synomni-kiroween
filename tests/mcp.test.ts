import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We mock memory functions before importing MCP handlers
vi.mock("../src/lib/memory.js", () => ({
  saveNote: vi.fn(),
  listNotes: vi.fn(),
  retrieveNote: vi.fn(),
  searchNotes: vi.fn(),
  NoteNotFoundError: class NoteNotFoundError extends Error {
    constructor(id: string) {
      super(`Note not found: ${id}`);
      this.name = "NoteNotFoundError";
    }
  },
}));

import * as memoryMod from "../src/lib/memory.js";
import {
  handleSaveMemory,
  handleListNotes,
  handleRetrieveContext,
  handleSearchMemory,
} from "../cli/mcp.js";
import type { Note, NoteListItem, SearchResult } from "../src/lib/memory.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "test-id-1",
    title: "Test Note",
    content: "Test content",
    createdAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// save_memory handler
// ---------------------------------------------------------------------------

describe("handleSaveMemory", () => {
  it("calls saveNote and returns MCP content shape", async () => {
    const note = makeNote();
    vi.mocked(memoryMod.saveNote).mockResolvedValueOnce(note);

    const result = await handleSaveMemory({ title: "Test Note", content: "Test content" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.id).toBe("test-id-1");
    expect(parsed.title).toBe("Test Note");
  });
});

// ---------------------------------------------------------------------------
// list_notes handler
// ---------------------------------------------------------------------------

describe("handleListNotes", () => {
  it("calls listNotes and returns correct MCP content shape", () => {
    const items: NoteListItem[] = [
      { id: "1", title: "A", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "2", title: "B", createdAt: "2026-01-02T00:00:00.000Z" },
    ];
    vi.mocked(memoryMod.listNotes).mockReturnValueOnce(items);

    const result = handleListNotes();

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// retrieve_context handler
// ---------------------------------------------------------------------------

describe("handleRetrieveContext", () => {
  it("retrieves a note and returns it in content", async () => {
    const note = makeNote();
    vi.mocked(memoryMod.retrieveNote).mockReturnValueOnce(note);

    const result = await handleRetrieveContext({ id: "test-id-1" });

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.note.id).toBe("test-id-1");
    expect(parsed.synomni).toBeUndefined();
  });

  it("merges Synomni result when token provided (mocked HTTP)", async () => {
    const note = makeNote();
    vi.mocked(memoryMod.retrieveNote).mockReturnValueOnce(note);

    const mockSynomniData = { context: ["Synomni context snippet"] };
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockSynomniData), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await handleRetrieveContext({
      id: "test-id-1",
      synomniToken: "omk_test_token_placeholder",
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.note.id).toBe("test-id-1");
    expect(parsed.synomni).toEqual(mockSynomniData);

    vi.unstubAllGlobals();
  });

  it("gracefully degrades when Synomni fetch fails", async () => {
    const note = makeNote();
    vi.mocked(memoryMod.retrieveNote).mockReturnValueOnce(note);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Network error")));

    const result = await handleRetrieveContext({
      id: "test-id-1",
      synomniToken: "omk_test_token_placeholder",
    });

    const parsed = JSON.parse(result.content[0]!.text);
    // Note returned, synomni absent (degraded gracefully)
    expect(parsed.note).toBeDefined();
    expect(parsed.synomni).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("returns error content when note not found", async () => {
    vi.mocked(memoryMod.retrieveNote).mockImplementationOnce(() => {
      const err = new Error("Note not found: bad-id");
      err.name = "NoteNotFoundError";
      throw err;
    });

    const result = await handleRetrieveContext({ id: "bad-id" });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// search_memory handler
// ---------------------------------------------------------------------------

describe("handleSearchMemory", () => {
  it("calls searchNotes and returns results in content", () => {
    const results: SearchResult[] = [
      {
        note: { id: "1", title: "Relevant", createdAt: "2026-01-01T00:00:00.000Z" },
        score: 0.5,
      },
    ];
    vi.mocked(memoryMod.searchNotes).mockReturnValueOnce(results);

    const result = handleSearchMemory({ query: "relevant" });

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].note.title).toBe("Relevant");
    expect(parsed[0].score).toBeCloseTo(0.5);
  });

  it("returns empty array when nothing matches", () => {
    vi.mocked(memoryMod.searchNotes).mockReturnValueOnce([]);

    const result = handleSearchMemory({ query: "nothing" });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toEqual([]);
  });
});
