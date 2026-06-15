# Run-Until-User-Gate Design Review

Reviewer: Claude Code (review session)
Artifact under review: `.agent/artifacts/run_until_user_gate_design.md`
Verification: key assumptions checked against the current source (`next.ts` `advanceState`, `state/schema.ts`, `workflow/actors.ts`).
Mode: manual handoff.

## Summary

A clean, narrow, safety-preserving design. It adds `agent-flow run-until-user-gate` as a thin loop over the existing `nextCommand()`, stopping at user-owned phases, `done`, errors, or a fixed step limit. It does not clear, skip, or delegate any gate, and it places the future gate-policy seam (`evaluateRunStop()` returning a decision object) exactly where the delegation wave will need it. No blocking issues. One Major design item (active-gate handling) and several Minors to fold into the implementation plan. Status: **Approved with minor comments** — ready for implementation-plan creation once D1 is incorporated.

## Scope / Compliance

- Aligned with the user's chosen scope: `run-until-user-gate` only, Loop Wrapper approach, stop at every `user` actor phase. PASS
- No gate is cleared/skipped/delegated; the loop only calls `nextCommand()`, which itself blocks on active gates, and stops at `currentActor === "user"`. PASS
- Delegation, `review_verdict.json`, delegated-gate config, and hard-floor logic are correctly OUT of scope. PASS
- Reuses `nextCommand()` (no duplication of guardrails/logging/lock/proposal/state logic). PASS

## Verified assumptions (against code)

- `advanceState` (next.ts:575-595) sets `currentActor: nextActor` and `status: statusForActor(nextActor)`, where `nextActor = getActorForPhase(proposal.nextPhase)`. So advancing into a `user_*` phase yields `currentActor === "user"`. The design's stop signal is correct. CONFIRMED.
- Advancing to `done` yields `currentActor === "none"` (actors.ts), which the design covers via both `status === "done"` and `currentActor === "none"`. CONFIRMED.

## Safety Assessment

The critical safety property — user phases remain hard stops and no gate is auto-cleared — is preserved. The loop never calls anything that mutates gates; it stops before invoking an agent at a user phase (the prior step's advance into the user phase ends the loop on the next `evaluateRunStop()`). Fail-closed on error and step-limit. Good.

## Blocking Issues

None.

## Major Issues

### D1 — `evaluateRunStop()` ignores active explicit gates (`state.gates[*].active`)

- Finding: The stop decision keys only on `currentActor`/`status`. But `nextCommand()` independently blocks when any `state.gates[*].active` is true (next.ts:70-79, `USER_GATE_ACTIVE`). If a gate can be active while `currentActor` is `implementation`/`review`, the loop's `evaluateRunStop()` returns "continue", calls `nextCommand()`, and surfaces a normal user-decision point as an ERROR (`Stopped … because next failed: USER_GATE_ACTIVE`) instead of a clean user-gate stop.
- Why it matters: "Stop at user gate" should robustly mean "stop whenever user input is required," which includes an active explicit gate — not just a `user`-actor phase. Anchoring `evaluateRunStop()` on BOTH `currentActor === "user"` AND any active gate also future-proofs the migration: the gate-delegation engine reasons about gates explicitly, so the stop boundary should already see them.
- Required Change: Have `evaluateRunStop()` also stop with reason `user_gate` when any `state.gates[*].active` is true, carrying the gate name in the decision/message. Alternatively, if the MVP provably never sets a gate active without `currentActor === "user"`, document that invariant explicitly and add a test asserting it — but incorporating the active-gate check is cheaper and more correct.
- Acceptance: A state with an active explicit gate (any actor) stops cleanly with reason `user_gate`, not via an error path.

## Minor Issues

- D2 (step limit): Justify the limit instead of an arbitrary `20`. The longest single inter-gate segment is bounded by the longest phase path times the max review iterations (≈ 8-10 steps given `maxSpecReviewIterations`/`maxPlanReviewIterations`/`maxImplementationReviewIterations` = 3). Keep it a named constant with a documented rationale and a test; ensure it comfortably exceeds the worst-case segment.
- D3 (error-code handling — answers an open question): On a `nextCommand()` failure, preserve the ORIGINAL error code as the command's result/exit code and attach the run summary (steps run, last phase) in `details`/message. Do NOT wrap it in a new generic code, so automation can still detect the real cause (e.g., `GUARDRAIL_PROTECTED_PATH`, `ITERATION_LIMIT_EXCEEDED`).
- D4 (tests): Add (a) a step-limit test asserting NO state mutation on exhaustion (fail-closed), (b) a multi-step run that crosses a review back-edge (`spec_review → spec_review_response → spec_review`) to confirm the loop handles iteration loops, and (c) a test that iteration-limit exhaustion ends the run without advancing state.
- D5 (iteration-limit behavior): Note in the design that mid-run iteration-limit exhaustion surfaces as an error stop requiring user attention (fail-closed, acceptable). Document the expected summary message.

## Answers to the handoff's Open Questions

1. Fixed internal step limit without a public config field — acceptable for this wave; aligns with the small-surface, dependency-light direction. Justify the value (D2).
2. Specify the limit exactly vs named constant — named constant with documented rationale + a test (D2). Do not expose a config field this wave.
3. Per-step locking sufficient — YES. Do NOT acquire a top-level lock around the whole run; it would deadlock against `nextCommand()`'s per-step lock. The design's choice is correct.
4. Return original `nextCommand()` error code vs wrap — preserve the original code; add the run summary in details (D3).

## Testing / Acceptance

The testing plan is solid (evaluateRunStop unit, parser/help, integration: impl→user stop, already-at-user, already-done, failing next, step-limit). Add D1's active-gate test and D4's three cases. Acceptance criteria are sufficient and correctly emphasize "never runs an agent when already user-owned/done" and "stops without clearing any gate."

## Approval Status

Approved with minor comments.

Ready for implementation-plan creation. Incorporate D1 into `evaluateRunStop()` (active-gate stop), and fold D2-D5 and the open-question answers into the plan. No redesign required; the architecture and the migration seam are sound.
