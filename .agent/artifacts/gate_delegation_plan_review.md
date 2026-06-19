# Gate Delegation — Implementation Plan Review

Reviewer: Claude Code (review session)
Artifact: `.agent/artifacts/gate_delegation_plan.md`
Basis: ratified `gate_delegation_spec.md` (+ spec review/response), and current source (`config/defaults.ts` protectedPaths, `next.ts`, `run-until-user-gate.ts`, `run-stop.ts`, `transitions.ts`, `state/store.ts`, `logging/run-log.ts`).
Mode: manual handoff.

## Summary

A detailed, TDD-ordered Plan that correctly implements the tightened v1 (delegate `user_plan_approval` only) and resolves the prior Spec-review mechanism gaps well: GD-S1 (scope), GD-S2 (validated non-agent auto-clear transition), GD-S3 (runId binding + stale-verdict removal at run start). Format is complete (§13).

However, the Plan omits a user-ratified core safety requirement — `.agent-flow.json` agent-immutability — and under-specifies the central delegated-loop integration. Status: **Needs revision**. The config-immutability gap (GD-P1) is the most important: without it, the Spec's own "mid-run config edits are caught by protected-path guardrails" mechanism does not hold.

## Spec Compliance

- v1 scope correct: delegate `user_plan_approval` only; no `review_iteration`, `user_verification`, or spec/impl verdicts. PASS
- GD-S2 (auto-clear): Task 7 performs a locked, transition-validated, audited `user_plan_approval → task_classification` non-agent transition, not via `nextCommand()`. PASS
- GD-S3 (freshness): Task 4 exposes per-step runId via `nextStepCommand`; Task 8 clears the stale verdict at run start and binds the verdict to the current run's `plan_review` step runId. PASS
- Strict bar, double opt-in, default OFF, trusted-verdict boundary, digest-before-completion: present (Tasks 1, 2, 3, 5, 6, 7). PASS
- **Config immutability: MISSING** (see GD-P1).

## Blocking Issues

None strictly blocking, but GD-P1 is a ratified-requirement omission that must be fixed before implementation.

## Major Issues

### GD-P1 — `.agent-flow.json` agent-immutability (anti-escalation) is not implemented in the Plan

- Finding: The ratified Spec requires `.agent-flow.json` to be agent-immutable, enforced by "both a default protected path and a hard-coded agent-immutable rule," and states that mid-run config edits are "caught by post-run protected-path guardrails." But no task implements this. `config/defaults.ts` default `protectedPaths` is `[.env, .env.*, .git/**, node_modules/**, dist/**, build/**, coverage/**]` (verified) and Task 1 only adds the `delegation` block — it does NOT add `.agent-flow.json`. There is no hard-coded config-immutability guardrail task either.
- Why it matters: This is the central anti-escalation invariant of the whole wave — it stops an agent from editing config to widen its own delegation. Without it, the Spec's "caught by guardrails" claim is false (an agent editing `.agent-flow.json` would pass the post-run protected-path check). 
- Required Change: Add a task to make `.agent-flow.json` agent-immutable — at minimum add it (and the config path if configurable) to the default protected paths, and per the ratified decision add a hard-coded guardrail so it holds even if a project overrides `protectedPaths`. Add tests: an agent changing `.agent-flow.json` during a delegated (and non-delegated) run is blocked.

### GD-P2 — The delegated-loop integration (verdict load → policy check → fail-to-user-stop) is specified only narratively

- Finding: Task 8 Step 4 says "When stop decision is `user_plan_approval`, load and validate verdict, check policy, then call `clearDelegatedUserPlanApproval()`. Continue loop." This is the heart of the feature, yet — unlike every other task — it shows no concrete logic for: reading `plan_review_verdict.json`, calling `validatePlanReviewVerdict`, calling `canDelegateUserPlanApproval({ expectedRunId: lastPlanReviewRunId, ... })`, and crucially the FAIL path (verdict missing/stale/below-bar → STOP at `user_plan_approval` as a normal clean user stop, not an error).
- Required Change: Specify the delegated-stop handling concretely, including: on policy `ok:false`, return the normal user-gate stop summary (clean exit 0 at the gate, no auto-clear); on `ok:true`, call the auto-clear and continue. Make explicit that a missing/invalid/stale verdict is a clean user stop, not a failure.

## Minor Issues

- GD-P3: The Task 8 fixture `fake-agent-gate-delegation-plan.mjs` defines steps only through `task_classification → implementation`, but the test asserts the run reaches `user_verification` with exit 0. Steps for `implementation`, `implementation_review`, and `testing` are missing, so the run would hit "Unsupported phase" (exit 2) at `implementation`. Complete the fixture chain (implementation → implementation_review → testing → user_verification) so the asserted stop is reachable.
- GD-P4: The stale-verdict safety test is implied (fixture `fake-agent-gate-delegation-stale-verdict.mjs` is created and committed) but no task specifies a test that exercises a stale/mismatched-runId verdict and asserts the delegated run STOPS at `user_plan_approval` without auto-clearing. Add it — it is a key GD-S3 safety test (also covers "started already at the gate with a prior-run verdict").
- GD-P5: In Task 7, digest and audit are written before `writeState`. This correctly makes digest failure fatal-before-advance (good), but a rare `writeState` failure after a successful digest/audit write would leave a digest/audit entry for a non-advance (over-reporting; the next run re-clears and writes a duplicate entry). Acceptable and fail-closed, but note it, or mark the digest record provisional-until-state-committed.
- GD-P6: Ensure the `rm` import is added in `run-until-user-gate.ts` (Task 8 stale-verdict removal), and confirm `appendRunLogEntry({ logDir, entry })` matches the existing run-log signature/shape used elsewhere (the delegation entry adds `outcome: "delegated_auto_pass"`, `gate`, `transition`, `verdict`).

## Edge Case Coverage

Good (disabled+`--delegated`, stale/missing/below-bar verdict, kept gate, hard floor, config edit). Gaps tie to GD-P4 (stale-verdict run test) and GD-P1 (config-immutability test). The "started already at `user_plan_approval` with no current-run verdict" case is handled by stale-removal + null `expectedRunId` → clean stop; add a test for it.

## Test Coverage

Strong unit coverage (config, verdict, policy, digest, parser). Integration covers auto-clear, delegated success, disabled-refusal. Add: GD-P1 config-immutability block, GD-P4 stale-verdict stop, and fix GD-P3 so the success integration test is actually runnable.

## Regression Risk

Low-moderate. The `next.ts` refactor (Task 4: extract `nextStepCommand`, keep `nextCommand` as wrapper) is the main regression surface; the Plan keeps the wrapper returning the exact old string and re-runs existing next tests — adequate, provided the existing run-until/next tests stay green.

## User Verification Points

The Plan's UVPs are reasonable. Given GD-P1, add: confirm an agent cannot edit `.agent-flow.json` to grant itself delegation (verify the guardrail blocks it).

## Questions / Recommendations

1. Implement GD-P1 as a dedicated early task (it is a safety prerequisite, not a nicety).
2. Specify GD-P2 concretely, emphasizing the clean-stop fail path.
3. Fix the fixture (GD-P3) and add the stale-verdict test (GD-P4) before claiming the wave green.
4. No scope expansion — these are gap-fills within the ratified v1.

## Approval Status

Needs revision.

Resolve GD-P1 (config immutability — the ratified anti-escalation safeguard) and GD-P2 (concrete delegated-loop integration with clean fail-to-user-stop), and fix the test gaps GD-P3/GD-P4, in a plan_review_response and Plan update. The architecture and the GD-S1/S2/S3 resolutions are sound; this is gap-filling, not redesign. Then route to `user_plan_approval`.
