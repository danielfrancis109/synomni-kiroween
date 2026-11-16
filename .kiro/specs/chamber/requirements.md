# Requirements — Synomni Chamber

Requirements use EARS notation:
- **Ubiquitous**: "The system shall …"
- **Event-driven**: "When [trigger], the system shall …"
- **Unwanted behaviour**: "If [condition], the system shall …"
- **Optional feature**: "Where [feature is enabled], the system shall …"

---

## R1 — Providers

**R1.1** The system shall define a common `Provider` interface with a single async method `complete(messages: Message[], opts: CompleteOpts): Promise<string>`.

**R1.2** The system shall include a Demo provider that returns deterministic, persona-based responses without any network call or API key.

**R1.3** The system shall include provider implementations for Anthropic, OpenAI, xAI (OpenAI-compatible endpoint), and Local (any user-supplied OpenAI-compatible base URL).

**R1.4** When a user supplies an API key in the Settings panel, the system shall store it in browser `localStorage` only and include it in every subsequent request to that provider.

**R1.5** The system shall never log, persist server-side, or forward a key beyond the single provider fetch it was supplied for.

**R1.6** When a provider fetch exceeds the configured timeout (default 30 s), the system shall return an error with the message "Provider timeout" and an HTTP 504 status.

**R1.7** If a provider returns a non-2xx response, the system shall map it to a structured error object `{ code, message }` and shall not echo the raw provider response body to the client.

**R1.8** The system shall allow the timeout to be overridden via the `PROVIDER_TIMEOUT_MS` environment variable.

---

## R2 — Compare

**R2.1** The system shall display two side-by-side columns, each with an independent provider-and-model picker.

**R2.2** When the user submits a prompt, the system shall send it to both selected providers concurrently and display each response in its respective column.

**R2.3** The system shall support follow-up messages within a single column, maintaining that column's message history.

**R2.4** When the user clicks "Forward to other model" on a response, the system shall send that response as a new user message (prefixed with a critique/build-on instruction) to the opposite column.

**R2.5** If either provider call fails, the system shall display the error in that column without affecting the other column.

---

## R3 — Conference

**R3.1** The system shall allow the user to configure 2–3 named agents, each with a chosen provider, model, and free-text persona description.

**R3.2** The system shall maintain a single shared transcript visible to all agents and to the user.

**R3.3** The system shall support two turn policies selectable by the user: **round-robin** (agents take turns in fixed order) and **open-floor** (the previous agent nominates the next).

**R3.4** The turn-policy logic shall be a pure, side-effect-free module that accepts the current transcript and agent list and returns the next agent index; it must be unit-testable without any network or file I/O.

**R3.5** When an agent decides to PASS, the system shall record the reason in the transcript and advance to the next agent according to the active policy.

**R3.6** The system shall enforce a configurable maximum turn count; when reached, the system shall stop the conference and display a "Max turns reached" notice.

**R3.7** An agent shall never be selected to reply to its own immediately preceding message.

**R3.8** When the conference completes or is stopped, the system shall allow the user to save the full transcript as a memory note.

---

## R4 — Memory and MCP

**R4.1** The system shall provide a memory store backed by a local JSON file (`data/memory.json` by default, overridable via `MEMORY_FILE` env var).

**R4.2** The memory store shall support four operations: `save(title, content)`, `search(query)` (keyword/TF scoring), `retrieve(id)`, and `list()`.

**R4.3** The system shall expose the memory store over HTTP routes at `POST /api/memory`, `GET /api/memory`, and `DELETE /api/memory/:id`.

**R4.4** The system shall expose the memory store over an MCP stdio server (`cli/mcp.ts`) with tools: `save_memory`, `search_memory`, `retrieve_context`, `list_notes`.

**R4.5** The MCP server shall be launchable as a standalone process via `node cli/mcp.ts` and shall import only `src/lib/memory.ts` (no Next.js or browser APIs).

**R4.6** Where a user supplies a Synomni API token (`omk_…`) in Settings, the `retrieve_context` MCP tool shall additionally query `https://synomni.infinitybuilds.download/api/v1/context` and merge results; this behaviour is fully optional and gracefully degraded if the token is absent or the request fails.

**R4.7** The system shall display a Memory panel in the UI that lists saved notes, allows keyword search, and allows saving a selected answer as a new note.

---

## R5 — Security and Robustness

**R5.1** The system shall reject any prompt message exceeding 32 000 characters with HTTP 400.

**R5.2** The system shall reject any request with more than 50 messages with HTTP 400.

**R5.3** The system shall reject any memory note whose content exceeds 10 000 characters or whose title exceeds 200 characters with HTTP 400.

**R5.4** When the Local provider URL is a `file://`, `ftp://`, or non-HTTP/HTTPS scheme, the system shall reject it with a clear error before making any fetch.

**R5.5** When the Local provider URL resolves to a private or loopback IP range (`127.*`, `10.*`, `172.16–31.*`, `192.168.*`) and `ALLOW_LOCAL_URLS` is not set to `true`, the system shall reject it with a clear error.

**R5.6** Where `LOCAL_URL_ALLOWLIST` is set, the system shall reject Local provider URLs whose hostname is not in the allowlist.

**R5.7** Every API route handler shall include the security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Content-Security-Policy`.

**R5.8** The system shall redact any string matching `/^(sk-|omk_|Bearer )[^\s]+/` before writing to server logs.

**R5.9** If `NODE_ENV` is `production`, the system shall not include stack traces in HTTP error responses.

---

## R6 — Quality

**R6.1** The system shall include Vitest unit tests covering: Demo provider determinism, provider error mapping, conference turn-policy (round-robin, open-floor, PASS, max-turn cap, no self-reply), memory store CRUD, memory keyword search scoring, and MCP tool handlers.

**R6.2** The system shall include a Playwright smoke test that: opens the app with Demo provider, runs a Compare with both columns set to Demo, forwards one answer to the other column, runs a 2-agent Conference to completion, and saves a memory note.

**R6.3** `npm test` shall execute the full Vitest suite and exit non-zero on any failure.

**R6.4** `npm run test:e2e` shall execute the Playwright suite against a running dev server and exit non-zero on any failure.

---

## R7 — Docs

**R7.1** The repository shall contain a `README.md` documenting: project overview, clone-and-run instructions (`npm ci`, `npm run dev`, `npm test`, `npm run test:e2e`), environment variable reference, and MCP server usage.

**R7.2** The repository shall contain a `LICENSE` file with the MIT license text.

**R7.3** The README shall include a disclosure blurb stating the app is a Kiroween 2026 entry, inspired by (not copied from) Synomni at synomni.infinitybuilds.download.
