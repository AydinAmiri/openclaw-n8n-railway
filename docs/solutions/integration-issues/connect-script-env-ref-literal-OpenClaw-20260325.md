---
module: OpenClaw Gateway
date: 2026-03-25
problem_type: configuration_issue
component: connect_script
symptoms:
  - "Gateway auth fails when connecting Mac to Railway gateway"
  - "Connect script uses literal string ${OPENCLAW_GATEWAY_TOKEN} as bearer token"
root_cause: env_ref_not_resolved
severity: moderate
tags: [connect-script, env-ref, token, tailscale]
---

# Connect Script Token Mismatch — Env-Ref Literal

## Symptom
After PR #11 changed gateway token storage to env-ref syntax (`${OPENCLAW_GATEWAY_TOKEN}`), the `connect-mac-to-railway-gateway.sh` script fetched the literal string `${OPENCLAW_GATEWAY_TOKEN}` instead of the resolved token value. This caused all gateway auth to fail.

## Root Cause
The setup wizard now writes `${OPENCLAW_GATEWAY_TOKEN}` (env-ref literal) to `gateway.auth.token` in config. The connect script reads this via `openclaw config get gateway.auth.token` and uses the result as a Bearer token. The gateway resolves env-refs at runtime, but `config get` returns the raw stored value.

## Solution
Updated the connect script to:
1. Try `printenv OPENCLAW_GATEWAY_TOKEN` via Railway SSH first
2. Fall back to `openclaw config get gateway.auth.token`
3. Detect `${...}` patterns and reject them with a clear error

```bash
# First try: read from env directly
GATEWAY_TOKEN="$(railway ssh ... -- sh -lc 'printf %s "${OPENCLAW_GATEWAY_TOKEN:-}"')"

# Detect env-ref literals
if [[ "$GATEWAY_TOKEN" =~ ^\$\{.+\}$ ]]; then
  echo "Config returned env-ref literal: $GATEWAY_TOKEN" >&2
  echo "Pass --token <value> with the actual token instead." >&2
  GATEWAY_TOKEN=""
fi
```

## Prevention
- When storing env-refs in config, ensure all consumers can resolve them
- Scripts that read config should detect and handle unresolved env-refs
- Document which config values use env-ref syntax

## Files Changed
- `scripts/connect-mac-to-railway-gateway.sh`
