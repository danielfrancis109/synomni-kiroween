# Hosting (live demo)

Live: https://kiroween.synomni.infinitybuilds.download (no login, no keys).

How it runs: the repo's `Dockerfile` builds a standalone Next.js image that runs as a non-root user. On the host it runs as a single container with `HOSTED_DEMO=true`, a restart policy, a 384 MB memory limit, a read-only root filesystem, all capabilities dropped, and its port bound to 127.0.0.1 only. A reverse proxy terminates TLS in front of it and sets `X-Forwarded-For` (the app rate-limits on the last entry).

Hosted-mode guards (`HOSTED_DEMO=true`): Local provider rejected (403 `LOCAL_DISABLED`), per-IP rate limits (30 chat or conference requests/min, 20 memory writes/min), 256 KB body cap, per-session memory (50 notes, 200 KB, max 500 sessions, 24 h TTL cleanup), no API keys stored or logged.

```
docker build -t synomni-kiroween .
docker run -d --restart unless-stopped --memory 384m --read-only \
  --tmpfs /tmp --tmpfs /app/.next/cache:uid=1001 --cap-drop ALL \
  -p 127.0.0.1:9410:3000 -v chamber-data:/app/data \
  -e HOSTED_DEMO=true -e HOSTNAME=0.0.0.0 synomni-kiroween
```
