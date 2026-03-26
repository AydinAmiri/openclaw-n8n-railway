---
module: OpenClaw Gateway
date: 2026-03-25
problem_type: deployment_issue
component: convex_deploy
symptoms:
  - "Could not find public function for 'learnings:add'"
  - "Could not find public function for 'tasks:upsertWorkflowState'"
  - "Temporal worker workflows fail with missing function errors"
root_cause: dual_codebase_overwrite
severity: critical
tags: [convex, deploy, temporal, agent-ops-center]
---

# Convex Dual-Deploy Overwrite

## Symptom
After deploying Convex functions from the `openclaw-n8n-railway` repo, the temporal-worker started failing with `Could not find public function for 'learnings:add'`. The Agent Ops Center dashboard also lost its backend functions.

## Investigation
1. Ran `npx convex function-spec` — only 19 functions (this repo's)
2. Checked temporal-worker logs — `learnings:add` and `tasks:upsertWorkflowState` missing
3. Discovered Agent Ops Center has its own `convex/` directory with 13 additional function files
4. Both repos deploy to the same self-hosted Convex instance
5. Each deploy **overwrites all functions** — last deployer wins

## Root Cause
Two separate codebases (`openclaw-n8n-railway` and `agent-ops-center`) share a single Convex backend. Convex deploy replaces ALL functions atomically — it doesn't merge. Deploying from one repo destroys the other's functions.

## Solution
Merged all Agent Ops Center Convex function files into the `openclaw-n8n-railway` repo's `convex/` directory:

```bash
# Copy 13 files (no conflicts — all unique filenames)
cp /tmp/agent-ops-center/convex/*.ts convex/

# Fix: projects.ts had stale defineTable() call (schema code in function file)
# Removed the orphaned defineTable block

# Deploy all 77 functions together
npx convex deploy --typecheck=disable -y
```

Result: 77 functions deployed (19 workflow + 58 Agent Ops Center).

## Prevention
- **Single source of truth**: All Convex functions must live in one repo
- **Remove Agent Ops Center's `CONVEX_DEPLOY_KEY`** to prevent it from overwriting
- **Document in CLAUDE.md**: "Convex functions are deployed from openclaw-n8n-railway only"
- Future: consider Convex components for modular function isolation

## Files Changed
- `convex/learnings.ts`, `convex/tasks.ts`, `convex/projects.ts`, + 10 more — copied from agent-ops-center
- `convex/projects.ts` — removed stale `defineTable()` block
