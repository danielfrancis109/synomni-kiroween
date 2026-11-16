"use client";

import { useState, useRef } from "react";

interface Agent {
  id: string;
  name: string;
  providerId: string;
  model: string;
  persona: string;
}

interface Turn {
  agentId: string;
  content: string;
  pass: boolean;
  passReason?: string;
  timestamp: number;
}

interface ConferenceState {
  agents: Agent[];
  transcript: Turn[];
  policy: "round-robin" | "open-floor";
  maxTurns: number;
  topic?: string;
}

const ALL_PROVIDERS = [
  { id: "demo", label: "Demo", models: ["demo", "demo-scientist", "demo-philosopher"] },
  { id: "anthropic", label: "Anthropic", models: ["claude-opus-4-5", "claude-sonnet-4-5"] },
  { id: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini"] },
  { id: "xai", label: "xAI", models: ["grok-3", "grok-3-mini"] },
  { id: "local", label: "Local", models: ["llama3", "mistral"] },
];

// Per-agent accent colors: green, cyan, violet
const AGENT_COLORS = ["#39ff14", "#14e0ff", "#bf7fff"] as const;

function getStoredKey(id: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`synomni_key_${id}`) ?? "";
}

function agentInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: "agent-1",
    name: "Dr. Volt",
    providerId: "demo",
    model: "demo-scientist",
    persona: "A meticulous scientist who cites data.",
  },
  {
    id: "agent-2",
    name: "Prof. Stitch",
    providerId: "demo",
    model: "demo-philosopher",
    persona: "A philosophical thinker who questions assumptions.",
  },
];

export default function ConferencePanel({
  onSaveTranscript,
  hosted = false,
}: {
  onSaveTranscript?: (transcript: string) => void;
  hosted?: boolean;
}) {
  const PROVIDERS = hosted
    ? ALL_PROVIDERS.filter((p) => p.id !== "local")
    : ALL_PROVIDERS;
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS);
  const [policy, setPolicy] = useState<"round-robin" | "open-floor">("round-robin");
  const [maxTurns, setMaxTurns] = useState(6);
  const [topic, setTopic] = useState("");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const stopRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  function agentColor(agentId: string): string {
    const idx = agents.findIndex((a) => a.id === agentId);
    return AGENT_COLORS[Math.max(0, idx) % AGENT_COLORS.length];
  }

  function addAgent() {
    if (agents.length >= 3) return;
    setAgents((prev) => [
      ...prev,
      {
        id: `agent-${Date.now()}`,
        name: `Agent ${prev.length + 1}`,
        providerId: "demo",
        model: "demo",
        persona: "",
      },
    ]);
  }

  function removeAgent(id: string) {
    if (agents.length <= 2) return;
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }

  function updateAgent(id: string, patch: Partial<Agent>) {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }

  async function start() {
    if (!topic.trim() || agents.length < 2) return;
    setTranscript([]);
    setComplete(false);
    setError("");
    setRunning(true);
    stopRef.current = false;

    const initialState: ConferenceState = {
      agents,
      transcript: [],
      policy,
      maxTurns,
      topic: topic.trim() || undefined,
    };

    try {
      let iterState = initialState;
      while (!stopRef.current) {
        const res = await fetch("/api/conference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: iterState,
            apiKeys: Object.fromEntries(
              agents.map((a) => [a.providerId, getStoredKey(a.providerId)])
            ),
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as {
            error?: { message: string };
          };
          throw new Error(data.error?.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          turn?: Turn;
          updatedState: ConferenceState;
          complete: boolean;
        };

        if (data.turn) {
          setTranscript((prev) => {
            const next = [...prev, data.turn!];
            setTimeout(() => {
              transcriptRef.current?.scrollTo({
                top: transcriptRef.current.scrollHeight,
                behavior: "smooth",
              });
            }, 50);
            return next;
          });
        }

        iterState = data.updatedState;
        if (data.complete) {
          setComplete(true);
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conference error");
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
  }

  function handleSaveTranscript() {
    if (!onSaveTranscript || transcript.length === 0) return;
    const lines = transcript.map((t) => {
      const agentName =
        agents.find((a) => a.id === t.agentId)?.name ?? t.agentId;
      return t.pass
        ? `[${agentName}]: PASS — ${t.passReason ?? "nothing to add"}`
        : `[${agentName}]: ${t.content}`;
    });
    onSaveTranscript(`Conference on "${topic}"\n\n${lines.join("\n\n")}`);
  }

  return (
    <section
      aria-label="Conference panel"
      data-testid="conference-panel"
      className="flex flex-col gap-4"
    >
      {/* Panel heading */}
      <div className="flex items-center gap-2">
        <span aria-hidden="true">🧪</span>
        <h2
          className="font-bold tracking-widest uppercase text-sm glow-text"
          style={{ color: "#39ff14" }}
        >
          Conference
        </h2>
      </div>

      {/* Agent configs */}
      <div className="flex flex-col gap-2">
        {agents.map((agent, i) => {
          const provDef = PROVIDERS.find((p) => p.id === agent.providerId);
          const color = AGENT_COLORS[i % AGENT_COLORS.length];
          return (
            <div
              key={agent.id}
              data-testid={`agent-config-${i}`}
              className="rounded p-3 flex flex-col gap-2"
              style={{
                backgroundColor: "#0b0d0c",
                border: `1px dashed ${color}33`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: `${color}22`,
                      color,
                      border: `1px solid ${color}55`,
                    }}
                  >
                    {agentInitials(agent.name) || String(i + 1)}
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color }}
                  >
                    Agent {i + 1}
                  </span>
                </div>
                {agents.length > 2 && (
                  <button
                    onClick={() => removeAgent(agent.id)}
                    aria-label={`Remove agent ${i + 1}`}
                    className="text-xs"
                    style={{ color: "rgba(248,113,113,0.6)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#f87171";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(248,113,113,0.6)";
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`agent-${i}-name`}
                    className="text-xs"
                    style={{ color: "rgba(180,200,185,0.4)" }}
                  >
                    Name
                  </label>
                  <input
                    id={`agent-${i}-name`}
                    data-testid={`agent-${i}-name`}
                    type="text"
                    value={agent.name}
                    onChange={(e) =>
                      updateAgent(agent.id, { name: e.target.value })
                    }
                    className="text-xs px-2 py-1 rounded font-mono"
                    style={{
                      backgroundColor: "#080a09",
                      border: "1px solid rgba(57,255,20,0.15)",
                      color: "#d4d8d5",
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`agent-${i}-provider`}
                    className="text-xs"
                    style={{ color: "rgba(180,200,185,0.4)" }}
                  >
                    Provider
                  </label>
                  <select
                    id={`agent-${i}-provider`}
                    data-testid={`agent-${i}-provider`}
                    value={agent.providerId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const firstModel =
                        PROVIDERS.find((p) => p.id === pid)?.models[0] ?? pid;
                      updateAgent(agent.id, { providerId: pid, model: firstModel });
                    }}
                    className="text-xs px-2 py-1 rounded font-mono"
                    style={{
                      backgroundColor: "#080a09",
                      border: "1px solid rgba(57,255,20,0.15)",
                      color: "#d4d8d5",
                    }}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`agent-${i}-model`}
                    className="text-xs"
                    style={{ color: "rgba(180,200,185,0.4)" }}
                  >
                    Model
                  </label>
                  <select
                    id={`agent-${i}-model`}
                    data-testid={`agent-${i}-model`}
                    value={agent.model}
                    onChange={(e) =>
                      updateAgent(agent.id, { model: e.target.value })
                    }
                    className="text-xs px-2 py-1 rounded font-mono"
                    style={{
                      backgroundColor: "#080a09",
                      border: "1px solid rgba(57,255,20,0.15)",
                      color: "#d4d8d5",
                    }}
                  >
                    {(provDef?.models ?? [agent.model]).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`agent-${i}-persona`}
                    className="text-xs"
                    style={{ color: "rgba(180,200,185,0.4)" }}
                  >
                    Persona
                  </label>
                  <input
                    id={`agent-${i}-persona`}
                    data-testid={`agent-${i}-persona`}
                    type="text"
                    value={agent.persona}
                    onChange={(e) =>
                      updateAgent(agent.id, { persona: e.target.value })
                    }
                    placeholder="One-line persona…"
                    className="text-xs px-2 py-1 rounded font-mono"
                    style={{
                      backgroundColor: "#080a09",
                      border: "1px solid rgba(57,255,20,0.15)",
                      color: "#d4d8d5",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {agents.length < 3 && (
          <button
            onClick={addAgent}
            data-testid="add-agent"
            className="text-xs px-3 py-2 rounded border border-dashed self-start"
            style={{
              borderColor: "rgba(57,255,20,0.25)",
              color: "rgba(57,255,20,0.5)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(57,255,20,0.6)";
              e.currentTarget.style.color = "#39ff14";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(57,255,20,0.25)";
              e.currentTarget.style.color = "rgba(57,255,20,0.5)";
            }}
          >
            + Add Agent (max 3)
          </button>
        )}
      </div>

      {/* Policy + topic + max turns */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="conf-policy"
              className="text-xs uppercase tracking-wider"
              style={{ color: "rgba(180,200,185,0.4)" }}
            >
              Policy
            </label>
            <select
              id="conf-policy"
              data-testid="conf-policy"
              value={policy}
              onChange={(e) =>
                setPolicy(e.target.value as "round-robin" | "open-floor")
              }
              className="text-xs px-2 py-1.5 rounded font-mono"
              style={{
                backgroundColor: "#080a09",
                border: "1px solid rgba(57,255,20,0.2)",
                color: "#d4d8d5",
              }}
            >
              <option value="round-robin">Round-robin</option>
              <option value="open-floor">Open-floor</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="conf-max-turns"
              className="text-xs uppercase tracking-wider"
              style={{ color: "rgba(180,200,185,0.4)" }}
            >
              Max turns
            </label>
            <input
              id="conf-max-turns"
              data-testid="conf-max-turns"
              type="number"
              min={2}
              max={20}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-20 text-xs px-2 py-1.5 rounded font-mono"
              style={{
                backgroundColor: "#080a09",
                border: "1px solid rgba(57,255,20,0.2)",
                color: "#d4d8d5",
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="conf-topic"
            className="text-xs uppercase tracking-wider"
            style={{ color: "rgba(180,200,185,0.4)" }}
          >
            Topic / opening prompt
          </label>
          <textarea
            id="conf-topic"
            data-testid="conf-topic"
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should the agents discuss?"
            className="text-xs px-3 py-2 rounded font-mono resize-none"
            style={{
              backgroundColor: "#080a09",
              border: "1px solid rgba(57,255,20,0.2)",
              color: "#d4d8d5",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(57,255,20,0.6)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(57,255,20,0.2)";
            }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
        <button
          onClick={start}
          disabled={running || !topic.trim() || agents.length < 2}
          data-testid="conf-start"
          className="font-bold px-5 py-2 rounded text-sm uppercase tracking-wider"
          style={{
            backgroundColor:
              running || !topic.trim() || agents.length < 2
                ? "rgba(57,255,20,0.3)"
                : "#39ff14",
            color: "#0b0d0c",
            opacity: running || !topic.trim() || agents.length < 2 ? 0.5 : 1,
            cursor:
              running || !topic.trim() || agents.length < 2
                ? "not-allowed"
                : "pointer",
          }}
        >
          Start
        </button>
        {running && (
          <button
            onClick={stop}
            data-testid="conf-stop"
            className="font-bold px-5 py-2 rounded text-sm uppercase tracking-wider border"
            style={{
              borderColor: "rgba(248,113,113,0.5)",
              color: "#f87171",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#f87171";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(248,113,113,0.5)";
            }}
          >
            Stop
          </button>
        )}
        {complete && (
          <span
            data-testid="conf-complete"
            className="text-xs font-mono"
            style={{ color: "#39ff14" }}
          >
            ✓ Max turns reached
          </span>
        )}
      </div>

      {/* Chat-style transcript */}
      <div
        ref={transcriptRef}
        role="log"
        aria-label="Conference transcript"
        aria-live="polite"
        data-testid="conf-transcript"
        className="rounded p-3 font-mono text-xs overflow-y-auto flex flex-col gap-3"
        style={{
          backgroundColor: "#080a09",
          border: "1px solid rgba(57,255,20,0.08)",
          color: "#c8d0ca",
          maxHeight: "20rem",
          minHeight: "6rem",
        }}
      >
        {transcript.length === 0 && (
          <span
            className="italic"
            style={{ color: "rgba(100,120,105,0.5)" }}
          >
            Conference transcript will appear here…
          </span>
        )}
        {transcript.map((turn, i) => {
          const agent = agents.find((a) => a.id === turn.agentId);
          const agentName = agent?.name ?? turn.agentId;
          const color = agentColor(turn.agentId);
          return (
            <div key={i} data-testid={`turn-${i}`} className="flex gap-2">
              {/* Avatar */}
              <span
                className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mt-0.5"
                style={{
                  backgroundColor: `${color}1a`,
                  color,
                  border: `1px solid ${color}44`,
                }}
                aria-hidden="true"
              >
                {agentInitials(agentName)}
              </span>

              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold" style={{ color }}>
                    {agentName}
                  </span>
                  {/* PASS badge */}
                  {turn.pass && (
                    <span
                      data-testid={`turn-${i}-pass`}
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border"
                      style={{
                        borderColor: "rgba(251,191,36,0.4)",
                        color: "#fbbf24",
                        backgroundColor: "rgba(251,191,36,0.08)",
                      }}
                      title={turn.passReason ?? "PASS"}
                    >
                      PASS
                      {turn.passReason && (
                        <span data-testid={`turn-${i}-pass-reason`} style={{ color: "rgba(251,191,36,0.6)" }}>
                          · {turn.passReason}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <p
                  className="whitespace-pre-wrap leading-relaxed"
                  style={{ color: "#c8d0ca" }}
                >
                  {turn.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="text-xs"
          data-testid="conf-error"
          style={{ color: "#f87171" }}
        >
          ⚠ {error}
        </p>
      )}

      {transcript.length > 0 && (
        <button
          onClick={handleSaveTranscript}
          data-testid="conf-save-transcript"
          className="self-start text-xs rounded px-4 py-1.5 border"
          style={{
            borderColor: "rgba(57,255,20,0.35)",
            color: "#39ff14",
            backgroundColor: "rgba(57,255,20,0.06)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(57,255,20,0.14)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(57,255,20,0.06)";
          }}
        >
          Save transcript to Memory
        </button>
      )}
    </section>
  );
}
