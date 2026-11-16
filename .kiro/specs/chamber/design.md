# Design — Synomni Chamber

## Overview

Synomni Chamber is a Next.js App Router application. The browser talks exclusively to its own API routes; API routes talk to external provider APIs. The MCP server is a separate Node process that shares `src/lib/memory.ts` directly.

```
Browser (React)
  │  fetch()
  ▼
Next.js API Routes  ──►  Provider APIs (Anthropic / OpenAI / xAI / Local)
  │
  └──► src/lib/memory.ts  ◄──  cli/mcp.ts (stdio, separate process)
              │
              └──► data/memory.json
```

---

## 1. Provider layer (`src/lib/providers.ts`)

### Interface

```ts
interface Message { role: 'user' | 'assistant' | 'system'; content: string }
interface CompleteOpts { model: string; apiKey?: string; baseUrl?: string; timeoutMs?: number }
interface Provider { complete(messages: Message[], opts: CompleteOpts): Promise<string> }
```

### Implementations

| ID | Class | Transport |
|----|-------|-----------|
| `demo` | `DemoProvider` | None — pure in-process |
| `anthropic` | `AnthropicProvider` | `POST https://api.anthropic.com/v1/messages` |
| `openai` | `OpenAIProvider` | `POST https://api.openai.com/v1/chat/completions` |
| `xai` | `XAIProvider` | `POST https://api.x.ai/v1/chat/completions` (OpenAI-compatible) |
| `local` | `LocalProvider` | `POST {baseUrl}/v1/chat/completions` after SSRF guard |

**Demo provider** holds a small static map of `persona → response templates`. Given a message array, it picks a template by hashing the last user message length mod the template count — deterministic across runs with no randomness.

**Factory**: `getProvider(id: ProviderId): Provider` — returns the singleton for that ID; throws for unknown IDs.

**Fetch wrapper** (`fetchWithTimeout`): wraps `fetch` with `AbortController`; throws a typed `ProviderTimeoutError` on expiry, `ProviderHTTPError` on non-2xx; both carry a `{ code, message }` shape safe to send to the client.

---

## 2. Conference module (`src/lib/conference.ts`)

### Types

```ts
interface Agent { id: string; name: string; persona: string; providerId: ProviderId; model: string }
interface Turn { agentId: string; content: string; pass: boolean; passReason?: string; timestamp: number }
interface ConferenceState { agents: Agent[]; transcript: Turn[]; policy: 'round-robin' | 'open-floor'; maxTurns: number }
```

### Turn-policy (pure functions, no I/O)

**`nextAgentIndex(state: ConferenceState): number`**
- Throws `ConferenceCompleteError` if `transcript.length >= maxTurns`.
- Round-robin: `(lastNonPassIndex + 1) % agents.length`, skipping the agent who spoke last.
- Open-floor: last non-PASS turn's content is scanned for a name match among agents; falls back to round-robin if no match or the match is the same agent.
- Never returns the index of the agent who produced the immediately preceding non-PASS turn (R3.7).

**`isComplete(state: ConferenceState): boolean`** — `transcript.length >= maxTurns` or all agents PASSed in the last full round.

These two functions are the only exports tested in `tests/conference.test.ts`; they accept plain objects and return primitives — no async, no side effects.

### API route usage

`POST /api/conference` accepts `{ state, agentKey: { providerId, apiKey } }`, calls `nextAgentIndex`, calls the agent's provider, appends the turn, returns `{ turn, updatedState }`. The client owns the full state and sends it back each request (stateless server).

---

## 3. Memory store (`src/lib/memory.ts`)

### Storage format (`data/memory.json`)

```json
{ "notes": [ { "id": "uuid", "title": "…", "content": "…", "createdAt": "ISO8601", "tags": [] } ] }
```

### Operations

| Function | Description |
|----------|-------------|
| `saveNote(title, content)` | Appends a note with a generated UUID; creates file/dir if absent |
| `listNotes()` | Returns all notes without content (id, title, createdAt) |
| `retrieveNote(id)` | Returns full note by id; throws `NoteNotFoundError` |
| `searchNotes(query)` | Tokenises query; scores each note by TF (term frequency of matching tokens in title+content); returns top-10 sorted descending |
| `deleteNote(id)` | Removes note by id; throws `NoteNotFoundError` |

File access is synchronous (`fs.readFileSync` / `fs.writeFileSync`) with a file-level mutex (`async-mutex` or a simple promise queue) to prevent concurrent write corruption when called from both the API route and MCP server.

---

## 4. Security module (`src/lib/security.ts`)

### `validateLocalUrl(url: string): void`

1. Parse with `new URL(url)` — throw `SSRFError` on parse failure.
2. Reject non-`http`/`https` schemes.
3. If `ALLOW_LOCAL_URLS !== 'true'`: reject hostnames matching private/loopback ranges (regex + `net.isIPv4` checks).
4. If `LOCAL_URL_ALLOWLIST` is set: reject hostnames not in the comma-split list.

### `securityHeaders(): Record<string, string>`

Returns the fixed header map described in `security.md`. Route handlers spread this into `NextResponse` headers.

### `redactKeys(s: string): string`

Replaces matches of `/\b(sk-|omk_|Bearer )\S+/g` with `[REDACTED]`. Used in the server-side error logger.

### Zod schemas (exported for reuse in route handlers)

```ts
export const MessageSchema      // { role, content: z.string().max(32000) }
export const MessagesSchema     // z.array(MessageSchema).max(50)
export const SaveNoteSchema     // { title: z.string().max(200), content: z.string().max(10000) }
```

---

## 5. API routes

### `POST /api/chat`

Request: `{ messages: Message[], providerId, model, apiKey?, baseUrl? }`  
Validates with `MessagesSchema`. Calls `getProvider(providerId).complete(...)`. Returns `{ content: string }` or `{ error: { code, message } }`.

### `POST /api/conference`

Request: `{ state: ConferenceState, apiKeys: Record<ProviderId, string> }`  
Validates state shape with zod. Calls `nextAgentIndex`, resolves provider, calls `complete`, returns `{ turn, updatedState, complete: boolean }`.

### `GET /api/memory`

Query param `q` (optional). Returns `listNotes()` or `searchNotes(q)`.

### `POST /api/memory`

Request: `SaveNoteSchema`. Returns `{ note }` on success.

### `DELETE /api/memory/[id]`

Returns `{ ok: true }` or 404.

All routes apply `securityHeaders()` on every response.

---

## 6. MCP server (`cli/mcp.ts`)

Uses `@modelcontextprotocol/sdk` `Server` class with `StdioServerTransport`. Registers four tools:

| Tool | Args | Behaviour |
|------|------|-----------|
| `save_memory` | `title, content` | Calls `saveNote` |
| `list_notes` | — | Calls `listNotes` |
| `retrieve_context` | `id, synomniToken?` | Calls `retrieveNote`; if `synomniToken` present, also fetches Synomni context and merges |
| `search_memory` | `query` | Calls `searchNotes` |

Each tool validates its args with the same zod schemas from `security.ts` and returns `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`.

---

## 7. UI layout (`src/app/chamber/page.tsx`)

Single page, three collapsible panels arranged vertically on mobile, side-by-side on ≥1024 px:

```
┌─────────────────────────────────────────────────┐
│  ⚡ SYNOMNI CHAMBER              [⚙ Settings]   │
├───────────────────┬─────────────────────────────┤
│  COMPARE          │  CONFERENCE                 │
│  [Col A picker]   │  [Agent 1 config]           │
│  [Col B picker]   │  [Agent 2 config]           │
│  [Prompt input]──►│  [Start / Stop]             │
│  [Col A output]   │  [Transcript]               │
│  [Forward ──────► │                             │
│  [Col B output]   │                             │
├───────────────────┴─────────────────────────────┤
│  MEMORY   [Search…]  [Note list]  [Save answer] │
└─────────────────────────────────────────────────┘
```

**SettingsDrawer**: slides in from the right; one row per provider with a password input for the key; "Save" writes to localStorage; "Clear all" removes all keys.

**Visual theme** (Tailwind classes / CSS variables):
- Background: `bg-[#0d0d0d]`
- Accent: `text-[#39ff14]`, `border-[#39ff14]`
- Stitched-seam motif: a repeating SVG `background-image` of dashed lines on panel borders, applied via a `seam` Tailwind utility in `tailwind.config.ts`.
- Monospace font for all transcript and output text: `font-mono`.

---

## 8. Testing strategy

| Suite | File | What it covers |
|-------|------|---------------|
| Unit | `tests/providers.test.ts` | Demo determinism (same input → same output), `fetchWithTimeout` timeout path (mocked), HTTP error mapping |
| Unit | `tests/conference.test.ts` | `nextAgentIndex` for both policies, PASS advancement, max-turn error, no-self-reply |
| Unit | `tests/memory.test.ts` | CRUD round-trip on a temp file, TF search ranking, concurrent write safety |
| Unit | `tests/mcp.test.ts` | Each MCP tool handler with mocked memory functions |
| E2E | `e2e/smoke.test.ts` | Full user journey: compare → forward → conference → save note |

Vitest runs in Node environment (`environment: 'node'`). Playwright targets `http://localhost:3000` with `webServer` config pointing to `npm run dev`.

---

## 9. Hosted public demo mode (Task 9)

### Overview

When `HOSTED_DEMO=true` the application activates three layers of protection: provider restriction, rate limiting, and session-scoped memory isolation. Non-hosted behaviour is entirely unchanged.

### `/api/config`

A lightweight `GET /api/config` route returns `{ hosted: boolean }`. The browser fetches this on mount and passes the result as a `hosted` prop to `ComparePanel`, `ConferencePanel`, and `SettingsDrawer`, which filter out the Local provider option.

### Local-provider guard

`/api/chat` and `/api/conference` check `process.env.HOSTED_DEMO === 'true'` before resolving the provider. A `local` `providerId` returns `{ error: { code: 'LOCAL_DISABLED', message: '...' } }` with HTTP 403. `baseUrl` from the client is ignored for all hosted vendor calls.

### Rate limiter (`src/lib/ratelimit.ts`)

Fixed-window algorithm keyed by `${bucket}:${ip}`:

```
checkRateLimit(ip, bucket) → { allowed, retryAfterSeconds }
```

- `bucket = 'chat'`  — shared by `/api/chat` and `/api/conference`; default 30/min
- `bucket = 'write'` — `/api/memory` POST and DELETE; default 20/min
- IP extracted from first `x-forwarded-for` entry, fallback `"unknown"`
- Map bounded at 10 000 entries; oldest evicted (by `windowStart`) when exceeded
- Activated by `HOSTED_DEMO=true` OR `RATE_LIMIT=true`; rejected requests get `Retry-After` header

### Session-scoped memory

```
memory.ts
  ├── saveNoteForSession(sid, title, content): Note
  ├── listNotesForSession(sid): NoteListItem[]
  ├── retrieveNoteForSession(sid, id): Note
  ├── deleteNoteForSession(sid, id): void
  └── searchNotesForSession(sid, query): SearchResult[]
```

File path: `${MEMORY_DIR}/${sid}.json` (default `data/sessions/<sid>.json`).

Cookie `chamber_sid` is an httpOnly, SameSite=Lax UUID set by all memory routes when absent or invalid. Memory routes validate it against `/^[0-9a-f]{8}-[0-9a-f]{4}-...-[0-9a-f]{12}$/i`.

**Caps** (enforced synchronously in the write queue):
- 50 notes per session → 409 `MEMORY_FULL`
- 200 KB per session file → 409 `MEMORY_FULL`
- 500 session files total → oldest files deleted before creating new ones

**Cleanup**: `runSessionCleanupIfDue()` is called at the start of each memory route handler. It runs at most every 10 minutes and deletes files with `mtime < now - SESSION_TTL_HOURS * 3600 * 1000`.

### Body size guard

In hosted mode all three mutating routes check `Content-Length`; payloads over 256 KB return 413 `PAYLOAD_TOO_LARGE`.

### Docker

Multi-stage Dockerfile:

1. **deps** — `npm ci` on `node:22-alpine`
2. **builder** — `npm run build` (produces `output: standalone`)
3. **runner** — copies `.next/standalone`, `.next/static`, `public`; creates `/app/data` owned by `nextjs:nodejs` (uid/gid 1001); `VOLUME ["/app/data"]`; `HEALTHCHECK` on `/api/config`; `USER nextjs`; `CMD ["node", "server.js"]`

### Testing additions

| Suite | File | What it covers |
|-------|------|---------------|
| Unit | `tests/ratelimit.test.ts` | Bucket independence, per-IP tracking, window reset, `isRateLimitEnabled`, `clientIp` |
| Unit | `tests/hosted-memory.test.ts` | Session CRUD isolation, 50-note cap, cross-session note invisibility |
| Unit | `tests/hosted-local-provider.test.ts` | 403 for `local` provider when hosted, 200 for `demo` provider |
| E2E | `e2e/hosted-demo.test.ts` | Local option absent in pickers; notes isolated across two browser contexts |

