"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

// Dynamic imports to avoid SSR issues with localStorage
const SettingsDrawer = dynamic(() => import("@/components/SettingsDrawer"), {
  ssr: false,
});
const ComparePanel = dynamic(() => import("@/components/ComparePanel"), {
  ssr: false,
});
const ConferencePanel = dynamic(() => import("@/components/ConferencePanel"), {
  ssr: false,
});
const MemoryPanel = dynamic(() => import("@/components/MemoryPanel"), {
  ssr: false,
});

interface PendingSave {
  title: string;
  content: string;
}

export default function ChamberPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [hosted, setHosted] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d: { hosted?: boolean }) => {
        if (d.hosted) setHosted(true);
      })
      .catch(() => {});
  }, []);

  const handleSaveTranscript = useCallback((transcript: string) => {
    const title = `Conference — ${new Date().toLocaleString()}`;
    setPendingSave({ title: title.slice(0, 200), content: transcript });
  }, []);

  const handleSaveComplete = useCallback(() => {
    setPendingSave(null);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0b0d0c" }} data-testid="chamber-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        data-testid="chamber-header"
        className="sticky top-0 z-30 border-b border-dashed flex items-center justify-between px-4 py-3 gap-4"
        style={{
          backgroundColor: "rgba(11,13,12,0.97)",
          borderColor: "rgba(57,255,20,0.4)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo bolt */}
          <span
            className="text-2xl flex-shrink-0 glow-text"
            aria-hidden="true"
            style={{ color: "#39ff14" }}
          >
            ⚡
          </span>

          <div className="min-w-0">
            <h1
              className="font-bold tracking-widest uppercase text-sm md:text-base leading-tight glow-text"
              style={{ color: "#39ff14", fontFamily: "inherit" }}
            >
              Synomni Chamber
            </h1>
            <p
              className="hidden sm:block text-xs tracking-wide leading-tight"
              style={{ color: "rgba(57,255,20,0.45)" }}
            >
              Multi-LLM Frankenstein Workspace
            </p>
          </div>

          {/* Demo badge */}
          <span
            className="hidden md:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed flex-shrink-0"
            style={{
              borderColor: "rgba(57,255,20,0.3)",
              color: "rgba(57,255,20,0.7)",
              backgroundColor: "rgba(57,255,20,0.06)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#39ff14" }}
            />
            Demo mode — no keys needed
          </span>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Open API key settings"
          data-testid="settings-button"
          className="flex-shrink-0 text-xs px-3 py-1.5 rounded border font-mono font-bold uppercase tracking-wider hover:opacity-100"
          style={{
            borderColor: "rgba(57,255,20,0.4)",
            color: "#39ff14",
            backgroundColor: "rgba(57,255,20,0.06)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "rgba(57,255,20,0.14)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "rgba(57,255,20,0.06)";
          }}
        >
          ⚙ Settings
        </button>
      </header>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hosted={hosted}
      />

      {/* ── Main workspace — three panels ──────────────────────────────── */}
      <main
        className="max-w-screen-2xl mx-auto px-3 py-5 grid grid-cols-1 gap-4"
        style={{ gridTemplateColumns: "1fr" }}
      >
        {/* Responsive grid: 1 col mobile, [2fr 1fr] on lg */}
        <div
          className="grid grid-cols-1 gap-4"
          style={{ gridTemplateColumns: "repeat(1, 1fr)" }}
        >
          {/* Row with Compare (2/3) + right column (1/3) on large screens */}
          <div
            className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start"
          >
            {/* Compare — spans 2 cols on large screens */}
            <div className="lg:col-span-2 seam-border glow-border rounded-lg p-5">
              <ComparePanel hosted={hosted} />
            </div>

            {/* Right column: Conference + Memory stacked */}
            <div className="flex flex-col gap-4">
              <div className="seam-border glow-border rounded-lg p-4">
                <ConferencePanel onSaveTranscript={handleSaveTranscript} hosted={hosted} />
              </div>
              <div className="seam-border glow-border rounded-lg p-4">
                <MemoryPanel
                  pendingSave={pendingSave}
                  onSaveComplete={handleSaveComplete}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        className="text-center text-xs py-5 border-t border-dashed mt-4"
        style={{
          color: "rgba(100,120,105,0.6)",
          borderColor: "rgba(57,255,20,0.1)",
        }}
      >
        Synomni Chamber · Kiroween 2026 ·{" "}
        <a
          href="https://synomni.infinitybuilds.download"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(57,255,20,0.35)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              "rgba(57,255,20,0.75)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              "rgba(57,255,20,0.35)";
          }}
        >
          Inspired by Synomni
        </a>
      </footer>
    </div>
  );
}
