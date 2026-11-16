# Devpost submission draft — Synomni Chamber (Kiroween 2026, Frankenstein)

**Name:** Synomni Chamber: a Frankenstein of models that actually talk

**Tagline:** One room where Claude, ChatGPT, Grok and a local model compare notes, argue in a conference, and share a memory layer — built with Kiro.

**Category:** Frankenstein (a chimera of model APIs + a multi-agent conference + an MCP server in one app)

**Repo (public, MIT):** https://github.com/danielfrancis109/synomni-kiroween

## Inspiration
People already use several AIs, but each model is trapped in its own tab. Good ideas die there. Chamber puts them side by side and lets one model critique another.

## What it does
- **Compare:** one prompt, two columns, each with its own provider/model. Follow up in either column, or **Forward** an answer to the other model to critique/build on it.
- **Conference:** 2–3 named agents with personas and providers share one transcript. Round-robin or open-floor. Agents may PASS (with a reason), never reply to themselves, and a max-turn cap ends the session.
- **Memory + MCP:** save any answer or transcript as a note; search it by keyword. The same store is exposed by an MCP stdio server (`search_memory`, `retrieve_context`, `save_memory`, `list_notes`) that Kiro itself is configured to use (`.kiro/settings/mcp.json`). `retrieve_context` can optionally also query the live Synomni API with a user-supplied token.
- **Works with no keys:** a deterministic offline Demo provider powers every feature; judges need no accounts. Bring-your-own keys (Anthropic, OpenAI, xAI, any OpenAI-compatible local endpoint such as Ollama) live only in the browser's localStorage and are used per request, never stored or logged by the server.

## How we built it with Kiro
(Everything below is real and visible in the repo's `/.kiro` directory.)
- **Kiro CLI (v3), spec mode:** the whole app was driven from `.kiro/specs/chamber/` — `requirements.md` (EARS acceptance criteria R1–R7), `design.md`, `tasks.md` (numbered tasks that were ticked off as Kiro implemented them).
- **Steering docs:** `.kiro/steering/product.md`, `tech.md`, `structure.md`, `security.md` (keys never committed or logged, SSRF rules, `.kiro` must never be gitignored). Kiro re-read these on every session.
- **Agent hooks:** `.kiro/hooks/test-on-save.json` (PostFileSave → Vitest) and `.kiro/hooks/secret-guard.json` (PreToolUse → asks before any file write that contains an API-key pattern).
- **MCP:** `.kiro/settings/mcp.json` registers this repo's own MCP server so Kiro can call `search_memory` / `retrieve_context`.
- **Spec-driven vs. vibe:** spec-driven for the architecture and first 8 task groups; targeted follow-up prompts ("vibe") for the Tailwind v4 pipeline fix and the design polish.
- Not used: Kiro IDE, custom agents, powers, property-based tests.

## Challenges
Tailwind v4 needed a different PostCSS pipeline than the model first assumed (the first build rendered unstyled; caught by a screenshot and fixed in a follow-up Kiro task). Hardening the SSRF guard for the local-model URL (private ranges, cloud metadata, IPv4-mapped IPv6).

## Accomplishments
75 unit tests, a Playwright smoke test of the whole flow, security headers, SSRF guard, a clean-clone `npm ci && npm run dev` path.

## What's next
Streaming responses, more providers, and a shared memory bridge to the full Synomni product.

## Built with
Kiro, Next.js, TypeScript, Tailwind CSS, Model Context Protocol, Zod, Vitest, Playwright, Anthropic / OpenAI / xAI APIs, Ollama.

## Pre-existing work disclosure
Synomni Chamber was created with Kiro during the Kiroween 2026 submission period. It is inspired by Synomni (https://synomni.infinitybuilds.download), a related multi-AI workspace first committed on 12 November 2026. This repository is a new, self-contained application; it does not include the private Synomni monorepo. Optional live-API features use a user-supplied token against the public Synomni REST API.

## Testing instructions for judges
```
git clone https://github.com/danielfrancis109/synomni-kiroween.git
cd synomni-kiroween && npm ci && npm run dev
# open http://localhost:3000/chamber — no login, no keys (Demo provider)
```
Hosted demo URL: _TODO — see docs/hosting-plan.md_.
