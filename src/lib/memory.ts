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

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

function getMemoryFile(): string {
  return process.env.MEMORY_FILE ?? path.join(process.cwd(), "data", "memory.json");
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
// Public API
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

export function searchNotes(query: string): SearchResult[] {
  const filePath = getMemoryFile();
  const store = readStore(filePath);
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
