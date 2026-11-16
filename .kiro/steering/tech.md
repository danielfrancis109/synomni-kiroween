# Tech — Synomni Chamber

## Stack
| Layer | Choice |
|-------|--------|
| Framework | Next.js 14+ (App Router), TypeScript strict (`"strict": true`) |
| Styling | Tailwind CSS (dark theme via `darkMode: 'class'`) |
| Testing | Vitest (unit), Playwright (e2e) |
| MCP | `@modelcontextprotocol/sdk` |
| Validation | `zod` for all API request/response shapes |
| Runtime | Node 20+, single process |

## Project layout (required, do not deviate)
```
src/
  app/
    page.tsx                  # redirect or landing
    chamber/page.tsx          # main one-screen workspace
    api/
      chat/route.ts           # provider proxy (compare feature)
      conference/route.ts     # conference turn API
      memory/route.ts         # memory CRUD
  lib/
    providers.ts              # Provider interface + all implementations
    conference.ts             # turn-policy logic (pure, testable)
    memory.ts                 # JSON-file memory store
    security.ts               # SSRF guard, header helpers, size limits
cli/
  mcp.ts                      # MCP stdio server
tests/                        # Vitest unit tests
e2e/                          # Playwright smoke test
```

## Commands
```bash
npm ci            # install
npm run dev       # dev server on :3000
npm test          # vitest unit suite
npm run test:e2e  # playwright smoke test
npm run build     # production build
```

## Key constraints
- `complete(messages, opts)` is the only provider method — no streaming in v1.
- Server-side fetch must have an explicit timeout (default 30 s, configurable via `PROVIDER_TIMEOUT_MS`).
- All route handlers validate input with zod before touching any provider.
- Memory file path defaults to `./data/memory.json`; override with `MEMORY_FILE` env var.
- MCP server (`cli/mcp.ts`) is a separate process launched via `node cli/mcp.ts`; it imports from `src/lib/memory.ts` directly.
