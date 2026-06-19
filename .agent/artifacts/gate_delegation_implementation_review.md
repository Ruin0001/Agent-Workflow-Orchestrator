# Gate Delegation v1 — Implementation Review

Reviewer: Claude Code (review session)
Scope: the gate-delegation v1 wave.
Method: directly read and verified the safety-critical files (config immutability, delegated loop, auto-clear, verdict validator); two parallel sub-reviews over support modules and tests; independently ran the suite. Blocking finding verified firsthand.
Reference: ratified `gate_delegation_spec.md`, `gate_delegation_plan.md`, `gate_delegation_plan_review.md` (GD-P1..P6).
Mode: manual handoff.

## Summary

The implementation is strong and faithful to the tightened v1, and it correctly resolves all six plan-review findings (GD-P1..P6) — verified in code. The architecture (default OFF, double opt-in, hard-coded config immutability, validated non-agent auto-clear, runId-bound verdict with stale removal, clean fail-to-user-stop) is sound and well tested.

One Blocking defect: the verdict status enum deviates from the ratified Spec schema — it rejects `Approved with minor comments` and `Blocked` and invents `Rejected`. It fails closed (a rejected verdict stops for the user, no unsafe auto-pass), but it breaks Spec Scenario 4 and the core verdict contract, so it must be fixed. Plus a few minors. Status: **Needs revision**.

Independent verification: reviewer ran `npm test` → 154 tests, 152 pass, 0 fail, 2 skipped (pre-existing Windows symlink skips). Build/typecheck green per Codex.

## Plan Compliance (GD-P1..P6 — verified in code)

- GD-P1 (config immutability) — RESOLVED, verified. `.agent-flow.json` is in default `protectedPaths` (`config/defaults.ts:106`) AND there is a hard-coded `agentImmutablePathPatterns` check in `guards/policy.ts:29,47-55` that runs FIRST in the per-file loop — before configured protectedPaths and before any manifest allowance — returning `GUARDRAIL_AGENT_IMMUTABLE_PATH`. So a manifest cannot authorize editing config, and a project override of `protectedPaths` cannot remove the protection. This is exactly the ratified "both default path and hard-coded rule." Tested (delegated + non-delegated).
- GD-P2 (delegated loop) — RESOLVED, verified. `run-until-user-gate.ts:62-90`: on a `user_plan_approval` stop in delegated mode, it reads+validates the verdict, calls `canDelegateUserPlanApproval` with `expectedRunId = lastPlanReviewRunId`, and on ANY failure (missing/invalid/stale/below-bar/no-current-run) returns `ok(formatRunSummary(...))` — a clean exit-0 user stop, no auto-clear, no digest. Stale verdict removed at run start; `lastPlanReviewRunId` tracked from the same-run `plan_review` step.
- GD-P3/P4 — RESOLVED. Fixture chain reaches `user_verification`; stale/mismatched-runId and prior-run-replay tests assert clean stops with no auto-clear and no digest.
- GD-P5/P6 — RESOLVED (digest/audit before state; `rm` import; run-log signature).

## Code Correctness (verified directly)

- Auto-clear (`delegated-gate-clear.ts`): acquires lock → re-reads state and re-checks `user_plan_approval`+`user` (defensive TOCTOU guard) → `validateTransition(user_plan_approval → task_classification)` → digest → audit → `writeState` (last) → release in `finally`. Fail-closed ordering correct.
- Delegation policy (`delegation-policy.ts`): runId binding cannot be bypassed — `expectedRunId === null` short-circuits to fail before the strict-bar check; gate tiers are static constants. Verified.
- `next.ts` refactor: `nextStepCommand` returns the per-step `runId` (the same UUID embedded in the prompt and enforced in proposal validation); `nextCommand` preserves the exact prior message string. Regression-safe.
- Digest returns `Result` and the caller treats failure as fatal before state advance.

## Blocking Issues

### GDI-B1 — Verdict status enum deviates from the ratified Spec schema

- Finding (verified firsthand): `src/artifacts/review-verdict.ts:4` defines `PlanReviewVerdictStatus = "Approved" | "Needs revision" | "Rejected"`, and `readStatus` (lines 67-71) accepts only those three. The ratified Spec (Review Verdict Schema, validation requirements) and the Plan require the four standard statuses: `Approved`, `Approved with minor comments`, `Needs revision`, `Blocked`.
- Impact: A `plan_review` verdict with `Approved with minor comments` (the most common real review status — this project's own reviews use it) or `Blocked` is rejected as an *invalid/unknown-status* verdict instead of validating and stopping below-bar per Spec Scenario 4 / Req 11. And `Rejected` is invented (no review phase emits it). Operationally this fails closed (invalid verdict → clean user stop, no unsafe auto-pass), so there is no autonomy-escalation hole — but the verdict contract, which is the heart of the feature, is incorrect, and a defined core scenario is broken.
- Required Change: Correct the enum and `readStatus` to exactly the four standard statuses. Confirm `strictBarPasses` stays unchanged (it already passes only on exact `Approved`/0/0, which is correct). Add a verdict-validation test asserting `Approved with minor comments` and `Blocked` VALIDATE (ok) and then fail the strict bar (clean stop) — this is the test that would have caught it.
- Acceptance: A `plan_review_verdict.json` with `status: "Approved with minor comments"` validates and produces a clean below-bar stop at `user_plan_approval` with the tailored message; `Blocked` validates and stops; `Rejected` is no longer accepted.

## Major Issues

None beyond GDI-B1.

## Minor Issues

- GDI-m1: `iteration` is validated with `readPositiveInteger` (`review-verdict.ts:35,81-85`), rejecting `0`. Spec requires non-negative (`>= 0`) for all counts incl. iteration. Switch to `readNonNegativeInteger`. Low practical impact.
- GDI-m2: No INTEGRATION test for a below-bar verdict driving a full `--delegated` run to a clean stop at `user_plan_approval` (only unit-level `strictBarPasses`). After GDI-B1 is fixed, add one using `Approved with minor comments` (also closes the gap that hid B1). 
- GDI-m3: The verdict-validation unit tests live in `test/unit/artifacts.test.ts`, not the plan's `test/unit/review-verdict.test.ts`; relocation is fine, but they currently don't assert the full status set (hence B1 slipped). Add the status cases there.
- GDI-m4: The delegated config-override hard-floor guarantee is exercised incidentally (the shared fixture empties `protectedPaths`); consider an explicit named assertion. Digest-write-failure fatal path (GD-P5) has no negative test (acknowledged-acceptable).

## Edge Case / Test Coverage

All six safety behaviors are covered with real, non-tautological assertions (state non-advancement + absence of auto-clear/digest), confirmed: config-immutability block (delegated + non-delegated), happy-path auto-clear → user_verification + digest, stale/mismatched-runId clean stop, prior-run replay (stale removed), disabled-refusal, non-delegated regression. Git-gated tests skip cleanly when git is absent. Gaps: GDI-m2 (below-bar integration), GDI-m4.

## Regression Risk

Low. The `next.ts` extraction keeps `nextCommand` returning the identical string; existing next/run-until tests stay green (152 pass). Non-delegated `run-until-user-gate` path is unchanged.

## Required User Verification

- After GDI-B1, optionally run a disposable `--delegated` workflow with a fake `plan_review` agent emitting `Approved with minor comments` and confirm a clean stop (no auto-clear).
- The existing IR-M6 symlink residual still applies (run on a symlink-capable platform).

## Approval Status

Needs revision.

Fix GDI-B1 (verdict status enum → the four ratified statuses; add the status-validation test) and the minors (GDI-m1 iteration non-negative; GDI-m2 below-bar integration test). Everything else — GD-P1..P6 resolution, the auto-clear mechanism, runId binding, fail-closed stops, config immutability — is correct and verified. After the fix and re-review, route to the `user_verification` gate (a KEPT gate, so the user verifies regardless).
