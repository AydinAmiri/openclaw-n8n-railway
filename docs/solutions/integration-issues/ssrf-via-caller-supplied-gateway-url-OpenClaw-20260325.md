---
module: OpenClaw Gateway
date: 2026-03-25
problem_type: security_vulnerability
component: convex_api
symptoms:
  - "Unauthenticated callers could supply arbitrary gatewayUrl to Convex mutations"
  - "SSRF risk when OPENCLAW_CONVEX_SECRET is unset (dev bypass)"
root_cause: caller_controlled_url
severity: critical
tags: [ssrf, convex, security, gateway-url]
---

# SSRF via Caller-Supplied Gateway URL

## Symptom
Convex public mutations (`startAgentTask`, `startSubAgentOrchestration`) accepted `gatewayUrl` and `gatewayToken` as caller-supplied arguments. Combined with `requireSecret()` silently allowing unauthenticated calls when `OPENCLAW_CONVEX_SECRET` was unset, this enabled SSRF — an attacker could trigger outbound HTTP POSTs to arbitrary hosts from Convex actions.

## Investigation
- Identified by Qodo and ChatGPT-Codex-Connector bot reviews on PR #12
- `requireSecret()` had a dev bypass: `if (!expected) return;`
- `gatewayUrl` was passed from Express server through Convex mutations to workflow actions that called `fetch()`

## Root Cause
Two combined issues:
1. Gateway URL/token accepted from external callers instead of read from Convex environment
2. Auth function failed-open when secret was unconfigured

## Solution

### 1. Move gateway config to Convex environment
```javascript
function getGatewayConfig() {
  const url = process.env.OPENCLAW_GATEWAY_URL ?? "";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
  if (!token) {
    throw new Error("OPENCLAW_GATEWAY_TOKEN is not configured in Convex environment.");
  }
  return { gatewayUrl: url, gatewayToken: token };
}
```

### 2. Fail-closed auth
```javascript
function requireSecret(secret) {
  const expected = process.env.OPENCLAW_CONVEX_SECRET;
  if (!expected) {
    throw new Error("OPENCLAW_CONVEX_SECRET is not configured.");
  }
  if (secret !== expected) {
    throw new Error("Unauthorized: invalid or missing convex secret");
  }
}
```

### 3. Remove URL/token from mutation args
Removed `gatewayUrl` and `gatewayToken` from all three `startAgentTask`, `startHeartbeat`, and `startSubAgentOrchestration` mutation schemas.

## Prevention
- Never accept URLs from external callers that will be used in server-side `fetch()`
- Auth functions must fail-closed (throw when unconfigured, don't silently allow)
- Set env vars in Convex's own environment system (`npx convex env set`), not just Railway

## Files Changed
- `convex/openclawApi.ts` — removed caller args, added `getGatewayConfig()`
- `src/server.js` — removed gateway URL/token from workflow mutation calls
