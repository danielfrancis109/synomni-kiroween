import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  tags: string[];
}

export interface NoteListItem {
  id: string;
  title: string;
  createdAt: string;
}

export class NoteNotFoundError extends Error {
  constructor(id: string) {
    super(`Note not found: ${id}`);
    this.name = "NoteNotFoundError";
  }
}

export class MemoryFullError extends Error {
  constructor() {
    super("Session memory is full (max 50 notes)");
    this.name = "MemoryFullError";
  }
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

const MAX_NOTES_PER_SESSION = 50;
const MAX_SESSION_FILE_BYTES = 200 * 1024; // 200 KB
const MAX_SESSION_FILES = 500;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// File path helpers
// ---------------------------------------------------------------------------

/** Non-hosted: single global file (MCP server + existing tests use this). */
function getMemoryFile(): string {
  return process.env.MEMORY_FILE ?? path.join(process.cwd(), "data", "memory.json");
}

/** Hosted: per-session file under MEMORY_DIR. */
function getSessionFile(sessionId: string): string {
  const dir =
    process.env.MEMORY_DIR ?? path.join(process.cwd(), "data", "sessions");
  return path.join(dir, `${sessionId}.json`);
}

function isHosted(): boolean {
  return process.env.HOSTED_DEMO === "true";
}

// ---------------------------------------------------------------------------
// Write serialization queue — prevents concurrent corruption
// ---------------------------------------------------------------------------

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => void): Promise<void> {
  writeQueue = writeQueue.then(() => {
    fn();
  });
  return writeQueue;
}

// ---------------------------------------------------------------------------
// Low-level read/write
// ---------------------------------------------------------------------------

function readStore(filePath: string): { notes: Note[] } {
  if (!fs.existsSync(filePath)) {
    return { notes: [] };
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as { notes: Note[] };
}

function writeStore(filePath: string, store: { notes: Note[] }): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Session file count / eviction
// ---------------------------------------------------------------------------

function sessionDir(): string {
  return process.env.MEMORY_DIR ?? path.join(process.cwd(), "data", "sessions");
}

function listSessionFiles(): { file: string; mtime: number }[] {
  const dir = sessionDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { file: full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime); // oldest first
}

function enforceSessionFileCap(): void {
  const files = listSessionFiles();
  if (files.length <= MAX_SESSION_FILES) return;
  const excess = files.length - MAX_SESSION_FILES;
  for (let i = 0; i < excess; i++) {
    try {
      fs.unlinkSync(files[i]!.file);
    } catch {
      // best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// Lazy cleanup — purge sessions older than SESSION_TTL_HOURS
// ---------------------------------------------------------------------------

let lastCleanupAt = 0;

export function runSessionCleanupIfDue(): void {
  if (!isHosted()) return;
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 24);
  const cutoff = now - ttlHours * 60 * 60 * 1000;
  const files = listSessionFiles();
  for (const { file, mtime } of files) {
    if (mtime < cutoff) {
      try {
        fs.unlinkSync(file);
      } catch {
        // best-effort
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — non-hosted paths (unchanged; used by MCP server)
// ---------------------------------------------------------------------------

export async function saveNote(title: string, content: string): Promise<Note> {
  const note: Note = {
    id: randomUUID(),
    title,
    content,
    createdAt: new Date().toISOString(),
    tags: [],
  };

  await enqueueWrite(() => {
    const filePath = getMemoryFile();
    const store = readStore(filePath);
    store.notes.push(note);
    writeStore(filePath, store);
  });

  return note;
}

export function listNotes(): NoteListItem[] {
  const filePath = getMemoryFile();
  const store = readStore(filePath);
  return store.notes.map(({ id, title, createdAt }) => ({ id, title, createdAt }));
}

export function retrieveNote(id: string): Note {
  const filePath = getMemoryFile();
  const store = readStore(filePath);
  const note = store.notes.find((n) => n.id === id);
  if (!note) throw new NoteNotFoundError(id);
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  let found = false;

  await enqueueWrite(() => {
    const filePath = getMemoryFile();
    const store = readStore(filePath);
    const idx = store.notes.findIndex((n) => n.id === id);
    if (idx === -1) {
      found = false;
      return;
    }
    found = true;
    store.notes.splice(idx, 1);
    writeStore(filePath, store);
  });

  if (!found) throw new NoteNotFoundError(id);
}

// ---------------------------------------------------------------------------
// Public API — hosted / session-scoped paths
// ---------------------------------------------------------------------------

export async function saveNoteForSession(
  sessionId: string,
  title: string,
  content: string
): Promise<Note> {
  const note: Note = {
    id: randomUUID(),
    title,
    content,
    createdAt: new Date().toISOString(),
    tags: [],
  };

  let tooMany = false;
  let tooBig = false;

  await enqueueWrite(() => {
    enforceSessionFileCap();
    const filePath = getSessionFile(sessionId);
    const store = readStore(filePath);

    if (store.notes.length >= MAX_NOTES_PER_SESSION) {
      tooMany = true;
      return;
    }

    store.notes.push(note);
    const serialized = JSON.stringify(store, null, 2);
    if (Buffer.byteLength(serialized, "utf-8") > MAX_SESSION_FILE_BYTES) {
      tooBig = true;
      return;
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, serialized, "utf-8");
  });

  if (tooMany || tooBig) throw new MemoryFullError();
  return note;
}

export function listNotesForSession(sessionId: string): NoteListItem[] {
  const filePath = getSessionFile(sessionId);
  const store = readStore(filePath);
  return store.notes.map(({ id, title, createdAt }) => ({ id, title, createdAt }));
}

export function retrieveNoteForSession(sessionId: string, id: string): Note {
  const filePath = getSessionFile(sessionId);
  const store = readStore(filePath);
  const note = store.notes.find((n) => n.id === id);
  if (!note) throw new NoteNotFoundError(id);
  return note;
}

export async function deleteNoteForSession(
  sessionId: string,
  id: string
): Promise<void> {
  let found = false;

  await enqueueWrite(() => {
    const filePath = getSessionFile(sessionId);
    const store = readStore(filePath);
    const idx = store.notes.findIndex((n) => n.id === id);
    if (idx === -1) {
      found = false;
      return;
    }
    found = true;
    store.notes.splice(idx, 1);
    writeStore(filePath, store);
  });

  if (!found) throw new NoteNotFoundError(id);
}

export function searchNotesForSession(
  sessionId: string,
  query: string
): SearchResult[] {
  const filePath = getSessionFile(sessionId);
  const store = readStore(filePath);
  return _searchInStore(store, query);
}

// ---------------------------------------------------------------------------
// TF search — term-frequency scoring over title + content
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

export interface SearchResult {
  note: NoteListItem;
  score: number;
}

function _searchInStore(
  store: { notes: Note[] },
  query: string
): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return store.notes.map((n) => ({
      note: { id: n.id, title: n.title, createdAt: n.createdAt },
      score: 0,
    }));
  }

  const scored = store.notes.map((note) => {
    const text = `${note.title} ${note.content}`;
    const noteTokens = tokenize(text);
    const total = noteTokens.length || 1;
    let score = 0;
    for (const qt of queryTokens) {
      const tf = noteTokens.filter((t) => t === qt).length / total;
      score += tf;
    }
    return {
      note: { id: note.id, title: note.title, createdAt: note.createdAt },
      score,
    };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export function searchNotes(query: string): SearchResult[] {
  const filePath = getMemoryFile();
  const store = readStore(filePath);
  return _searchInStore(store, query);
}
