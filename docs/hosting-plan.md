# Hosting plan for a live demo (not deployed yet)

Judges can clone-and-run, but a hosted URL is nicer. The memory store is a JSON file, so a static/edge host needs a small change:
1. **Simplest:** a small Node host (Fly.io, Render, Railway or a VPS container) running `npm ci && npm run build && npm start` with a writable `MEMORY_FILE`. No keys required (Demo provider).
2. **Cloudflare Workers/Pages:** needs the file store swapped for KV/D1 (small task; add it as a Kiro spec task).
Must stay free to test through the end of judging (Jan 29, 2027). Do not point it at the private Synomni VPS or production DB.
