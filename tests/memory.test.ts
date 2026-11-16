/**
 * Memory store tests.
 *
 * We set MEMORY_FILE env var before each test group and clean up after.
 * The module is imported statically; since it reads MEMORY_FILE at call time
 * (not module load time), changing the env var is sufficient to redirect I/O.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  saveNote,
  listNotes,
  retrieveNote,
  deleteNote,
  searchNotes,
  NoteNotFoundError,
} from "../src/lib/memory.js";

let tmpDir: string;
let memFile: string;

function setupTempFile(): void {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-memory-test-"));
  memFile = path.join(tmpDir, "memory.json");
  process.env.MEMORY_FILE = memFile;
}

function teardownTempFile(): void {
  delete process.env.MEMORY_FILE;
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Save → Retrieve round-trip
// ---------------------------------------------------------------------------

describe("memory store: save and retrieve", () => {
  beforeEach(setupTempFile);
  afterEach(teardownTempFile);

  it("saves a note and retrieves it by id", async () => {
    const note = await saveNote("Test Title", "Test content body");
    expect(note.id).toBeTruthy();
    expect(note.title).toBe("Test Title");
    expect(note.content).toBe("Test content body");

    const retrieved = retrieveNote(note.id);
    expect(retrieved).toEqual(note);
  });

  it("throws NoteNotFoundError for unknown id", () => {
    expect(() => retrieveNote("nonexistent-id")).toThrow(NoteNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// List and delete
// ---------------------------------------------------------------------------

describe("memory store: list and delete", () => {
  beforeEach(setupTempFile);
  afterEach(teardownTempFile);

  it("lists all saved notes", async () => {
    await saveNote("Note A", "Content A");
    await saveNote("Note B", "Content B");

    const notes = listNotes();
    expect(notes.length).toBe(2);
    expect(notes.map((n) => n.title).sort()).toEqual(["Note A", "Note B"]);
  });

  it("excludes deleted notes from list", async () => {
    const a = await saveNote("Keep", "content");
    const b = await saveNote("Delete me", "content");

    await deleteNote(b.id);

    const notes = listNotes();
    expect(notes.length).toBe(1);
    expect(notes[0]!.id).toBe(a.id);
  });

  it("throws NoteNotFoundError when deleting non-existent note", async () => {
    await expect(deleteNote("ghost-id")).rejects.toThrow(NoteNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// TF-based search
// ---------------------------------------------------------------------------

describe("memory store: search", () => {
  beforeEach(setupTempFile);
  afterEach(teardownTempFile);

  it("returns empty array when no notes match", async () => {
    await saveNote("Unrelated", "Nothing relevant here");
    const results = searchNotes("zzz nonexistent");
    expect(results).toEqual([]);
  });

  it("returns higher score for more occurrences of query term", async () => {
    // highFreq has 'zebra' many times
    await saveNote(
      "High frequency",
      "zebra zebra zebra zebra zebra zebra zebra"
    );
    // lowFreq has it once among other words
    await saveNote(
      "Low frequency",
      "zebra and other animals like lions and elephants and tigers"
    );

    const results = searchNotes("zebra");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]!.note.title).toBe("High frequency");
  });

  it("matches on title as well as content", async () => {
    await saveNote("Unique title keyword xyzzy", "generic content");
    await saveNote("Another note", "also generic content");

    const results = searchNotes("xyzzy");
    expect(results.length).toBe(1);
    expect(results[0]!.note.title).toMatch(/xyzzy/i);
  });
});

// ---------------------------------------------------------------------------
// Concurrent write safety
// ---------------------------------------------------------------------------

describe("memory store: concurrent writes", () => {
  beforeEach(setupTempFile);
  afterEach(teardownTempFile);

  it("serialises concurrent saveNote calls without corrupting the file", async () => {
    const count = 10;
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        saveNote(`Note ${i}`, `Content ${i}`)
      )
    );

    const notes = listNotes();
    expect(notes.length).toBe(count);

    // File must be valid JSON
    const raw = fs.readFileSync(memFile, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
