"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

// Dynamic imports to avoid SSR issues with localStorage
const SettingsDrawer = dynamic(() => import("@/components/SettingsDrawer"), { ssr: false });
const ComparePanel = dynamic(() => import("@/components/ComparePanel"), { ssr: false });
const ConferencePanel = dynamic(() => import("@/components/ConferencePanel"), { ssr: false });
const MemoryPanel = dynamic(() => import("@/components/MemoryPanel"), { ssr: false });

interface PendingSave {
  title: string;
  content: string;
}

export default function ChamberPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  const handleSaveTranscript = useCallback((transcript: string) => {
    const title = `Conference — ${new Date().toLocaleString()}`;
    setPendingSave({ title: title.slice(0, 200), content: transcript });
  }, []);

  const handleSaveComplete = useCallback(() => {
    setPendingSave(null);
  }, []);

  return (
    <main
      className="min-h-screen bg-[#0d0d0d] text-gray-100 font-mono"
      data-testid="chamber-page"
    >
      {/* Header */}
      <header
        className="sticky top-0 z-30 bg-[#0d0d0d]/95 backdrop-blur border-b-2 border-[#39ff14] flex items-center justify-between px-4 py-3"
        data-testid="chamber-header"
      >
        <div className="flex items-center gap-3">
          <span className="text-[#39ff14] text-xl" aria-hidden="true">⚡</span>
          <h1 className="text-[#39ff14] font-bold tracking-widest uppercase text-base md:text-lg">
            Synomni Chamber
          </h1>
          <span className="hidden md:inline text-gray-600 text-xs tracking-wider">
            Multi-LLM Frankenstein Workspace
          </span>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Open API key settings"
          data-testid="settings-button"
          className="text-xs border border-[#39ff14]/40 text-[#39ff14] px-3 py-1.5 rounded hover:bg-[#39ff14]/10 transition-colors"
        >
          ⚙ Settings
        </button>
      </header>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Main workspace — three panels */}
      <div className="max-w-screen-2xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compare — spans 2 cols on large screens */}
        <div className="lg:col-span-2 seam-border rounded-lg p-5">
          <ComparePanel />
        </div>

        {/* Right column: Conference + Memory stacked */}
        <div className="flex flex-col gap-6">
          <div className="seam-border rounded-lg p-5">
            <ConferencePanel onSaveTranscript={handleSaveTranscript} />
          </div>
          <div className="seam-border rounded-lg p-5">
            <MemoryPanel
              pendingSave={pendingSave}
              onSaveComplete={handleSaveComplete}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-gray-700 text-xs py-6 border-t border-[#39ff14]/10">
        Synomni Chamber — Kiroween 2026 ·{" "}
        <a
          href="https://synomni.infinitybuilds.download"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#39ff14]/40 hover:text-[#39ff14]/80"
        >
          Inspired by Synomni
        </a>
      </footer>
    </main>
  );
}
