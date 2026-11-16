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
}

const PROVIDERS = [
  { id: "demo", label: "Demo", models: ["demo", "demo-scientist", "demo-philosopher"] },
  { id: "anthropic", label: "Anthropic", models: ["claude-opus-4-5", "claude-sonnet-4-5"] },
  { id: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini"] },
  { id: "xai", label: "xAI", models: ["grok-3", "grok-3-mini"] },
  { id: "local", label: "Local", models: ["llama3", "mistral"] },
];

function getStoredKey(id: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`synomni_key_${id}`) ?? "";
}

const DEFAULT_AGENTS: Agent[] = [
  { id: "agent-1", name: "Dr. Volt", providerId: "demo", model: "demo-scientist", persona: "A meticulous scientist who cites data." },
  { id: "agent-2", name: "Prof. Stitch", providerId: "demo", model: "demo-philosopher", persona: "A philosophical thinker who questions assumptions." },
];

export default function ConferencePanel({
  onSaveTranscript,
}: {
  onSaveTranscript?: (transcript: string) => void;
}) {
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
          const data = (await res.json()) as { error?: { message: string } };
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
              transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
            }, 50);
            return next;
          });
        }

        iterState = data.updatedState;
        if (data.complete) {
          setComplete(true);
          break;
        }
        // small delay to let React render
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
      const agentName = agents.find((a) => a.id === t.agentId)?.name ?? t.agentId;
      return `[${agentName}]: ${t.content}`;
    });
    onSaveTranscript(`Conference on "${topic}"\n\n${lines.join("\n\n")}`);
  }

  return (
    <section
      aria-label="Conference panel"
      data-testid="conference-panel"
      className="flex flex-col gap-4"
    >
      <h2 className="text-[#39ff14] font-bold tracking-widest uppercase text-sm">
        🧪 Conference
      </h2>

      {/* Agent config */}
      <div className="flex flex-col gap-3">
        {agents.map((agent, i) => {
          const provDef = PROVIDERS.find((p) => p.id === agent.providerId);
          return (
            <div
              key={agent.id}
              data-testid={`agent-config-${i}`}
              className="seam-border rounded p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[#39ff14] text-xs font-bold">Agent {i + 1}</span>
                {agents.length > 2 && (
                  <button
                    onClick={() => removeAgent(agent.id)}
                    aria-label={`Remove agent ${i + 1}`}
                    className="text-red-400 text-xs hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`agent-${i}-name`} className="text-xs text-gray-500">Name</label>
                  <input
                    id={`agent-${i}-name`}
                    data-testid={`agent-${i}-name`}
                    type="text"
                    value={agent.name}
                    onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                    className="bg-[#0d0d0d] border border-[#39ff14]/20 text-gray-200 text-xs px-2 py-1 rounded font-mono focus:outline-none focus:border-[#39ff14]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`agent-${i}-provider`} className="text-xs text-gray-500">Provider</label>
                  <select
                    id={`agent-${i}-provider`}
                    data-testid={`agent-${i}-provider`}
                    value={agent.providerId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const firstModel = PROVIDERS.find((p) => p.id === pid)?.models[0] ?? pid;
                      updateAgent(agent.id, { providerId: pid, model: firstModel });
                    }}
                    className="bg-[#0d0d0d] border border-[#39ff14]/20 text-gray-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-[#39ff14]"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`agent-${i}-model`} className="text-xs text-gray-500">Model</label>
                  <select
                    id={`agent-${i}-model`}
                    data-testid={`agent-${i}-model`}
                    value={agent.model}
                    onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
                    className="bg-[#0d0d0d] border border-[#39ff14]/20 text-gray-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-[#39ff14]"
                  >
                    {(provDef?.models ?? [agent.model]).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`agent-${i}-persona`} className="text-xs text-gray-500">Persona</label>
                  <input
                    id={`agent-${i}-persona`}
                    data-testid={`agent-${i}-persona`}
                    type="text"
                    value={agent.persona}
                    onChange={(e) => updateAgent(agent.id, { persona: e.target.value })}
                    placeholder="One-line persona…"
                    className="bg-[#0d0d0d] border border-[#39ff14]/20 text-gray-200 text-xs px-2 py-1 rounded font-mono focus:outline-none focus:border-[#39ff14]"
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
            className="text-xs border border-dashed border-[#39ff14]/30 text-[#39ff14]/60 px-3 py-2 rounded hover:border-[#39ff14]/60 hover:text-[#39ff14] transition-colors"
          >
            + Add Agent (max 3)
          </button>
        )}
      </div>

      {/* Policy + topic + max turns */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label htmlFor="conf-policy" className="text-xs text-gray-500 uppercase">Policy</label>
            <select
              id="conf-policy"
              data-testid="conf-policy"
              value={policy}
              onChange={(e) => setPolicy(e.target.value as "round-robin" | "open-floor")}
              className="bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-[#39ff14]"
            >
              <option value="round-robin">Round-robin</option>
              <option value="open-floor">Open-floor</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="conf-max-turns" className="text-xs text-gray-500 uppercase">Max turns</label>
            <input
              id="conf-max-turns"
              data-testid="conf-max-turns"
              type="number"
              min={2}
              max={20}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-20 bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-[#39ff14]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="conf-topic" className="text-xs text-gray-500 uppercase">Topic / opening prompt</label>
          <textarea
            id="conf-topic"
            data-testid="conf-topic"
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should the agents discuss?"
            className="bg-[#0d0d0d] border border-[#39ff14]/30 text-gray-200 text-xs px-3 py-2 rounded font-mono focus:outline-none focus:border-[#39ff14] resize-none"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
        <button
          onClick={start}
          disabled={running || !topic.trim() || agents.length < 2}
          data-testid="conf-start"
          className="bg-[#39ff14] text-black font-bold px-6 py-2 rounded text-sm hover:bg-[#2fd10e] disabled:opacity-40 transition-colors"
        >
          Start
        </button>
        {running && (
          <button
            onClick={stop}
            data-testid="conf-stop"
            className="border border-red-500/60 text-red-400 font-bold px-6 py-2 rounded text-sm hover:border-red-400 transition-colors"
          >
            Stop
          </button>
        )}
        {complete && (
          <span data-testid="conf-complete" className="text-[#39ff14] text-xs">
            ✓ Max turns reached
          </span>
        )}
      </div>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        role="log"
        aria-label="Conference transcript"
        aria-live="polite"
        data-testid="conf-transcript"
        className="bg-[#080808] border border-[#39ff14]/10 rounded p-3 font-mono text-xs text-gray-300 max-h-80 overflow-y-auto flex flex-col gap-3"
      >
        {transcript.length === 0 && (
          <span className="text-gray-600 italic">Conference transcript will appear here…</span>
        )}
        {transcript.map((turn, i) => {
          const agentName = agents.find((a) => a.id === turn.agentId)?.name ?? turn.agentId;
          return (
            <div key={i} data-testid={`turn-${i}`} className="flex flex-col gap-1">
              <span className="text-[#39ff14] font-bold">{agentName}</span>
              <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{turn.content}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-red-400 text-xs" data-testid="conf-error">
          ⚠ {error}
        </p>
      )}

      {transcript.length > 0 && (
        <button
          onClick={handleSaveTranscript}
          data-testid="conf-save-transcript"
          className="self-start text-xs border border-[#39ff14]/40 text-[#39ff14] px-4 py-1.5 rounded hover:bg-[#39ff14]/10 transition-colors"
        >
          Save transcript to Memory
        </button>
      )}
    </section>
  );
}
