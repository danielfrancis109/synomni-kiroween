"use client";

import { useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  forwarded?: boolean; // true when this user message is a forwarded-from bubble
}

interface CompareColumn {
  providerId: string;
  model: string;
  error: string;
  loading: boolean;
  followUp: string;
}

const ALL_PROVIDERS = [
  {
    id: "demo",
    label: "Demo (offline)",
    models: ["demo", "demo-scientist", "demo-philosopher"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  { id: "xai", label: "xAI (Grok)", models: ["grok-3", "grok-3-mini"] },
  {
    id: "local",
    label: "Local (Ollama)",
    models: ["llama3", "mistral", "phi3"],
  },
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

  // Strip the forwarded metadata before sending to the API — API expects plain role/content
  const apiMessages = messages.map(({ role, content }) => ({ role, content }));

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerId,
      model,
      messages: apiMessages,
      apiKey: apiKey || undefined,
      baseUrl,
    }),
  });
  const data = (await res.json()) as {
    content?: string;
    error?: { message: string };
  };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? "Unknown error");
  return data.content ?? "";
}

/** Default column state factory. */
function defaultCol(model = "demo"): CompareColumn {
  return {
    providerId: "demo",
    model,
    error: "",
    loading: false,
    followUp: "",
  };
}

const COL_LABELS = ["Column A", "Column B"] as const;
const COL_COLORS = ["#39ff14", "#14e0ff"] as const;

export default function ComparePanel({ hosted = false }: { hosted?: boolean }) {
  const PROVIDERS = hosted
    ? ALL_PROVIDERS.filter((p) => p.id !== "local")
    : ALL_PROVIDERS;

  // col-B defaults to demo-scientist (10.4)
  const [cols, setCols] = useState<[CompareColumn, CompareColumn]>([
    defaultCol("demo"),
    defaultCol("demo-scientist"),
  ]);
  const [prompt, setPrompt] = useState("");
  // histories[idx] is the full message thread for column idx
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
    const newHistories = histories.map((h) => [...h, userMsg]) as [
      Message[],
      Message[],
    ];
    setHistories(newHistories);
    updateCol(0, { loading: true, error: "" });
    updateCol(1, { loading: true, error: "" });

    await Promise.all(
      ([0, 1] as const).map(async (idx) => {
        try {
          const content = await callProvider(
            cols[idx].providerId,
            cols[idx].model,
            newHistories[idx]
          );
          const assistantMsg: Message = { role: "assistant", content };
          setHistories((prev) => {
            const next = [...prev] as [Message[], Message[]];
            next[idx] = [...prev[idx], assistantMsg];
            return next;
          });
          updateCol(idx, { loading: false });
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
    // Find the most recent assistant message in fromIdx
    const fromHistory = histories[fromIdx];
    const sourceMsg = [...fromHistory].reverse().find((m) => m.role === "assistant");
    if (!sourceMsg) return;

    const sourceLabel = COL_LABELS[fromIdx];
    const forwardedContent = `Critique and expand on this answer from ${sourceLabel}:\n\n${sourceMsg.content}`;

    // Forwarded message is marked so the UI can render a "Forwarded from X" bubble
    const forwardMsg: Message = {
      role: "user",
      content: forwardedContent,
      forwarded: true,
    };
    const newHistory = [...histories[toIdx], forwardMsg] as Message[];
    setHistories((prev) => {
      const next = [...prev] as [Message[], Message[]];
      next[toIdx] = newHistory;
      return next;
    });
    updateCol(toIdx, { loading: true, error: "" });
    try {
      const content = await callProvider(
        cols[toIdx].providerId,
        cols[toIdx].model,
        newHistory
      );
      const assistantMsg: Message = { role: "assistant", content };
      setHistories((prev) => {
        const next = [...prev] as [Message[], Message[]];
        next[toIdx] = [...prev[toIdx], assistantMsg];
        return next;
      });
      updateCol(toIdx, { loading: false });
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
      const content = await callProvider(
        cols[idx].providerId,
        cols[idx].model,
        newHistory
      );
      const assistantMsg: Message = { role: "assistant", content };
      setHistories((prev) => {
        const next = [...prev] as [Message[], Message[]];
        next[idx] = [...prev[idx], assistantMsg];
        return next;
      });
      updateCol(idx, { loading: false });
    } catch (err) {
      updateCol(idx, {
        error: err instanceof Error ? err.message : "Error",
        loading: false,
      });
    }
  }

  const anyLoading = cols[0].loading || cols[1].loading;

  return (
    <section
      aria-label="Compare panel"
      data-testid="compare-panel"
      className="flex flex-col gap-5"
    >
      {/* Panel heading */}
      <div className="flex items-center gap-2">
        <span style={{ color: "#39ff14" }} aria-hidden="true">
          ⚡
        </span>
        <h2
          className="font-bold tracking-widest uppercase text-sm glow-text"
          style={{ color: "#39ff14" }}
        >
          Compare
        </h2>
      </div>

      {/* Shared prompt */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="compare-prompt"
          className="text-xs uppercase tracking-wider"
          style={{ color: "rgba(180,200,185,0.5)" }}
        >
          Prompt — sent to both models simultaneously
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
          placeholder="Enter a prompt… (Ctrl / ⌘ + Enter to submit)"
          className="w-full text-sm px-3 py-2.5 rounded font-mono resize-none"
          style={{
            backgroundColor: "#080a09",
            border: "1px solid rgba(57,255,20,0.25)",
            color: "#d4d8d5",
          }}
          aria-multiline="true"
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(57,255,20,0.7)";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(57,255,20,0.12)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(57,255,20,0.25)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <div className="flex items-center justify-between">
          <span
            className="text-xs"
            style={{ color: "rgba(100,120,105,0.5)" }}
          >
            {prompt.length > 0 && `${prompt.length} / 32 000 chars`}
          </span>
          <button
            onClick={submit}
            data-testid="compare-submit"
            disabled={anyLoading || !prompt.trim()}
            className="font-bold px-6 py-2 rounded text-sm uppercase tracking-wider"
            style={{
              backgroundColor:
                anyLoading || !prompt.trim()
                  ? "rgba(57,255,20,0.3)"
                  : "#39ff14",
              color: "#0b0d0c",
              opacity: anyLoading || !prompt.trim() ? 0.5 : 1,
              cursor: anyLoading || !prompt.trim() ? "not-allowed" : "pointer",
            }}
          >
            {anyLoading ? "Comparing…" : "Compare"}
          </button>
        </div>
      </div>

      {/* Two response columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {([0, 1] as const).map((idx) => {
          const col = cols[idx];
          const providerDef = PROVIDERS.find((p) => p.id === col.providerId);
          const accentColor = COL_COLORS[idx];
          const history = histories[idx];

          // The latest assistant message — used to gate forward/follow-up buttons
          const hasResponse = history.some((m) => m.role === "assistant");

          return (
            <div
              key={idx}
              data-testid={`compare-col-${idx}`}
              className="flex flex-col gap-3 rounded-lg p-4"
              style={{
                backgroundColor: "#0f1110",
                border: `1px dashed ${accentColor}44`,
              }}
            >
              {/* Col header */}
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: accentColor }}
                >
                  {COL_LABELS[idx]}
                </span>
                {col.loading && (
                  <span
                    className="text-xs animate-pulse"
                    style={{ color: accentColor }}
                  >
                    thinking…
                  </span>
                )}
              </div>

              {/* Provider / model pickers */}
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label
                    htmlFor={`col-${idx}-provider`}
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "rgba(180,200,185,0.4)" }}
                  >
                    Provider
                  </label>
                  <select
                    id={`col-${idx}-provider`}
                    data-testid={`col-${idx}-provider`}
                    value={col.providerId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const firstModel =
                        PROVIDERS.find((p) => p.id === pid)?.models[0] ?? pid;
                      updateCol(idx, { providerId: pid, model: firstModel });
                    }}
                    className="text-xs px-2 py-1.5 rounded font-mono"
                    style={{
                      backgroundColor: "#080a09",
                      border: "1px solid rgba(57,255,20,0.2)",
                      color: "#d4d8d5",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${accentColor}99`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(57,255,20,0.2)";
                    }}
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
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "rgba(180,200,185,0.4)" }}
                  >
                    Model
                  </label>
                  <select
                    id={`col-${idx}-model`}
                    data-testid={`col-${idx}-model`}
                    value={col.model}
                    onChange={(e) => updateCol(idx, { model: e.target.value })}
                    className="text-xs px-2 py-1.5 rounded font-mono"
                    style={{
                      backgroundColor: "#080a09",
                      border: "1px solid rgba(57,255,20,0.2)",
                      color: "#d4d8d5",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${accentColor}99`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(57,255,20,0.2)";
                    }}
                  >
                    {(providerDef?.models ?? [col.model]).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Thread view — col-N-msg-i with data-role (10.4) */}
              <div
                role="region"
                aria-label={`${COL_LABELS[idx]} response`}
                data-testid={`col-${idx}-response`}
                className="flex-1 rounded font-mono text-sm overflow-y-auto flex flex-col gap-2"
                style={{
                  backgroundColor: "#080a09",
                  border: "1px solid rgba(57,255,20,0.08)",
                  color: "#c8d0ca",
                  lineHeight: "1.6",
                  minHeight: "9rem",
                  padding: "0.75rem",
                }}
              >
                {history.length === 0 && !col.loading && !col.error && (
                  <span
                    style={{ color: "rgba(100,120,105,0.5)" }}
                    className="italic text-sm"
                  >
                    No response yet
                  </span>
                )}

                {history.map((msg, msgIdx) => {
                  if (msg.forwarded) {
                    // Forwarded-from bubble (10.4)
                    const fromLabel = COL_LABELS[idx === 0 ? 1 : 0];
                    return (
                      <div
                        key={msgIdx}
                        data-testid={`col-${idx}-msg-${msgIdx}`}
                        data-role="user"
                        className="text-xs rounded px-3 py-2 self-end max-w-[90%] italic"
                        style={{
                          backgroundColor: `${accentColor}0a`,
                          border: `1px solid ${accentColor}22`,
                          color: "rgba(180,200,185,0.6)",
                        }}
                      >
                        ↪ Forwarded from {fromLabel}
                      </div>
                    );
                  }

                  if (msg.role === "user") {
                    return (
                      <div
                        key={msgIdx}
                        data-testid={`col-${idx}-msg-${msgIdx}`}
                        data-role="user"
                        className="text-xs rounded px-3 py-2 self-end max-w-[90%]"
                        style={{
                          backgroundColor: `${accentColor}14`,
                          border: `1px solid ${accentColor}33`,
                          color: "#d4d8d5",
                        }}
                      >
                        {msg.content}
                      </div>
                    );
                  }

                  // assistant
                  return (
                    <div
                      key={msgIdx}
                      data-testid={`col-${idx}-msg-${msgIdx}`}
                      data-role="assistant"
                      className="text-sm whitespace-pre-wrap self-start w-full"
                      style={{ color: "#c8d0ca" }}
                    >
                      {msg.content}
                    </div>
                  );
                })}

                {col.loading && (
                  <span
                    className="animate-pulse text-sm"
                    style={{ color: accentColor }}
                  >
                    ▍ Thinking…
                  </span>
                )}
                {!col.loading && col.error && (
                  <span style={{ color: "#f87171" }}>⚠ {col.error}</span>
                )}
              </div>

              {/* Forward button — prominent */}
              {hasResponse && !col.loading && (
                <button
                  onClick={() => forward(idx)}
                  data-testid={`col-${idx}-forward`}
                  aria-label={`Forward ${COL_LABELS[idx]} response to ${COL_LABELS[idx === 0 ? 1 : 0]}`}
                  className="text-xs rounded px-4 py-2 font-bold uppercase tracking-wider border"
                  style={{
                    borderColor: `${COL_COLORS[idx === 0 ? 1 : 0]}66`,
                    color: COL_COLORS[idx === 0 ? 1 : 0],
                    backgroundColor: `${COL_COLORS[idx === 0 ? 1 : 0]}0d`,
                  }}
                  onMouseEnter={(e) => {
                    const c = COL_COLORS[idx === 0 ? 1 : 0];
                    e.currentTarget.style.backgroundColor = `${c}22`;
                  }}
                  onMouseLeave={(e) => {
                    const c = COL_COLORS[idx === 0 ? 1 : 0];
                    e.currentTarget.style.backgroundColor = `${c}0d`;
                  }}
                >
                  ↪ Forward to {COL_LABELS[idx === 0 ? 1 : 0]}
                </button>
              )}

              {/* Follow-up input */}
              <div className="flex gap-2">
                <label htmlFor={`col-${idx}-followup`} className="sr-only">
                  Follow-up for {COL_LABELS[idx]}
                </label>
                <input
                  id={`col-${idx}-followup`}
                  data-testid={`col-${idx}-followup`}
                  type="text"
                  value={col.followUp}
                  onChange={(e) => updateCol(idx, { followUp: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendFollowUp(idx);
                  }}
                  placeholder="Follow-up question…"
                  className="flex-1 text-xs px-3 py-1.5 rounded font-mono"
                  style={{
                    backgroundColor: "#080a09",
                    border: "1px solid rgba(57,255,20,0.15)",
                    color: "#d4d8d5",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = `${accentColor}66`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(57,255,20,0.15)";
                  }}
                />
                <button
                  onClick={() => sendFollowUp(idx)}
                  data-testid={`col-${idx}-followup-send`}
                  disabled={!col.followUp.trim() || col.loading}
                  aria-label={`Send follow-up for ${COL_LABELS[idx]}`}
                  className="text-xs px-3 py-1.5 rounded border"
                  style={{
                    borderColor: `${accentColor}33`,
                    color: accentColor,
                    backgroundColor: `${accentColor}0d`,
                    opacity: !col.followUp.trim() || col.loading ? 0.4 : 1,
                    cursor:
                      !col.followUp.trim() || col.loading
                        ? "not-allowed"
                        : "pointer",
                  }}
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
