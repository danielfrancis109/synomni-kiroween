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

---

## Task 9 — Hosted public demo mode
*When `HOSTED_DEMO=true` the app is safe to expose publicly: Local provider is blocked, requests are rate-limited, and memory is isolated per anonymous session.*

- [x] 9.1 Add `GET /api/config` returning `{ hosted: boolean }` so the browser can discover the mode. Add `HEALTHCHECK` target. (R8.2)
- [x] 9.2 Create `src/lib/ratelimit.ts`: fixed-window limiter, `checkRateLimit(ip, bucket)`, `isRateLimitEnabled()`, `clientIp(headers)`, bounded map with eviction, configurable via `RATE_LIMIT_CHAT_PER_MIN` / `RATE_LIMIT_WRITE_PER_MIN`. (R8.3–R8.5)
- [x] 9.3 Update `/api/chat`: reject `providerId=local` with 403 `LOCAL_DISABLED` when hosted; ignore client `baseUrl` when hosted; apply rate limiter; body size guard (256 KB, 413) in hosted mode. (R8.1, R8.3, R8.10)
- [x] 9.4 Update `/api/conference`: same Local-provider guard, same rate limiter, same body size guard; ignore `baseUrl` for hosted vendors. (R8.1, R8.3, R8.10)
- [x] 9.5 Extend `src/lib/memory.ts`: add `saveNoteForSession`, `listNotesForSession`, `retrieveNoteForSession`, `deleteNoteForSession`, `searchNotesForSession`, `MemoryFullError`, `runSessionCleanupIfDue`; non-hosted API unchanged. (R8.6–R8.9)
- [x] 9.6 Update `/api/memory/route.ts` and `/api/memory/[id]/route.ts`: session cookie (`chamber_sid`, httpOnly, SameSite=Lax); dispatch to session-scoped functions when hosted; apply rate limiter on writes; body size guard. (R8.6, R8.7, R8.10)
- [x] 9.7 Fetch `/api/config` on mount in `chamber/page.tsx`; pass `hosted` prop to `ComparePanel`, `ConferencePanel`, `SettingsDrawer`; each filters out the Local option when `hosted=true`. (R8.2)
- [x] 9.8 Write `tests/ratelimit.test.ts`, `tests/hosted-memory.test.ts`, `tests/hosted-local-provider.test.ts`. (R8.12)
- [x] 9.9 Add Playwright `hosted-demo` project in `playwright.config.ts` (port 3002, `HOSTED_DEMO=true`, temp `MEMORY_DIR`); write `e2e/hosted-demo.test.ts` asserting Local option absent and note isolation between contexts. Support `E2E_BASE_URL` env to skip `webServer`. (R8.13, R8.14)
- [x] 9.10 Add `Dockerfile` (multi-stage, `node:22-alpine`, non-root user, standalone output, `HEALTHCHECK /api/config`, `VOLUME /app/data`) and `.dockerignore`. Set `output: "standalone"` in `next.config.ts`. (R8.11)
- [x] 9.11 Document all hosted env vars in `README.md` and `.env.example`; run `npm test`, `npm run build`, `npm run test:e2e` until green. (R8.1–R8.14)
- [x] 9.12 Deployment follow-up found while deploying behind Caddy: rate limiter keys on the LAST `x-forwarded-for` entry (client-supplied earlier entries are spoofable); Docker HEALTHCHECK uses 127.0.0.1 (alpine resolves `localhost` to ::1). Test updated. (R8.3)

---

## Task 10 — Demo mode that holds up on camera
*Found while recording the demo video on the live site: the Demo provider returned the same canned line for every column and prompt, follow-ups and forwards looked like nothing happened, and conference agents repeated themselves and never PASSed.*

- [x] 10.1 Rewrite `DemoProvider` in `src/lib/providers.ts`: deterministic, no network; extract up to 3 keywords from the latest user prompt (stopwords removed); build a 3–4 sentence answer from persona-specific templates (`demo` = Generalist, `demo-scientist` = Scientist, `demo-philosopher` = Philosopher) seeded by `hash(prompt + model)`; every answer starts with a visible label `[Demo · <Persona>]`. Different prompts and different personas must produce different text; identical inputs produce identical text. (R6.1)
- [x] 10.2 Demo follow-ups: when the history already contains an assistant answer, the reply references the previous answer (quotes its opening words) and reacts to the follow-up intent (`harder`, `simpler`/`shorter`, `example`, otherwise generic refinement). (R2.3)
- [x] 10.3 Demo critique: when the last user message is a forwarded answer (`Critique and expand on this answer from <source>:`), reply with a labelled critique (`Critique of <source>'s answer`) that quotes the forwarded answer and gives a strength, a gap and an expansion. `ComparePanel.forward` names the source column in that message. (R2.4)
- [x] 10.4 `ComparePanel`: render each column as a thread (`col-N-msg-i`, `data-role` user/assistant) instead of replacing a single response, so follow-ups and forwarded critiques appear as new messages; forwarded prompts show a short "Forwarded from Column A" bubble; column B defaults to `demo-scientist` so the default view shows two personas. (R2.3, R2.4)
- [x] 10.5 Conference: add optional `topic` (max 500 chars) to `ConferenceState` and send it from `ConferencePanel`; the route passes `Topic: …` plus `Your turn, <name>.` to the provider, and parses replies of the form `PASS: <reason>` into `pass: true` + `passReason` (empty content). (R3.4, R3.6)
- [x] 10.6 Demo conference agents: vary lines using turn number, topic keywords and the previous speaker's last line (reference them by name); PASS deterministically when the agent has already spoken and has nothing new (always on its first chance once no one has passed yet; otherwise when `hash(topic+name+turn) % 3 === 0`), with a reason naming whose point already covers it. Never PASS on its first turn. (R3.4, R3.6)
- [x] 10.7 Round-robin advances from the agent of the most recent turn (PASS included), skipping only that agent, so a PASS hands the floor to the next agent instead of re-asking the one who passed. Update `tests/conference.test.ts`. (R3.4, R3.5)
- [x] 10.8 Tests: extend `tests/providers.test.ts` (distinct personas, distinct prompts, label, follow-up references previous answer, critique quotes source, conference variation and PASS); extend `e2e/smoke.test.ts` (distinct compare columns, follow-up adds a message, forward shows critique in B, 3-agent 6-turn conference renders a PASS badge with reason). `npm test`, `npm run build`, `npm run test:e2e` green. (R6.1–R6.4)
- [x] 10.9 Hand-made follow-up (Kiro hit `ThrottlingException` mid-task; fixed by hand and recorded here, like 9.12): agent names with dots ("Dr. Volt") were cut at the first dot when parsing `Your turn, <name>.`, so every agent looked like a first-timer and repeated itself; conference lines now rotate per agent so none repeats, skip "previous speaker" lines on turn 1, and quote the topic cleanly; the route tells real models the `PASS: <reason>` rule, shows earlier PASS turns as `<Name>: PASS — <reason>` and caps the reason at 300 chars; follow-up and critique keywords come from the earlier prompt / forwarded answer instead of "make"/"critique"; critique sections are plain text (no raw `**`). Playwright: compare answers distinct and labelled, follow-up adds a second message quoting the first, forward shows "Critique of Column A's answer" in B, 3-agent 6-turn conference renders a PASS badge with reason and no repeated lines. Added `col-N-followup-send`, `turn-N-pass`, `turn-N-pass-reason` test ids. (R2.3, R2.4, R3.4, R3.6, R6.2)
