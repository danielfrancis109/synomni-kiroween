# Synomni Chamber

A single-screen "Frankenstein" AI workspace: compare two LLM outputs side-by-side, run structured multi-agent conferences, and persist notes — all in one `npm run dev`.

Electric-green-on-black laboratory theme, monospace everywhere, stitched-seam CSS borders.

---

## Clone and run

```bash
git clone <repo-url>
cd synomni-chamber
npm ci
npm run dev        # http://localhost:3000 → redirects to /chamber
```

Open **http://localhost:3000/chamber** in your browser. No API keys are required — the built-in **Demo** provider works offline for all three panels.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build (TypeScript check + Turbopack) |
| `npm start` | Serve the production build |
| `npm test` | Vitest unit suite (providers, conference, memory, MCP, security) |
| `npm run test:e2e` | Playwright smoke test against Demo provider (port 3001) |

---

## Environment variables

Copy `.env.example` to `.env.local` and set values there. Never commit `.env.local`.

| Variable | Default | Description |
|---|---|---|
| `PROVIDER_TIMEOUT_MS` | `30000` | Milliseconds before a provider fetch is aborted |
| `MEMORY_FILE` | `./data/memory.json` | Path to the JSON memory store |
| `ALLOW_LOCAL_URLS` | `false` | Set `true` to allow the Local provider to reach `localhost` / private IPs (required for Ollama) |
| `LOCAL_URL_ALLOWLIST` | _(none)_ | Comma-separated hostnames permitted for the Local provider, e.g. `localhost,my-ollama.internal` |

### Using Ollama (bring-your-own model)

1. Start Ollama: `ollama serve`
2. Set `ALLOW_LOCAL_URLS=true` in `.env.local`
3. In the app Settings drawer, paste your Ollama base URL (e.g. `http://localhost:11434`) into the **Local** key field
4. Select **Local** as the provider in Compare or Conference and pick a model name that matches a pulled Ollama model

---

## API key settings

Click **⚙ Settings** in the top-right corner. Keys are stored in browser `localStorage` only — the server uses them for one request and discards them immediately. Keys never appear in logs or commits.

Supported providers: **Anthropic**, **OpenAI**, **xAI (Grok)**, **Local (Ollama)**.

---

## MCP memory server

The memory store is exposed as an MCP stdio server so external tools (including Kiro) can read and write notes.

### Start manually

```bash
node --import tsx/esm cli/mcp.ts
# or via npx:
npx tsx cli/mcp.ts
```

### Tools exposed

| Tool | Description |
|---|---|
| `save_memory` | Save a note with a title and content |
| `list_notes` | List all saved notes (title + date) |
| `retrieve_context` | Retrieve a single note by ID |
| `search_memory` | Keyword search across all notes |

### Register with Kiro (`.kiro/settings/mcp.json`)

```json
{
  "mcpServers": {
    "synomni-chamber-memory": {
      "command": "npx",
      "args": ["tsx", "cli/mcp.ts"],
      "env": {}
    }
  }
}
```

This file is already committed in the repo. Kiro picks it up automatically when the workspace is opened.

---

## Project structure

```
src/
  app/
    chamber/page.tsx          # One-screen workspace (Compare + Conference + Memory)
    api/chat/route.ts         # Provider proxy for Compare
    api/conference/route.ts   # Single conference turn
    api/memory/route.ts       # Memory CRUD (GET list/search, POST save)
    api/memory/[id]/route.ts  # DELETE a note
  lib/
    providers.ts              # Provider interface + Demo, Anthropic, OpenAI, xAI, Local
    conference.ts             # Pure turn-policy logic (round-robin / open-floor)
    memory.ts                 # JSON-file memory store
    security.ts               # SSRF guard, security headers, input size limits
  components/
    ComparePanel.tsx          # Side-by-side model comparison with Forward
    ConferencePanel.tsx       # Multi-agent conference room
    MemoryPanel.tsx           # Note list, search, save
    SettingsDrawer.tsx        # API key management
cli/
  mcp.ts                      # MCP stdio server
tests/                        # Vitest unit tests
e2e/
  smoke.test.ts               # Playwright smoke test
```

---

## How Kiro was used

Synomni Chamber was built end-to-end with **Kiro IDE**. The following project artifacts encode the decisions Kiro made and followed throughout:

### Steering (`/.kiro/steering/`)

| File | Purpose |
|---|---|
| `product.md` | Core product vision: Compare, Conference, Memory, Demo provider requirement |
| `tech.md` | Stack constraints: Next.js 14+, Zod, Vitest, Playwright, MCP SDK |
| `structure.md` | Canonical directory layout and module boundaries |
| `security.md` | API key handling, SSRF rules, input size limits, security headers, error redaction |

### Spec (`/.kiro/specs/chamber/`)

| File | Purpose |
|---|---|
| `requirements.md` | Formal requirements (R1–R7) for every feature |
| `design.md` | Component architecture, data flow, type definitions |
| `tasks.md` | Incremental task breakdown (Tasks 1–8) used to drive implementation |

### Hooks (`/.kiro/hooks/`)

| File | Purpose |
|---|---|
| `test-on-save.json` | Runs `vitest` automatically after saving any `src/lib/`, `cli/`, or `tests/` file |
| `secret-guard.json` | Flags any file write containing patterns that look like API keys before the write proceeds |

### MCP server

The workspace MCP registration in `.kiro/settings/mcp.json` lets Kiro call `save_memory`, `list_notes`, `retrieve_context`, and `search_memory` directly — Kiro can read and annotate its own work notes without leaving the IDE.

---

## Disclosure

Synomni Chamber was created with Kiro during the Kiroween 2026 submission period. It is inspired by Synomni (https://synomni.infinitybuilds.download), a related multi-AI workspace first committed on 12 November 2026. This repository is a new, self-contained application; it does not include the private Synomni monorepo. Optional live-API features use a user-supplied token against the public Synomni REST API.

---

## License

MIT © 2026
