import type { ProviderId } from "./providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Agent {
  id: string;
  name: string;
  persona: string;
  providerId: ProviderId;
  model: string;
}

export interface Turn {
  agentId: string;
  content: string;
  pass: boolean;
  passReason?: string;
  timestamp: number;
}

export type TurnPolicy = "round-robin" | "open-floor";

export interface ConferenceState {
  agents: Agent[];
  transcript: Turn[];
  policy: TurnPolicy;
  maxTurns: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ConferenceCompleteError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ConferenceCompleteError";
  }
}

// ---------------------------------------------------------------------------
// Pure turn-policy helpers
// ---------------------------------------------------------------------------

/** Index of the agent that produced the most recent non-PASS turn, or -1. */
function lastSpeakerIndex(state: ConferenceState): number {
  for (let i = state.transcript.length - 1; i >= 0; i--) {
    const turn = state.transcript[i]!;
    if (!turn.pass) {
      return state.agents.findIndex((a) => a.id === turn.agentId);
    }
  }
  return -1;
}

/** True when every agent PASSed in the last full round (agents.length turns). */
function allPassedInLastRound(state: ConferenceState): boolean {
  const { agents, transcript } = state;
  if (transcript.length < agents.length) return false;
  const lastRound = transcript.slice(-agents.length);
  return lastRound.every((t) => t.pass);
}

/**
 * Returns the index of the next agent that should speak.
 * Throws `ConferenceCompleteError` if the conference should end.
 */
export function nextAgentIndex(state: ConferenceState): number {
  const { agents, transcript, policy, maxTurns } = state;

  if (transcript.length >= maxTurns) {
    throw new ConferenceCompleteError("Max turns reached");
  }

  if (allPassedInLastRound(state) && transcript.length > 0) {
    throw new ConferenceCompleteError("All agents passed in the last round");
  }

  const lastIdx = lastSpeakerIndex(state);

  if (policy === "round-robin") {
    // Start at index 0 if no one has spoken yet
    if (lastIdx === -1) return 0;
    // Advance and skip the last speaker to prevent self-reply
    for (let offset = 1; offset <= agents.length; offset++) {
      const candidate = (lastIdx + offset) % agents.length;
      if (candidate !== lastIdx) return candidate;
    }
    // Fallback (should never reach here with 2+ agents)
    return (lastIdx + 1) % agents.length;
  }

  // open-floor: scan last non-PASS content for a name nomination
  if (policy === "open-floor") {
    // Find the last non-PASS turn
    const lastNonPass = [...transcript].reverse().find((t) => !t.pass);

    if (lastNonPass) {
      const contentLower = lastNonPass.content.toLowerCase();
      const lastNonPassAgentIdx = agents.findIndex(
        (a) => a.id === lastNonPass.agentId
      );

      // Find a nominated agent (name appears in content, not the speaker)
      const nominated = agents.findIndex((a, idx) => {
        return (
          idx !== lastNonPassAgentIdx &&
          contentLower.includes(a.name.toLowerCase())
        );
      });

      if (nominated !== -1) return nominated;
    }

    // Fall back to round-robin
    if (lastIdx === -1) return 0;
    return (lastIdx + 1) % agents.length;
  }

  // Default fallback
  if (lastIdx === -1) return 0;
  return (lastIdx + 1) % agents.length;
}

/**
 * Returns true when the conference should stop.
 */
export function isComplete(state: ConferenceState): boolean {
  if (state.transcript.length >= state.maxTurns) return true;
  if (allPassedInLastRound(state) && state.transcript.length > 0) return true;
  return false;
}
