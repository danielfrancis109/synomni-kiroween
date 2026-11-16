# Tasks — Synomni Chamber

Tasks are ordered so the repo is runnable after Task 2 and incrementally richer from Task 3 onward. Each task is self-contained: complete it fully before starting the next.

---

## Task 1 — Repo scaffold & tooling
*Get a clean, buildable repo with all config files in place. No app logic yet.*

- [x] 1.1 `npm init` with `name: "synomni-chamber"`, `type: "module"`, Node 20 engine field. Add `package.json` scripts: `dev`, `build`, `start`, `test`, `test:e2e`. (R6.3, R6.4, R7.1)
- [x] 1.2 Install dependencies: `next`, `react`, `react-dom`, `@modelcontextprotocol/sdk`, `zod`, `tailwindcss`, `typescript`. Install dev dependencies: `vitest`, `@vitejs/plugin-react`, `@playwright/test`, `tsx`. (tech.md)
- [x] 1.3 Create `tsconfig.json` with `"strict": true`, `"moduleResolution": "bundler"`, paths alias `@/*` → `./src/*`. (tech.md)
- [x] 1.4 Create `next.config.ts`, `tailwind.config.ts` (dark mode `'class'`, `seam` utility), `vitest.config.ts` (`environment: 'node'`), `playwright.config.ts` (`webServer: npm run dev`, baseURL `http://localhost:3000`). (tech.md)
- [x] 1.5 Create `.gitignore`: include `node_modules/`, `.next/`, `data/`, `.env*.local`; explicitly do **not** ignore `.kiro/`. (security.md)
- [x] 1.6 Create `.env.example` documenting: `PROVIDER_TIMEOUT_MS`, `MEMORY_FILE`, `ALLOW_LOCAL_URLS`, `LOCAL_URL_ALLOWLIST`. No real values. (security.md, R1.8)
- [x] 1.7 Create `LICENSE` (MIT, year 2026). (R7.2)
- [x] 1.8 Create placeholder `README.md` with project title and a "WIP" note; full content added in Task 8. (R7.1)

---

## Task 2 — Core library: providers + security
*After this task `npm run dev` starts and `/api/chat` with the Demo provider works.*

- [x] 2.1 Create `src/lib/security.ts`: implement `validateLocalUrl`, `securityHeaders`, `redactKeys`, and export `MessageSchema`, `MessagesSchema`, `SaveNoteSchema` zod schemas. (R5.1–R5.9)
- [x] 2.2 Create `src/lib/providers.ts`: define `Message`, `CompleteOpts`, `Provider` interface; implement `fetchWithTimeout` with `AbortController`; implement `DemoProvider` (deterministic, no network); implement `AnthropicProvider`, `OpenAIProvider`, `XAIProvider`, `LocalProvider` (SSRF guard via `validateLocalUrl`); export `getProvider(id)` factory. (R1.1–R1.8)
- [x] 2.3 Create `src/app/api/chat/route.ts`: `POST` handler; validate with `MessagesSchema`; call provider; apply `securityHeaders()`; map errors to `{ error: { code, message } }`; no stack traces in production. (R1.6, R1.7, R5.7, R5.9)
- [x] 2.4 Create minimal `src/app/layout.tsx` (dark class on `<html>`, global CSS import) and `src/app/page.tsx` (redirect to `/chamber`). (structure.md)
- [x] 2.5 Create skeleton `src/app/chamber/page.tsx` that renders a heading and "Coming soon" so the route exists. (structure.md)

---

## Task 3 — Memory store + Memory API
*Notes can be saved, listed, searched, and deleted via HTTP.*

- [x] 3.1 Create `src/lib/memory.ts`: implement `saveNote`, `listNotes`, `retrieveNote`, `searchNotes` (TF scoring, top-10), `deleteNote`; auto-create `data/` dir; use a write-serialisation promise queue to prevent concurrent corruption. (R4.1, R4.2)
- [x] 3.2 Create `src/app/api/memory/route.ts`: `GET` (list or search), `POST` (save, validate with `SaveNoteSchema`), `DELETE /api/memory/[id]`; apply `securityHeaders()`. (R4.3, R5.1–R5.3, R5.7)

---

## Task 4 — Conference module + Conference API
*The stateless conference turn endpoint is working and the turn policy is correct.*

- [x] 4.1 Create `src/lib/conference.ts`: define `Agent`, `Turn`, `ConferenceState` types; implement pure `nextAgentIndex(state)` and `isComplete(state)` with round-robin, open-floor, PASS advancement, max-turn guard, and no-self-reply rule. (R3.1–R3.7)
- [x] 4.2 Create `src/app/api/conference/route.ts`: `POST` handler; validate request shape with zod; call `nextAgentIndex`; resolve provider; call `complete`; return `{ turn, updatedState, complete }`; apply `securityHeaders()`. (R3.1–R3.7, R5.7)

---

## Task 5 — MCP stdio server
*`node cli/mcp.ts` starts and all four tools work against the live memory file.*

- [x] 5.1 Create `cli/mcp.ts`: instantiate `@modelcontextprotocol/sdk` `Server` with `StdioServerTransport`; register `save_memory`, `list_notes`, `retrieve_context` (with optional Synomni bridge), `search_memory`; validate args with shared zod schemas; import only `src/lib/memory.ts`. (R4.4, R4.5, R4.6)

---

## Task 6 — UI: Compare, Conference, Memory panels + Settings
*The full one-screen workspace is functional with the Demo provider.*

- [x] 6.1 Create `src/components/SettingsDrawer.tsx`: slide-in drawer; one password input per provider; Save writes to `localStorage`; Clear removes all keys. (R1.4, product.md)
- [x] 6.2 Create `src/components/ComparePanel.tsx`: two columns, each with provider+model picker; shared prompt input; concurrent submit; "Forward to other model" button with critique prefix; per-column error display; follow-up input. (R2.1–R2.5)
- [x] 6.3 Create `src/components/ConferencePanel.tsx`: agent config (2–3 agents, name/provider/model/persona); policy picker; Start/Stop; shared transcript; max-turn display; "Save transcript" button. (R3.1–R3.8)
- [x] 6.4 Create `src/components/MemoryPanel.tsx`: note list (title + date), keyword search input, "Save answer" action that opens a title prompt; calls `/api/memory`. (R4.7)
- [x] 6.5 Assemble `src/app/chamber/page.tsx`: lay out all three panels with the laboratory theme (electric-green accents, `bg-[#0d0d0d]`, seam borders, monospace transcripts); responsive (single column on mobile, side-by-side on ≥1024 px). (product.md, R2.1, R3.1, R4.7)

---

## Task 7 — Tests (unit + e2e)
*`npm test` and `npm run test:e2e` both pass green.*

- [x] 7.1 Create `tests/providers.test.ts`: assert Demo returns identical output for identical inputs; assert different inputs differ; assert `fetchWithTimeout` resolves on fast mock and rejects with `ProviderTimeoutError` on slow mock; assert HTTP error mapping for 401, 429, 500. (R6.1)
- [x] 7.2 Create `tests/conference.test.ts`: round-robin advances correctly; open-floor follows name nomination; PASS skips agent and records reason; max-turn throws `ConferenceCompleteError`; agent never self-replies consecutively; `isComplete` returns true when all pass in a round. (R6.1, R3.4–R3.7)
- [x] 7.3 Create `tests/memory.test.ts`: save → retrieve round-trip on a temp file; list excludes deleted notes; search returns higher score for more occurrences; concurrent saves do not corrupt the file. (R6.1, R4.2)
- [x] 7.4 Create `tests/mcp.test.ts`: each tool handler returns correct MCP `content` shape; `retrieve_context` merges Synomni result when token provided (mock HTTP); validates bad args and returns MCP error. (R6.1, R4.4–R4.6)
- [x] 7.5 Create `e2e/smoke.test.ts`: navigate to `/chamber`; set both columns to Demo; submit a prompt; assert both columns show a response; click Forward on column A; assert column B shows the forwarded message; configure 2 Demo agents; start conference; wait for max-turns notice; click Save transcript; assert note appears in Memory panel. (R6.2)

---

## Task 8 — Docs, polish, final checks
*The repo is presentable and all commands work from a clean checkout.*

- [x] 8.1 Write final `README.md`: overview, clone-and-run (`npm ci`, `npm run dev`, `npm test`, `npm run test:e2e`), env var table, MCP server usage (`node cli/mcp.ts`), Kiroween disclosure blurb. (R7.1, R7.3)
- [x] 8.2 Verify `.gitignore` excludes `data/` and `node_modules/` but not `.kiro/`; confirm `data/` directory is not committed. (security.md)
- [x] 8.3 Run `npm run build` and fix any TypeScript or lint errors surfaced by the production build. (tech.md)
- [x] 8.4 Run `npm test` and `npm run test:e2e`; fix any failures. (R6.3, R6.4)
- [x] 8.5 Audit all route handlers: confirm `securityHeaders()` applied, zod validation present, no key material in any log call, stack traces gated on `NODE_ENV`. (R5.7–R5.9)
