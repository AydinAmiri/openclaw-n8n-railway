---
module: OpenClaw Gateway
date: 2026-03-25
problem_type: configuration_issue
component: convex_environment
symptoms:
  - "OPENCLAW_CONVEX_SECRET is not configured"
  - "Heartbeat workflow fails despite env vars set in Railway"
  - "Convex functions can't read Railway service env vars"
root_cause: separate_env_systems
severity: critical
tags: [convex, railway, environment-variables, self-hosted]
---

# Convex Environment Variables vs Railway Service Variables

## Symptom
After setting `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, and `OPENCLAW_CONVEX_SECRET` via `railway variables set` on the `convex-backend` service, Convex functions still threw "OPENCLAW_CONVEX_SECRET is not configured." Heartbeat workflows failed with auth errors.

## Investigation
1. Verified vars were set via `railway variables` — confirmed present
2. Ran `npx convex env list` — showed "No environment variables set"
3. Realized: Railway service env vars are injected into the **container process**, not into Convex's **function runtime**

## Root Cause
Convex has its **own environment variable system** separate from the host container's env. Railway service variables are injected into the Docker container running the Convex backend, but Convex function code (`process.env.*` in handlers) reads from Convex's internal env store — not the container's env.

Two separate env systems:
- `railway variables set KEY=VALUE` → container process env (for the backend binary)
- `npx convex env set KEY VALUE` → Convex function runtime env (for your code)

## Solution
```bash
# Must use Convex CLI to set function-accessible env vars:
env -u CONVEX_DEPLOY_KEY -u CONVEX_URL -u CONVEX_SITE_URL \
  CONVEX_SELF_HOSTED_URL="https://convex-backend-production-95d6.up.railway.app" \
  CONVEX_SELF_HOSTED_ADMIN_KEY="convex_self_hosted|..." \
  npx convex env set OPENCLAW_CONVEX_SECRET <value>
  npx convex env set OPENCLAW_GATEWAY_URL https://honey-ai.up.railway.app
  npx convex env set OPENCLAW_GATEWAY_TOKEN <value>
```

After setting via `npx convex env set`, the heartbeat returned `gatewayOk: true, healthy: true`.

## Prevention
- **Always use `npx convex env set`** for variables that Convex functions need to read
- Railway service vars are for the Convex backend process itself (database URLs, ports)
- Document this distinction in INFRASTRUCTURE.md
- When migrating from Convex Cloud to self-hosted, remember to migrate env vars too

## Files Changed
- No code changes — configuration only
