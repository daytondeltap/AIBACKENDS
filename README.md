# AIBACKENDS

Remote inference backend for Web Spoofer.

## Architecture

Web Spoofer sends a compact task/page snapshot to `POST /api/agent`. The Vercel function asks a hosted Qwen model for exactly one browser action and returns that JSON action to the extension.

This avoids shipping or downloading a ~500–800 MB model inside Chrome. No Supabase or database is required.

Default model: `alibaba/qwen3.8-flash` through Vercel AI Gateway. Override it with `AI_MODEL` if needed.

## Endpoints

- `GET /api/health` — readiness/model/auth status
- `POST /api/agent` — one-step browser-agent planner

## Authentication

On Vercel, the backend uses `VERCEL_OIDC_TOKEN` when available. For local development or as a fallback, set `AI_GATEWAY_API_KEY`.

The AI credential stays on the backend and is never exposed to the Chrome extension.

## Agent actions

The backend can plan:

- click
- type into normal text/search fields
- select
- submit forms/search boxes
- scroll
- navigate to HTTP(S) URLs
- wait
- finish

Passwords, file inputs, payment/financial credential fields, and payment/purchase/transfer actions stay blocked by the extension execution layer.

## Deployment

Deploy the repository as a normal Vercel project. No build step or database is required.
