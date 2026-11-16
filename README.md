# Synomni Chamber

> **WIP** — Kiroween 2026 entry. Full docs coming in Task 8.

A single-screen "Frankenstein" AI workspace: compare LLM outputs side-by-side, run structured multi-agent conferences, and persist notes — all from one `npm run dev`.

---

## Quick start

```bash
git clone <repo>
cd synomni-chamber
npm ci
npm run dev      # dev server on http://localhost:3000
```

## Commands

```bash
npm run dev       # development server
npm run build     # production build
npm test          # vitest unit suite
npm run test:e2e  # playwright smoke tests
node cli/mcp.ts   # MCP stdio server
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER_TIMEOUT_MS` | `30000` | Provider request timeout (ms) |
| `MEMORY_FILE` | `./data/memory.json` | Memory store file path |
| `ALLOW_LOCAL_URLS` | `false` | Allow Local provider to use loopback/private IPs |
| `LOCAL_URL_ALLOWLIST` | _(none)_ | Comma-separated hostname allowlist for Local provider |

Copy `.env.example` to `.env.local` and set values there. Never commit real API keys.

## MCP server

```bash
node cli/mcp.ts
```

Exposes four tools: `save_memory`, `list_notes`, `retrieve_context`, `search_memory`.

## Disclosure

This project is a [Kiroween 2026](https://kiro.dev) hackathon entry. It is inspired by — but not copied from — [Synomni](https://synomni.infinitybuilds.download), a live multi-AI hub. All code was written independently.
