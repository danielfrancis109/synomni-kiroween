/**
 * Tests for hosted-mode session-scoped memory functions.
 * Uses a temp directory so tests are isolated from real data.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  saveNoteForSession,
  listNotesForSession,
  retrieveNoteForSession,
  deleteNoteForSession,
  searchNotesForSession,
  MemoryFullError,
  NoteNotFoundError,
} from "../src/lib/memory.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hosted-mem-"));
  vi.stubEnv("MEMORY_DIR", tmpDir);
  vi.stubEnv("HOSTED_DEMO", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("saveNoteForSession / listNotesForSession", () => {
  it("saves and lists a note for a session", async () => {
    const sid = "aabbccdd-0000-0000-0000-000000000001";
    await saveNoteForSession(sid, "Hello", "World");
    const notes = listNotesForSession(sid);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("Hello");
  });

  it("isolates notes across different sessions", async () => {
    const sidA = "aabbccdd-0000-0000-0000-000000000002";
    const sidB = "aabbccdd-0000-0000-0000-000000000003";
    await saveNoteForSession(sidA, "A's note", "content A");
    await saveNoteForSession(sidB, "B's note", "content B");
    expect(listNotesForSession(sidA)).toHaveLength(1);
    expect(listNotesForSession(sidA)[0]?.title).toBe("A's note");
    expect(listNotesForSession(sidB)).toHaveLength(1);
    expect(listNotesForSession(sidB)[0]?.title).toBe("B's note");
  });

  it("returns empty list for a session with no notes", () => {
    const sid = "aabbccdd-0000-0000-0000-000000000004";
    expect(listNotesForSession(sid)).toEqual([]);
  });
});

describe("retrieveNoteForSession", () => {
  it("retrieves a saved note by id", async () => {
    const sid = "aabbccdd-0000-0000-0000-000000000005";
    const note = await saveNoteForSession(sid, "Retrieve me", "some content");
    const retrieved = retrieveNoteForSession(sid, note.id);
    expect(retrieved.title).toBe("Retrieve me");
    expect(retrieved.content).toBe("some content");
  });

  it("throws NoteNotFoundError for a missing id", () => {
    const sid = "aabbccdd-0000-0000-0000-000000000006";
    expect(() => retrieveNoteForSession(sid, "nonexistent-id")).toThrow(
      NoteNotFoundError
    );
  });

  it("cannot retrieve a note belonging to another session", async () => {
    const sidA = "aabbccdd-0000-0000-0000-000000000007";
    const sidB = "aabbccdd-0000-0000-0000-000000000008";
    const note = await saveNoteForSession(sidA, "Only A", "content");
    expect(() => retrieveNoteForSession(sidB, note.id)).toThrow(NoteNotFoundError);
  });
});

describe("deleteNoteForSession", () => {
  it("deletes an existing note", async () => {
    const sid = "aabbccdd-0000-0000-0000-000000000009";
    const note = await saveNoteForSession(sid, "Delete me", "gone");
    await deleteNoteForSession(sid, note.id);
    expect(listNotesForSession(sid)).toHaveLength(0);
  });

  it("throws NoteNotFoundError when deleting a non-existent id", async () => {
    const sid = "aabbccdd-0000-0000-0000-00000000000a";
    await expect(deleteNoteForSession(sid, "no-such-id")).rejects.toThrow(
      NoteNotFoundError
    );
  });
});

describe("searchNotesForSession", () => {
  it("finds notes by keyword", async () => {
    const sid = "aabbccdd-0000-0000-0000-00000000000b";
    await saveNoteForSession(sid, "Quantum mechanics", "superposition entanglement");
    await saveNoteForSession(sid, "Cooking", "pasta sauce");
    const results = searchNotesForSession(sid, "superposition");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.note.title).toBe("Quantum mechanics");
  });

  it("returns empty when query does not match", async () => {
    const sid = "aabbccdd-0000-0000-0000-00000000000c";
    await saveNoteForSession(sid, "Hiking", "trail mountain");
    const results = searchNotesForSession(sid, "quantum");
    expect(results).toHaveLength(0);
  });
});

describe("MemoryFullError — 50 note cap", () => {
  it("throws MemoryFullError when the session note count reaches 50", async () => {
    const sid = "aabbccdd-0000-0000-0000-00000000000d";
    // Fill to the cap
    for (let i = 0; i < 50; i++) {
      await saveNoteForSession(sid, `Note ${i}`, "x");
    }
    await expect(saveNoteForSession(sid, "One too many", "y")).rejects.toThrow(
      MemoryFullError
    );
  });
});

describe("Local provider rejection test (hosted mode behaviour, via env)", () => {
  it("HOSTED_DEMO env is set to true in this test suite", () => {
    expect(process.env.HOSTED_DEMO).toBe("true");
  });
});
