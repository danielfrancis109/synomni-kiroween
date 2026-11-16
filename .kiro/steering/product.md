# Product — Synomni Chamber

Synomni Chamber is a single-screen "Frankenstein" AI workspace: it stitches multiple LLM provider APIs, a multi-agent conference room, and an MCP memory server into one small runnable app. Inspired by the live multi-AI hub at synomni.infinitybuilds.download.

## Users
Developers and power users who want to compare LLM outputs side-by-side, run structured multi-agent conversations, and persist notes from those conversations.

## Core value
- **Compare**: send the same prompt to two models simultaneously, then cross-pollinate answers with a "Forward" button.
- **Conference**: 2–3 named agents (each with a provider + persona) converse in a shared transcript under a deterministic round-robin or open-floor policy.
- **Memory**: save any answer as a named note; search and retrieve notes; expose everything over MCP so external tools can consume it.

## Non-goals
- Not a hosted SaaS — single `npm run dev` on localhost:3000.
- No user accounts, no server-side key storage, no billing.
- No real-time streaming UI (streaming-free `complete()` is fine for v1).

## Demo provider requirement
The app must be fully usable with no API keys via a built-in deterministic Demo provider (persona-based, offline). This is both a convenience and a CI requirement: all automated tests run against Demo.

## Visual identity
Dark "laboratory" theme: electric-green (`#39ff14`) accents on near-black (`#0d0d0d`), monospace type for transcripts, stitched-seam motif as a decorative CSS border pattern. Accessible contrast ratios (WCAG AA).
