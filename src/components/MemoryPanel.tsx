"use client";

import { useState, useEffect, useCallback } from "react";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export default function MemoryPanel({
  pendingSave,
  onSaveComplete,
}: {
  pendingSave?: { title: string; content: string } | null;
  onSaveComplete?: () => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Note[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveContent, setSaveContent] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      if (!res.ok) return;
      const data = (await res.json()) as { notes: Note[] };
      setNotes(data.notes ?? []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Handle incoming transcript save request from parent
  useEffect(() => {
    if (pendingSave) {
      setSaveTitle(pendingSave.title.slice(0, 200));
      setSaveContent(pendingSave.content);
      setSavingNew(true);
      onSaveComplete?.();
    }
  }, [pendingSave, onSaveComplete]);

  async function search() {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json()) as { notes: Note[] };
      setResults(data.notes ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveNote() {
    if (!saveTitle.trim() || !saveContent.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: saveTitle.trim(), content: saveContent.trim() }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message: string } };
        throw new Error(d.error?.message ?? "Save failed");
      }
      setSaveTitle("");
      setSaveContent("");
      setSavingNew(false);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function deleteNote(id: string) {
    try {
      await fetch(`/api/memory/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setResults((prev) => prev?.filter((n) => n.id !== id) ?? null);
    } catch {
      // silent
    }
  }

  const displayNotes = results ?? notes;

  return (
    <section
      aria-label="Memory panel"
      data-testid="memory-panel"
      className="flex flex-col gap-4"
    >
      <h2 className="text-[#39ff14] font-bold tracking-widest uppercase text-sm">
        🧠 Memory
      </h2>

      {/* Search */}
      <div className="flex gap-2">
        <label htmlFor="memory-search" className="sr-only">
          Search notes
        </label>
        <input
          id="memory-search"
          data-testid="memory-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          placeholder="Search notes…"
          className="flex-1 bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-xs px-3 py-1.5 rounded font-mono focus:outline-none focus:border-[#39ff14]"
        />
        <button
          onClick={search}
          data-testid="memory-search-btn"
          disabled={loading}
          className="text-xs bg-[#39ff14]/10 border border-[#39ff14]/30 text-[#39ff14] px-3 py-1 rounded hover:bg-[#39ff14]/20 disabled:opacity-40 transition-colors"
        >
          Search
        </button>
        {results && (
          <button
            onClick={() => { setResults(null); setQuery(""); }}
            data-testid="memory-clear-search"
            className="text-xs text-gray-500 px-2 hover:text-gray-300"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* New note form */}
      {savingNew ? (
        <div
          data-testid="memory-save-form"
          className="seam-border rounded p-3 flex flex-col gap-2"
        >
          <label htmlFor="note-title" className="text-xs text-gray-500 uppercase">Title</label>
          <input
            id="note-title"
            data-testid="note-title"
            type="text"
            maxLength={200}
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="Note title…"
            className="bg-[#0d0d0d] border border-[#39ff14]/20 text-gray-200 text-xs px-3 py-1.5 rounded font-mono focus:outline-none focus:border-[#39ff14]"
          />
          <label htmlFor="note-content" className="text-xs text-gray-500 uppercase">Content</label>
          <textarea
            id="note-content"
            data-testid="note-content"
            rows={4}
            maxLength={10000}
            value={saveContent}
            onChange={(e) => setSaveContent(e.target.value)}
            placeholder="Note content…"
            className="bg-[#0d0d0d] border border-[#39ff14]/20 text-gray-200 text-xs px-3 py-1.5 rounded font-mono focus:outline-none focus:border-[#39ff14] resize-none"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveNote}
              disabled={loading || !saveTitle.trim() || !saveContent.trim()}
              data-testid="note-save-btn"
              className="bg-[#39ff14] text-black font-bold px-4 py-1.5 rounded text-xs hover:bg-[#2fd10e] disabled:opacity-40 transition-colors"
            >
              {loading ? "Saving…" : "Save note"}
            </button>
            <button
              onClick={() => { setSavingNew(false); setSaveTitle(""); setSaveContent(""); setError(""); }}
              className="text-xs text-gray-500 px-3 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setSavingNew(true)}
          data-testid="memory-new-note"
          className="text-xs border border-dashed border-[#39ff14]/30 text-[#39ff14]/60 px-3 py-2 rounded hover:border-[#39ff14]/60 hover:text-[#39ff14] transition-colors self-start"
        >
          + New note
        </button>
      )}

      {/* Note list */}
      <div
        role="list"
        aria-label="Saved notes"
        data-testid="memory-note-list"
        className="flex flex-col gap-2 max-h-96 overflow-y-auto"
      >
        {displayNotes.length === 0 && (
          <p className="text-gray-600 italic text-xs">
            {results ? "No notes match your search." : "No notes saved yet."}
          </p>
        )}
        {displayNotes.map((note) => (
          <div
            key={note.id}
            role="listitem"
            data-testid={`note-item-${note.id}`}
            className="bg-[#080808] border border-[#39ff14]/10 rounded p-3 flex flex-col gap-1"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                className="text-left flex-1"
                aria-expanded={expanded === note.id}
                aria-controls={`note-body-${note.id}`}
              >
                <span className="text-[#39ff14] text-xs font-bold">{note.title}</span>
                <span className="text-gray-600 text-xs ml-2">
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
              </button>
              <button
                onClick={() => deleteNote(note.id)}
                aria-label={`Delete note: ${note.title}`}
                data-testid={`note-delete-${note.id}`}
                className="text-red-500/60 hover:text-red-400 text-xs flex-shrink-0"
              >
                ✕
              </button>
            </div>
            {expanded === note.id && (
              <p
                id={`note-body-${note.id}`}
                className="text-gray-400 text-xs font-mono whitespace-pre-wrap mt-1 border-t border-[#39ff14]/10 pt-2"
              >
                {note.content}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
