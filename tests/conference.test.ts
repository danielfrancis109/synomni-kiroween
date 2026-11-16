import { describe, it, expect } from "vitest";
import {
  nextAgentIndex,
  isComplete,
  ConferenceCompleteError,
} from "../src/lib/conference.js";
import type { ConferenceState, Agent, Turn } from "../src/lib/conference.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgents(n: number): Agent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `agent-${i}`,
    name: `Agent${i}`,
    persona: `Persona for agent ${i}`,
    providerId: "demo" as const,
    model: "demo",
  }));
}

function makeTurn(agentId: string, content = "Some text"): Turn {
  return { agentId, content, pass: false, timestamp: Date.now() };
}

function makePassTurn(agentId: string, reason = "No more to add"): Turn {
  return { agentId, content: "", pass: true, passReason: reason, timestamp: Date.now() };
}

function state(
  overrides: Partial<ConferenceState> & Pick<ConferenceState, "agents">
): ConferenceState {
  return {
    transcript: [],
    policy: "round-robin",
    maxTurns: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Round-robin
// ---------------------------------------------------------------------------

describe("round-robin policy", () => {
  it("starts at agent 0 when transcript is empty", () => {
    const s = state({ agents: makeAgents(3) });
    expect(nextAgentIndex(s)).toBe(0);
  });

  it("advances to next agent after agent 0 speaks", () => {
    const agents = makeAgents(3);
    const s = state({
      agents,
      transcript: [makeTurn("agent-0")],
    });
    expect(nextAgentIndex(s)).toBe(1);
  });

  it("wraps around after last agent", () => {
    const agents = makeAgents(3);
    const s = state({
      agents,
      transcript: [
        makeTurn("agent-0"),
        makeTurn("agent-1"),
        makeTurn("agent-2"),
      ],
    });
    // Last turn was agent-2 (idx 2), next is (2+1)%3 = 0
    expect(nextAgentIndex(s)).toBe(0);
  });

  it("never selects the agent who spoke last (no self-reply)", () => {
    const agents = makeAgents(2);
    // With 2 agents, after agent-0 → agent-1, after agent-1 → agent-0
    const s0 = state({ agents, transcript: [makeTurn("agent-0")] });
    expect(nextAgentIndex(s0)).toBe(1);

    const s1 = state({ agents, transcript: [makeTurn("agent-0"), makeTurn("agent-1")] });
    expect(nextAgentIndex(s1)).toBe(0);
  });

  // 10.7: round-robin advances from the MOST RECENT turn (PASS included),
  // so a PASS hands the floor to the next agent in sequence.
  it("advances from PASS turn — PASS hands floor to next agent (10.7)", () => {
    const agents = makeAgents(3);
    // agent-0 spoke, then agent-1 PASSed
    // The most recent turn is agent-1 (PASS); next should be (1+1)%3 = 2
    const s = state({
      agents,
      transcript: [
        makeTurn("agent-0"),
        makePassTurn("agent-1"),
      ],
    });
    expect(nextAgentIndex(s)).toBe(2);
  });

  it("PASS by agent-2 advances to agent-0 (wraps around, 10.7)", () => {
    const agents = makeAgents(3);
    const s = state({
      agents,
      transcript: [
        makeTurn("agent-0"),
        makeTurn("agent-1"),
        makePassTurn("agent-2"),
      ],
    });
    // Most recent turn is agent-2 (PASS, idx 2), next = (2+1)%3 = 0
    expect(nextAgentIndex(s)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Open-floor policy
// ---------------------------------------------------------------------------

describe("open-floor policy", () => {
  it("nominates the agent whose name appears in last message", () => {
    const agents = makeAgents(3);
    // Agent0 mentions "Agent2" in their message
    const s = state({
      agents,
      policy: "open-floor",
      transcript: [makeTurn("agent-0", "I think Agent2 should respond to this.")],
    });
    expect(nextAgentIndex(s)).toBe(2);
  });

  it("falls back to round-robin if no name matches", () => {
    const agents = makeAgents(3);
    const s = state({
      agents,
      policy: "open-floor",
      transcript: [makeTurn("agent-0", "No specific nomination here.")],
    });
    // Falls back: last (recent) turn was agent-0 (idx 0), next = (0+1)%3 = 1
    expect(nextAgentIndex(s)).toBe(1);
  });

  it("does not self-nominate (falls back if only self name found)", () => {
    const agents = makeAgents(2);
    // Agent0 mentions their own name
    const s = state({
      agents,
      policy: "open-floor",
      transcript: [makeTurn("agent-0", "I, Agent0, think...")],
    });
    // Self-nomination falls back; last recent idx=0, next = 1
    expect(nextAgentIndex(s)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PASS advancement
// ---------------------------------------------------------------------------

describe("PASS turns", () => {
  it("PASS hands floor to the next agent in round-robin order (10.7)", () => {
    const agents = makeAgents(3);
    // agent-0 spoke, then agent-1 PASSed → next is agent-2 (idx 2)
    const s = state({
      agents,
      transcript: [
        makeTurn("agent-0"),
        makePassTurn("agent-1"),
      ],
    });
    expect(nextAgentIndex(s)).toBe(2);
  });

  it("throws ConferenceCompleteError when all agents pass in one round", () => {
    const agents = makeAgents(2);
    const s = state({
      agents,
      transcript: [
        makePassTurn("agent-0"),
        makePassTurn("agent-1"),
      ],
    });
    expect(() => nextAgentIndex(s)).toThrow(ConferenceCompleteError);
  });
});

// ---------------------------------------------------------------------------
// Max-turn guard
// ---------------------------------------------------------------------------

describe("max-turn cap", () => {
  it("throws ConferenceCompleteError at maxTurns", () => {
    const agents = makeAgents(2);
    const s = state({
      agents,
      maxTurns: 2,
      transcript: [makeTurn("agent-0"), makeTurn("agent-1")],
    });
    expect(() => nextAgentIndex(s)).toThrow(ConferenceCompleteError);
  });

  it("does not throw before maxTurns is reached", () => {
    const agents = makeAgents(2);
    const s = state({
      agents,
      maxTurns: 3,
      transcript: [makeTurn("agent-0"), makeTurn("agent-1")],
    });
    expect(() => nextAgentIndex(s)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isComplete
// ---------------------------------------------------------------------------

describe("isComplete", () => {
  it("returns true when transcript.length >= maxTurns", () => {
    const agents = makeAgents(2);
    const s = state({
      agents,
      maxTurns: 2,
      transcript: [makeTurn("agent-0"), makeTurn("agent-1")],
    });
    expect(isComplete(s)).toBe(true);
  });

  it("returns false when below maxTurns", () => {
    const agents = makeAgents(2);
    const s = state({
      agents,
      maxTurns: 4,
      transcript: [makeTurn("agent-0"), makeTurn("agent-1")],
    });
    expect(isComplete(s)).toBe(false);
  });

  it("returns true when all agents PASSed in last round", () => {
    const agents = makeAgents(2);
    const s = state({
      agents,
      maxTurns: 10,
      transcript: [
        makeTurn("agent-0"),
        makePassTurn("agent-0"),
        makePassTurn("agent-1"),
      ],
    });
    expect(isComplete(s)).toBe(true);
  });

  it("returns false on empty transcript", () => {
    const agents = makeAgents(2);
    const s = state({ agents, maxTurns: 10 });
    expect(isComplete(s)).toBe(false);
  });
});
