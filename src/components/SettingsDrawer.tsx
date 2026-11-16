"use client";

import { useState, useEffect } from "react";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  hosted?: boolean;
}

const ALL_PROVIDERS = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "xai", label: "xAI (Grok)", placeholder: "xai-…" },
  { id: "local", label: "Local (Ollama)", placeholder: "http://localhost:11434" },
];

const STORAGE_KEY_PREFIX = "synomni_key_";

export function getStoredKey(providerId: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}${providerId}`) ?? "";
}

export default function SettingsDrawer({ open, onClose, hosted = false }: SettingsDrawerProps) {
  const [keys, setKeys] = useState<Record<string, string>>({});

  // Filter out the Local provider in hosted mode.
  const PROVIDERS = hosted
    ? ALL_PROVIDERS.filter((p) => p.id !== "local")
    : ALL_PROVIDERS;

  useEffect(() => {
    if (open) {
      const loaded: Record<string, string> = {};
      for (const p of PROVIDERS) {
        loaded[p.id] = localStorage.getItem(`${STORAGE_KEY_PREFIX}${p.id}`) ?? "";
      }
      setKeys(loaded);
    }
  }, [open]);

  function handleSave() {
    for (const p of PROVIDERS) {
      const val = keys[p.id] ?? "";
      if (val) {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${p.id}`, val);
      } else {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${p.id}`);
      }
    }
    onClose();
  }

  function handleClear() {
    for (const p of PROVIDERS) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${p.id}`);
    }
    setKeys({});
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="API key settings"
        data-testid="settings-drawer"
        className="fixed top-0 right-0 h-full w-80 z-50 bg-[#111] border-l-2 border-[#39ff14] p-6 flex flex-col gap-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[#39ff14] font-bold text-lg tracking-widest uppercase">
            ⚙ Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="text-gray-400 hover:text-[#39ff14] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-gray-500 text-xs">
          Keys are stored in browser localStorage only — never sent to our server.
        </p>

        <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <label
                htmlFor={`key-${p.id}`}
                className="text-xs text-gray-400 uppercase tracking-wider"
              >
                {p.label}
              </label>
              <input
                id={`key-${p.id}`}
                type="password"
                autoComplete="off"
                placeholder={p.placeholder}
                value={keys[p.id] ?? ""}
                onChange={(e) =>
                  setKeys((prev) => ({ ...prev, [p.id]: e.target.value }))
                }
                className="bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-[#39ff14] font-mono"
                data-testid={`key-input-${p.id}`}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-auto pt-4 border-t border-[#39ff14]/20">
          <button
            onClick={handleSave}
            data-testid="settings-save"
            className="flex-1 bg-[#39ff14] text-black font-bold py-2 rounded text-sm hover:bg-[#2fd10e] transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleClear}
            data-testid="settings-clear"
            className="flex-1 border border-red-500/60 text-red-400 font-bold py-2 rounded text-sm hover:border-red-400 transition-colors"
          >
            Clear All
          </button>
        </div>
      </aside>
    </>
  );
}
