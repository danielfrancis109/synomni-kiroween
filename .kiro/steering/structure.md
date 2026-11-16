# Structure — Synomni Chamber

## Directory layout (canonical, do not restructure without updating this file)

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                   # Root: redirects to /chamber
│   │   ├── layout.tsx                 # Root layout: dark theme class, global CSS, security headers meta
│   │   ├── chamber/
│   │   │   └── page.tsx               # Main one-screen workspace (Compare + Conference + Memory panels)
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts           # POST /api/chat — provider proxy for Compare feature
│   │       ├── conference/
│   │       │   └── route.ts           # POST /api/conference — single conference turn
│   │       └── memory/
│   │           └── route.ts           # GET/POST/DELETE /api/memory — memory CRUD
│   ├── lib/
│   │   ├── providers.ts               # Provider interface + Demo, Anthropic, OpenAI, xAI, Local impls
│   │   ├── conference.ts              # Pure turn-policy module (round-robin / open-floor, PASS logic)
│   │   ├── memory.ts                  # JSON-file memory store (save, search, retrieve, list)
│   │   └── security.ts               # SSRF guard, input size limits, security header helpers
│   └── components/                    # React components (ComparePanel, ConferencePanel, MemoryPanel, SettingsDrawer)
├── cli/
│   └── mcp.ts                         # MCP stdio server — imports src/lib/memory.ts directly
├── tests/
│   ├── providers.test.ts              # Demo provider determinism + error mapping
│   ├── conference.test.ts             # Turn-policy unit tests (round-robin, open-floor, PASS, max-turn)
│   ├── memory.test.ts                 # Memory store CRUD and TF keyword search
│   └── mcp.test.ts                    # MCP tool handler unit tests
├── e2e/
│   └── smoke.test.ts                  # Playwright: open app, compare, forward, conference, save note
├── data/                              # Git-ignored at runtime; memory.json lives here
├── public/                            # Static assets (favicon, any decorative SVGs)
├── .kiro/
│   ├── steering/                      # product.md, tech.md, structure.md, security.md
│   └── specs/chamber/                 # requirements.md, design.md, tasks.md
├── .env.example                       # Documents env vars; never contains real values
├── next.config.ts
├── tailwind.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── tsconfig.json
├── package.json
├── LICENSE                            # MIT
└── README.md
```

## Module boundaries

- `src/lib/` modules are pure logic — no Next.js or React imports.
- Route handlers in `src/app/api/` import from `src/lib/`; they own zod validation and HTTP concerns.
- Components in `src/components/` call API routes via `fetch`; they never import `src/lib/` directly.
- `cli/mcp.ts` imports `src/lib/memory.ts` only; it must not import Next.js or any browser API.

## Naming conventions

- Files: `kebab-case` for all source files except Next.js conventions (`page.tsx`, `route.ts`, `layout.tsx`).
- Exports: named exports preferred; default exports only for Next.js page/layout components.
- Types: `PascalCase` interfaces/types in the same file as their primary consumer; shared types in `src/lib/types.ts` if used by 3+ modules.

## data/ directory

Created at runtime by `memory.ts` if absent. Add `data/` to `.gitignore`. Never commit `memory.json`.
