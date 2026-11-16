# Security — Synomni Chamber

## API keys

- Keys are entered by the user in the Settings panel and stored in **browser `localStorage` only**.
- The browser sends a key with each request (request header or body); the server uses it for that request and discards it immediately.
- The server **never** logs, caches, writes to disk, or forwards keys beyond the intended provider call.
- `.env` files may contain only non-secret configuration (timeout, allowlist, memory path). Real keys must never appear in any committed file.

## `.kiro` directory

`.kiro/` must **never** be listed in `.gitignore`. Steering docs and specs are project artifacts and must be committed.

## SSRF — Local provider URL

- The Local provider accepts a user-supplied base URL (e.g. an Ollama instance).
- Before fetching, `security.ts` must validate the URL: scheme must be `http` or `https`; host must not resolve to a private/loopback range unless `ALLOW_LOCAL_URLS=true` is set in the environment; optionally restricted to a hostname allowlist via `LOCAL_URL_ALLOWLIST` env var (comma-separated).
- Reject and return a clear error for `file://`, `ftp://`, internal IPs (`127.*`, `10.*`, `172.16–31.*`, `192.168.*`), and bare hostnames without a TLD (unless allowlisted).

## Input size limits

- Prompt text: max **32 000 characters** per message.
- Messages array: max **50 items** per request.
- Note content (memory save): max **10 000 characters**.
- Note title: max **200 characters**.
- Limits enforced in zod schemas in every route handler; return HTTP 400 with a human-readable message on violation.

## Security headers

`security.ts` exports a `securityHeaders()` helper used by every route handler:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`: restrict to `'self'`; explicitly allow provider API hosts only via `connect-src`.

## Error responses

- Never echo raw provider error bodies to the client — map to safe, structured messages.
- Stack traces must not appear in production responses (`NODE_ENV=production`).
- Log errors server-side without including key material: redact any string matching `/^(sk-|omk_|Bearer )[^\s]+/`.
