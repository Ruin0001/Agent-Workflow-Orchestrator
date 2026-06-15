# User Verification Results (performed by review session on the user's behalf)

Date: 2026-06-15
Performed by: Claude Code review session (delegated by the user).
Environment: Windows. The project is now a Git repository (created and pushed via a Codex session).
Method: Built the CLI (`npm run build`, exit 0) and exercised it in disposable temp workspaces using the repository's fake-agent fixtures as the configured implementation agent command (`node <fixture>.mjs`). This verifies the orchestration and guardrail mechanics deterministically without invoking a real LLM agent.

## Item 1 — `agent-flow init` + inspect created files — PASS

- `agent-flow init` reported "Agent Flow initialized in <workspace>".
- Created: `.agent-flow.json` (bare `{ "version": 1 }`), `.agent/handoff.md`, `.agent/workflow_state.json`, `.agent/logs/agent_log.md`, `.agent/logs/runs.jsonl`.
- `workflow_state.json` is well-formed: `phase: requirement_understanding`, `status: ready`, actors `implementation`, lock unlocked, full artifact map (incl. `allowed_change_manifest`), `limits` with the three review-iteration caps, and `iterationCounters` at 0.
- `agent-flow status` printed a clean, read-only summary (phase / status / actors / active gates: none / lock: unlocked / next required action).
- `agent-flow config validate` returned "Config valid" against a custom JSON config.

## Item 2 — one assisted `agent-flow next` phase — PASS

- Configured `agents.implementation.command = node`, args `[<fake-agent.mjs>]`, with Git guardrails disabled for this basic flow test.
- `agent-flow next` → "Advanced to spec_creation", exit 0.
- Canonical state advanced `requirement_understanding → spec_creation`; the agent was actually spawned (`.agent/invoked` marker present).
- `runs.jsonl` recorded a complete IR-M3 audit entry: `commandSummary`, `artifactPaths`, `guardrailResult` (skipped, Git off), `proposedNextPhase`/`acceptedNextPhase` = spec_creation, `outcome: success`, `failureCode: null`, exit code, duration.

## Item 3 — protected-path guardrail blocks in a Git workspace — PASS

- Disposable `git init` workspace, `agent-flow init`, configured implementation agent = `node <fake-agent-modify-env.mjs>` (writes a protected `.env`), default guardrails (Git required + clean tree required). Committed a clean baseline (`git status --porcelain` empty before run).
- `agent-flow next` → blocked: `GUARDRAIL_PROTECTED_PATH: Protected path changed: .env matches .env`, exit 1.
- Canonical state remained `requirement_understanding` (fail-closed; no advance).
- The agent did run (`.env` written with `SECRET=changed`), proving the post-run Git diff guardrail caught the protected change rather than the agent being skipped.
- `runs.jsonl` recorded `outcome: failed`, `failureCode: GUARDRAIL_PROTECTED_PATH`, `guardrailResult.status: blocked` with reason.

## Item 4 — IR-M6 symlink guardrail suite — NOT VERIFIED HERE (platform limitation)

- Symlink creation on this Windows environment requires Administrator privilege (confirmed: `New-Item -ItemType SymbolicLink` → "Administrator privilege required"). The two symlink guardrail tests remain skipped here.
- This is unchanged by the new Git repository; it needs a Linux CI run or a symlink-privileged Windows session (Developer Mode / SeCreateSymbolicLinkPrivilege) where the two skipped tests actually execute.
- Residual: symlink-escape protection remains unverified in this environment.

## Notes / honest caveats

- The `next` flow and the protected-path block were verified with controlled fake-agent fixtures (deterministic), which is the correct way to verify orchestration and guardrails. Verifying one phase driven by a real agent (actual `codex`/`claude` CLI producing a real artifact) is a separate, optional confidence check the user may still run once; the mechanism itself is confirmed working.
- Temp workspaces were left in `%TEMP%` (afv_b_*, afv_c_*, symcheck_*); they are disposable.

## Outcome

Functional user-verification items (1-3) PASS via reviewer-run live verification. Item 4 (symlink) remains a platform-dependent residual to run on a symlink-capable host. No functional defect found during verification.
