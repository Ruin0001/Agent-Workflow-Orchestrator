# Implementation Review Report

Reviewer: Claude Code (review session)
Scope: Wave 1 + Wave 2 MVP implementation (Plan Tasks 1-8) of the Agent Workflow Orchestrator.
Method: Five parallel module-group reviews reading the actual source, with the Blocking and key Major findings re-verified directly by the lead reviewer against the code (redact.ts, policy.ts, path-patterns.ts, next.ts).
Reference: `.agent/artifacts/spec.md`, `.agent/artifacts/plan.md`.
Mode: manual handoff.

## Summary

The implementation is solid, disciplined, and TDD-driven. The core safety property — a fail-closed state machine that writes canonical state only after all validation passes — is correctly implemented and well tested (22 negative-path integration tests assert non-advancement). Codex also addressed nearly every plan_review finding (bin path fixed, iteration limits added, phase→actor map added, OS lockfile added, symlink-aware path resolution added, negative-path tests added).

However, direct code verification surfaced one Blocking issue (a real secret-leak path) and several Major issues (two fail-open guardrail gaps, audit-log field gaps, a return-in-finally on the commit path, and two coverage/verification gaps). None require redesign; all are targeted fixes. Status: **Needs revision**. Wave 2 routine agent execution should not be relied upon until IR-B1 and the fail-open guardrail items are fixed.

Verification evidence (Codex, 2026-06-14): `npm run build` pass, `npm run typecheck` pass, `npm ls --omit=dev` empty runtime tree, `npm test` 101 pass / 0 fail / 2 skipped. I reproduce the test/skip counts as accurate; the 2 skips are the symlink guardrails (see IR-M6).

## Plan Compliance

Strong. Verified directly:

- Transition table matches `plan.md` Task 4 exactly (transitions.ts) — all branches, back-edges, terminal `done`.
- Phase→actor map present and correct (actors.ts) — resolves plan_review m2.
- Iteration limits implemented and correct (gates.ts:22-52, increment in next.ts) — resolves plan_review PR-3.
- `bin` fixed to `./dist/src/cli/main.js`, consistent with `rootDir:"."`/`outDir:"dist"`; verified by an actual build — resolves plan_review PR-2.
- OS lockfile added (locks/lockfile.ts) — resolves plan_review m3.
- Symlink-aware, fail-closed path resolution added (path-patterns.ts) — resolves plan_review PR-4 (but unverified on Windows; IR-M6).
- Negative-path integration tests added — resolves the plan_review test-coverage gap.

Deferred-but-not-noted: agent `env` (environment variables) is in the Spec adapter requirements but omitted from config (matches the Plan's Task 3 schema, which omitted it). Confirm this is an intentional deferral, since Wave 2 IS agent execution (IR-m/scope below).

## Code Correctness

The orchestration order in `next.ts` is correct and fails closed: load config → (clean-tree) → acquire lock → read state → reject active gate → validate actor matches phase → render prompt → persist prompt (redacted, opt-in) → remove stale proposal → run agent → append run log → guardrails → timeout/exit checks → validate runId-bound proposal → gates/iteration → advance → **writeState LAST (next.ts:177), only after all validation** → release lock. Every failure path returns before `writeState`. No path advances state on failure. Confirmed correct:

- No-shell spawn with args array (runner.ts) — no shell-injection surface.
- Lock acquire atomic (`flag:"wx"`), release token-guarded so another owner's lock is never deleted (lockfile.ts).
- runId-bound `next_state_proposal.json` defeats stale/replayed proposals (next.ts:95-109, 154-161).
- Bearer tokens and PEM private-key blocks are redacted; prompt persistence redacts before write and is opt-in.

## Edge Case Analysis

Windows path matching is handled for the standard patterns: `.GIT\config` matches `.git/**`, `.env.local` matches `.env.*`, `node_modules/pkg/...` matches `node_modules/**` (path-patterns.ts:25-69, tested). Non-Git workspaces correctly enter limited guardrail mode rather than crashing or false-passing. See Blocking/Major for the gaps that remain.

## Blocking Issues

### IR-B1 — Secret redaction misses Spec-mandated patterns → secrets leak into `.agent/logs/runs.jsonl`

- Finding: `redact.ts:3-8` only covers `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `Authorization: Bearer`, and PEM private keys. The Spec (spec.md:356-367) requires "at minimum" also `GH_TOKEN`, `NPM_TOKEN`, and the wildcard families `*_TOKEN`, `*_SECRET`, `*_PASSWORD`. None of these are handled.
- Evidence (verified directly): `SECRET_ASSIGNMENT_PATTERN` and `SECRET_KEY_PATTERN` (redact.ts:3-8) are a fixed three-name list. `next.ts:127` appends raw agent `stdout`/`stderr` to the run log every run; redaction is applied at serialization via this incomplete pattern set. So an agent emitting `GH_TOKEN=...`, `AWS_SECRET=...`, or `DB_PASSWORD=hunter2` writes the secret unredacted into `.agent/logs/runs.jsonl` (and into persisted prompts when enabled). The repo is intended for GitHub preservation.
- Required Change: Broaden the assignment/key detection to `/^.*_(TOKEN|SECRET|PASSWORD)$/i` plus explicit `GH_TOKEN`/`NPM_TOKEN`, and extend the redact unit test to assert these are redacted (it currently asserts only the three literals).
- Acceptance Criteria: A stdout line containing each Spec-listed pattern is `[REDACTED]` in `runs.jsonl`.
- User Decision Required: No.

## Major Issues

### IR-M1 — Manifest `forbiddenPaths` matched case-sensitively → Windows fail-open

- Finding (verified): `policy.ts:60-61` passes `caseSensitive: true` only for the manifest's `forbiddenPaths`, while config `protectedPaths` (policy.ts:45-47) is case-insensitive. On Windows, a path whose casing differs from a `forbiddenPaths` entry bypasses the explicit per-plan forbidden list. This directly contradicts spec.md:399. Exposure is partially mitigated because config `protectedPaths` (case-insensitive) is checked first and catches the standard names; the gap is forbiddenPaths entries not also in protectedPaths.
- Required Change: Remove `caseSensitive: true` for `forbiddenPaths` (one line), matching the rest of the matcher.

### IR-M2 — Glob `**` only works as a trailing `/**`; other forms silently under-match → fail-open

- Finding (verified): `path-patterns.ts:41-69` special-cases trailing `/**`; any other `*`/`**` pattern falls to segment matching that requires equal segment counts and treats `*`/`**` as `[^/]*` (cannot cross `/`). So `**/secrets.txt` or `a/**/b` silently never match. The Spec/default patterns (all exact, `.env.*`, or trailing `/**`) are unaffected, but a user-authored protected pattern using a leading/mid `**` would fail open with no error.
- Required Change: Either support `**` generally, or reject unsupported pattern syntax at config validation so unknown forms fail closed rather than silently under-matching.

### IR-M3 — Run log is missing most Spec-required fields and is written before the outcome is known

- Finding: The run-log entry (next.ts:127, written right after the agent returns) contains timestamp/phase/actor/exit/timedOut/duration/stdout/stderr but omits the Spec's required fields (spec.md:333-347): agent command summary, prompt file path, output artifact paths, files changed, guardrail result, proposed next phase, accepted next phase. Several of these are not yet known at line 127 (they are computed later). The audit log is a core auditability feature and the foundation for the future delegation digest.
- Required Change: Move/augment the run-log write to occur after the outcome is known and include the required fields (or write a second completion record). Keep it append-only and redacted.

### IR-M4 — `return` inside `finally` on the commit path can silently advance state while reporting failure and leaving a stuck lock

- Finding (verified): `next.ts:183-188`. On the success path, `writeState` has already committed (177) and `operationSucceeded=true` (180); if `releaseLockfile` then fails, the `finally` block `return err(release.error)` overrides the success return AND the lock file remains — so the phase advanced, the caller sees an error, and the next run is blocked by `LOCK_EXISTS`. The `return`-in-`finally` also risks swallowing any in-flight exception.
- Required Change: Do not `return` from `finally`. Capture the result in a variable, release the lock without returning, and surface a release failure without discarding a committed advance (and without leaving the user locked out).

### IR-M5 — The dirty-working-tree pre-invocation block (Spec-mandated) has zero tests

- Finding: `checkGitCleanTree` (next.ts:53-56) is implemented, but every Git-backed integration test commits a clean baseline, so the dirty-tree block is never exercised. spec.md:413/521 and plan.md Test Plan require it. This is the one Spec-mandated pre-invocation gate with no coverage.
- Required Change: Add a test that dirties the tree after baseline commit and asserts `next` blocks (phase unchanged) with the commit/stash/discard message.

### IR-M6 — Symlink escape guardrails are skipped on Windows → a security guardrail ships unverified here

- Finding: The two symlink tests (path-patterns escape; untracked-symlink fail-closed) are skipped because this Windows environment denies symlink creation. The fail-closed *error-handling* branch is covered, but the actual *symlink-resolves-outside-workspace* decision is not exercised on the user's platform. The Spec treats symlink resolution as a security requirement.
- Required Change: Run the suite once on Linux CI or a Windows session with symlink privilege (Developer Mode / SeCreateSymbolicLinkPrivilege) so these execute; treat as residual risk until then.

### IR-M7 — `blockedCommands` is configured and validated but never enforced (clarify scope)

- Finding: `blockedCommands` defaults exist and validate, but no code consumes them; the Spec's "destructive command control" guardrail is effectively unimplemented. In this architecture the orchestrator runs the configured agent command and cannot see the agent's own subprocess commands, so blocked-command detection may be architecturally N/A here.
- Required Change: Either implement detection at a defined interception point, or explicitly document it as deferred/not-applicable and avoid shipping a config field that implies protection it does not provide.

## Minor Issues

- IR-m1: Clean-tree check runs before lock acquisition (next.ts:53-60); move inside the lock so the precondition and the agent run are atomic.
- IR-m2: Post-run guardrails run before the timeout/non-zero-exit checks (next.ts:130-152); on a timeout, a guardrail error can mask the real cause. Reorder (still fails closed either way).
- IR-m3: A co-present `.agent-flow.yaml` is not reported as unsupported when `.agent-flow.json` is loaded by default (load.ts); spec.md:164 edge case unmet.
- IR-m4: Stream capture cap is char-count not byte-count and can split a surrogate pair (runner.ts); redaction also double-walks the tree (perf only).
- IR-m5: `--strict` is parsed and threaded but is a no-op (config-validate.ts:25); document as reserved or implement.
- IR-m6: `init` writes a bare `{ "version": 1 }` rather than populated defaults (init.ts), so the generated file is not self-documenting for the user-verification step.
- IR-m7: Unreadable-config (EACCES) error path is untested.
- Scope: agent `env` config field omitted (matches Plan; Spec lists it). Confirm intentional deferral given Wave 2 is agent execution.

## Test Coverage

Strong and high-quality: negative-path integration tests re-read canonical state and assert non-advancement; several also assert the agent was never spawned and that exactly one log line was written. No tautological tests found. Gaps: IR-M5 (dirty tree), IR-M6 (symlink skipped on Windows), IR-m3/IR-m7 (config edge cases), and IR-B1's redaction test only covers the three literal names.

## Regression Risk

Low — greenfield. The material risks are the fail-open guardrail gaps (IR-M1, IR-M2) and the secret-leak path (IR-B1), not regressions of existing behavior.

## Required User Verification

- After IR-B1 is fixed, confirm redaction on a sample stdout containing each Spec-listed secret pattern.
- Run the symlink suite on a platform where symlink creation is permitted (IR-M6).
- The Spec's user-verification points stand: run `init` in a disposable workspace; configure a real agent and run one `next`; verify protected-path blocking in a disposable Git workspace.

## Approval Status

Needs revision.

Fix IR-B1 (Blocking) and the fail-open guardrail Majors (IR-M1, IR-M2) before relying on Wave 2 routine execution. Address IR-M3/IR-M4 (audit-log fields, return-in-finally) and add the IR-M5 test; run IR-M6 on a symlink-capable platform. The Minors can follow. No redesign required — the architecture and the fail-closed state machine are sound.
