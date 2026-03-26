---
module: OpenClaw Gateway
date: 2026-03-25
problem_type: build_failure
component: update_script
symptoms:
  - "ELIFECYCLE Command failed with exit code 1 on pnpm build"
  - "npm install failed for discord extension"
  - "npm error Class extends value undefined is not a constructor"
  - "Gateway crash loop after update attempt"
root_cause: npm_node_incompatibility
severity: critical
tags: [openclaw-update, node, npm, build, esm]
---

# OpenClaw Update Build Failure — npm/Node Incompatibility

## Symptom
Running `openclaw.update --stable` (or any version v2026.3.12+) failed during `pnpm build` with truncated ESM loader errors. The output showed only the stack trace tail, hiding the actual error.

## Investigation
1. Tried v2026.3.22, v2026.3.23, v2026.3.23-2 — all failed identically
2. Upgraded Node from 22.22.1 → 24.14.0 — still failed
3. Ran `pnpm build` directly via SSH to see full output
4. **Actual error**: `failed to stage bundled runtime deps for discord: npm install failed`
5. Discord extension's `npm install` failed with `Class extends value undefined is not a constructor`
6. This was an npm version incompatibility (npm 11 on Node 24 broke class inheritance)

## Root Cause
The OpenClaw build script (`runtime-postbuild.mjs`) runs `npm install` for each bundled extension's runtime deps. On Node 24 (npm 11), npm itself had a class inheritance bug. On Node 22.22.1, the npm bundled with it was also too old.

The fix was installing Node 22.16.0 (with npm 10.9.2) which had the right npm version:
```bash
curl -fsSL https://nodejs.org/dist/v22.16.0/node-v22.16.0-linux-x64.tar.xz \
  | tar -xJ --strip-components=1 -C /usr/local/
```

## Additional Issue: OPENCLAW_UPDATE_REF Rebuild Loop
The `OPENCLAW_UPDATE_REF=--stable` Railway env var triggered the update script on **every container restart**. If the build failed, the container entered a crash loop:
1. Container starts → `start.sh` runs update script → build fails → gateway starts from old binary
2. Gateway port conflict → crash → wrapper retries → crash counter exceeds 10 → safe mode
3. Safe mode = Express wrapper stops serving on 8080 → Railway shows "grpc-edge-proxy is running"

## Solution
1. Install correct Node version: `Node 22.16.0 + npm 10.9.2`
2. Remove `OPENCLAW_UPDATE_REF` env var: `railway variables delete OPENCLAW_UPDATE_REF`
3. The already-built `/data/openclaw/dist/entry.js` is auto-detected by `start.sh`
4. Redeploy to get a fresh container with reset crash counter

## Prevention
- Don't set `OPENCLAW_UPDATE_REF` as a persistent env var — use the console/run API for one-time updates
- Pin Node version in Dockerfile rather than relying on container's default
- The update script should validate npm version before building
- Add `--force` flag to gateway start in update script to handle port conflicts

## Files Changed
- Railway env vars — deleted `OPENCLAW_UPDATE_REF`
- `start.sh` — improved Tailscale validation (separate commit)
