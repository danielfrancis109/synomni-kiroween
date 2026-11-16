"use client";

import { useState } from "react";

interface CompareColumn {
  providerId: string;
  model: string;
  response: string;
  error: string;
  loading: boolean;
  followUp: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const PROVIDERS = [
  { id: "demo", label: "Demo (offline)", models: ["demo", "demo-scientist", "demo-philosopher"] },
  { id: "anthropic", label: "Anthropic", models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"] },
  { id: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  { id: "xai", label: "xAI (Grok)", models: ["grok-3", "grok-3-mini"] },
  { id: "local", label: "Local (Ollama)", models: ["llama3", "mistral", "phi3"] },
];

function getStoredKey(providerId: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`synomni_key_${providerId}`) ?? "";
}

function getStoredBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("synomni_key_local") ?? "";
}

async function callProvider(
  providerId: string,
  model: string,
  messages: Message[]
): Promise<string> {
  const apiKey = getStoredKey(providerId);
  const baseUrl = providerId === "local" ? getStoredBaseUrl() : undefined;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId, model, messages, apiKey: apiKey || undefined, baseUrl }),
  });
  const data = (await res.json()) as { content?: string; error?: { message: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? "Unknown error");
  return data.content ?? "";
}

const defaultCol = (idx: number): CompareColumn => ({
  providerId: "demo",
  model: "demo",
  response: "",
  error: "",
  loading: false,
  followUp: "",
});

export default function ComparePanel() {
  const [cols, setCols] = useState<[CompareColumn, CompareColumn]>([
    defaultCol(0),
    defaultCol(1),
  ]);
  const [prompt, setPrompt] = useState("");
  const [histories, setHistories] = useState<[Message[], Message[]]>([[], []]);

  function updateCol(idx: 0 | 1, patch: Partial<CompareColumn>) {
    setCols((prev) => {
      const next = [...prev] as [CompareColumn, CompareColumn];
      next[idx] = { ...prev[idx], ...patch };
      return next;
    });
  }

  async function submit() {
    if (!prompt.trim()) return;
    const userMsg: Message = { role: "user", content: prompt.trim() };
    const newHistories = histories.map((h) => [...h, userMsg]) as [Message[], Message[]];
    setHistories(newHistories);
    updateCol(0, { loading: true, response: "", error: "" });
    updateCol(1, { loading: true, response: "", error: "" });

    await Promise.all(
      ([0, 1] as const).map(async (idx) => {
        try {
          const content = await callProvider(cols[idx].providerId, cols[idx].model, newHistories[idx]);
          const assistantMsg: Message = { role: "assistant", content };
          setHistories((prev) => {
            const next = [...prev] as [Message[], Message[]];
            next[idx] = [...prev[idx], assistantMsg];
            return next;
          });
          updateCol(idx, { response: content, loading: false });
        } catch (err) {
          updateCol(idx, {
            error: err instanceof Error ? err.message : "Error",
            loading: false,
          });
        }
      })
    );
    setPrompt("");
  }

  async function forward(fromIdx: 0 | 1) {
    const toIdx: 0 | 1 = fromIdx === 0 ? 1 : 0;
    const sourceResponse = cols[fromIdx].response;
    if (!sourceResponse) return;
    const forwardMsg: Message = {
      role: "user",
      content: `Critique and expand on this answer from another model:\n\n${sourceResponse}`,
    };
    const newHistory = [...histories[toIdx], forwardMsg] as Message[];
    setHistories((prev) => {
      const next = [...prev] as [Message[], Message[]];
      next[toIdx] = newHistory;
      return next;
    });
    updateCol(toIdx, { loading: true, response: "", error: "" });
    try {
      const content = await callProvider(cols[toIdx].providerId, cols[toIdx].model, newHistory);
      const assistantMsg: Message = { role: "assistant", content };
      setHistories((prev) => {
        const next = [...prev] as [Message[], Message[]];
        next[toIdx] = [...prev[toIdx], assistantMsg];
        return next;
      });
      updateCol(toIdx, { response: content, loading: false });
    } catch (err) {
      updateCol(toIdx, {
        error: err instanceof Error ? err.message : "Error",
        loading: false,
      });
    }
  }

  async function sendFollowUp(idx: 0 | 1) {
    const followUp = cols[idx].followUp.trim();
    if (!followUp) return;
    const userMsg: Message = { role: "user", content: followUp };
    const newHistory = [...histories[idx], userMsg] as Message[];
    setHistories((prev) => {
      const next = [...prev] as [Message[], Message[]];
      next[idx] = newHistory;
      return next;
    });
    updateCol(idx, { loading: true, error: "", followUp: "" });
    try {
      const content = await callProvider(cols[idx].providerId, cols[idx].model, newHistory);
      const assistantMsg: Message = { role: "assistant", content };
      setHistories((prev) => {
        const next = [...prev] as [Message[], Message[]];
        next[idx] = [...prev[idx], assistantMsg];
        return next;
      });
      updateCol(idx, { response: content, loading: false });
    } catch (err) {
      updateCol(idx, {
        error: err instanceof Error ? err.message : "Error",
        loading: false,
      });
    }
  }

  const colLabels = ["Column A", "Column B"];

  return (
    <section
      aria-label="Compare panel"
      data-testid="compare-panel"
      className="flex flex-col gap-4"
    >
      <h2 className="text-[#39ff14] font-bold tracking-widest uppercase text-sm">
        ⚡ Compare
      </h2>

      {/* Shared prompt */}
      <div className="flex flex-col gap-2">
        <label htmlFor="compare-prompt" className="text-xs text-gray-400 uppercase tracking-wider">
          Prompt (sent to both models)
        </label>
        <textarea
          id="compare-prompt"
          data-testid="compare-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="Enter a prompt… (Ctrl/Cmd+Enter to submit)"
          className="bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-sm px-3 py-2 rounded font-mono focus:outline-none focus:border-[#39ff14] resize-none"
          aria-multiline="true"
        />
        <button
          onClick={submit}
          data-testid="compare-submit"
          disabled={cols[0].loading || cols[1].loading || !prompt.trim()}
          className="self-end bg-[#39ff14] text-black font-bold px-6 py-2 rounded text-sm hover:bg-[#2fd10e] disabled:opacity-40 transition-colors"
        >
          {cols[0].loading || cols[1].loading ? "…" : "Compare"}
        </button>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {([0, 1] as const).map((idx) => {
          const col = cols[idx];
          const providerDef = PROVIDERS.find((p) => p.id === col.providerId);
          return (
            <div
              key={idx}
              data-testid={`compare-col-${idx}`}
              className="seam-border rounded p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#39ff14] text-xs font-bold">{colLabels[idx]}</span>
              </div>

              {/* Provider picker */}
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label
                    htmlFor={`col-${idx}-provider`}
                    className="text-xs text-gray-500 uppercase"
                  >
                    Provider
                  </label>
                  <select
                    id={`col-${idx}-provider`}
                    data-testid={`col-${idx}-provider`}
                    value={col.providerId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const firstModel = PROVIDERS.find((p) => p.id === pid)?.models[0] ?? pid;
                      updateCol(idx, { providerId: pid, model: firstModel });
                    }}
                    className="bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-[#39ff14]"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 flex-1">
                  <label
                    htmlFor={`col-${idx}-model`}
                    className="text-xs text-gray-500 uppercase"
                  >
                    Model
                  </label>
                  <select
                    id={`col-${idx}-model`}
                    data-testid={`col-${idx}-model`}
                    value={col.model}
                    onChange={(e) => updateCol(idx, { model: e.target.value })}
                    className="bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-[#39ff14]"
                  >
                    {(providerDef?.models ?? [col.model]).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Response area */}
              <div
                role="region"
                aria-label={`${colLabels[idx]} response`}
                data-testid={`col-${idx}-response`}
                className="min-h-24 bg-[#080808] border border-[#39ff14]/10 rounded p-3 font-mono text-sm text-gray-300 whitespace-pre-wrap"
              >
                {col.loading && (
                  <span className="text-[#39ff14] animate-pulse">Thinking…</span>
                )}
                {!col.loading && col.error && (
                  <span className="text-red-400">⚠ {col.error}</span>
                )}
                {!col.loading && !col.error && col.response && col.response}
                {!col.loading && !col.error && !col.response && (
                  <span className="text-gray-600 italic">No response yet</span>
                )}
              </div>

              {/* Forward button */}
              {col.response && !col.loading && (
                <button
                  onClick={() => forward(idx)}
                  data-testid={`col-${idx}-forward`}
                  aria-label={`Forward ${colLabels[idx]} response to ${colLabels[idx === 0 ? 1 : 0]}`}
                  className="text-xs border border-[#39ff14]/40 text-[#39ff14] px-3 py-1 rounded hover:bg-[#39ff14]/10 transition-colors self-start"
                >
                  Forward → {colLabels[idx === 0 ? 1 : 0]}
                </button>
              )}

              {/* Follow-up input */}
              <div className="flex gap-2">
                <label htmlFor={`col-${idx}-followup`} className="sr-only">
                  Follow-up for {colLabels[idx]}
                </label>
                <input
                  id={`col-${idx}-followup`}
                  data-testid={`col-${idx}-followup`}
                  type="text"
                  value={col.followUp}
                  onChange={(e) => updateCol(idx, { followUp: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") sendFollowUp(idx); }}
                  placeholder="Follow-up…"
                  className="flex-1 bg-[#0d0d0d] border border-[#39ff14]/20 text-gray-200 text-xs px-3 py-1 rounded font-mono focus:outline-none focus:border-[#39ff14]"
                />
                <button
                  onClick={() => sendFollowUp(idx)}
                  disabled={!col.followUp.trim() || col.loading}
                  aria-label={`Send follow-up for ${colLabels[idx]}`}
                  className="text-xs bg-[#39ff14]/10 border border-[#39ff14]/30 text-[#39ff14] px-3 py-1 rounded hover:bg-[#39ff14]/20 disabled:opacity-40 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
