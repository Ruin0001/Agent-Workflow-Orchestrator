# Run-Until-User-Gate Implementation Review

Reviewer: Claude Code (review session)
Scope: the `run-until-user-gate` wave (Plan Tasks 1-8).
Method: read the actual source and tests directly; independently ran the full suite.
Reference: `run_until_user_gate_design.md`, `run_until_user_gate_design_review.md`, `run_until_user_gate_plan.md`, `run_until_user_gate_plan_review.md`.
Mode: manual handoff.

## Summary

Clean, correct, and well-tested. The implementation is a thin loop over `nextCommand()` that stops at user-owned phases, active explicit gates, `done`, errors, or the step limit, without clearing/skipping/delegating any gate. All design-review findings (D1-D5) are implemented and covered by strong, non-tautological tests. The loop is actually more robust than the plan. No blocking, major, or minor issues found. Approval: **Approved**.

## Independent verification

Reviewer ran `npm test` directly: **127 tests, 125 pass, 0 fail, 2 skipped** (the 2 skips are the pre-existing Windows symlink tests, unrelated to this wave). Matches the handoff's reported counts.

## Plan / Design Compliance (verified in code)

- `evaluateRunStop()` (`src/workflow/run-stop.ts`) is a pure boundary: stops on `done`/`currentActor==="none"`, then active explicit gate (D1, carrying `gateName`/`gateReason`), then `currentActor==="user"`, else continue. Matches the design.
- `runUntilUserGateCommand()` (`src/commands/run-until-user-gate.ts`) loops `nextCommand()` and re-reads canonical state each iteration; it does not duplicate guardrails, logging, lock, proposal validation, or state advancement. No top-level lock (correctly avoids deadlock with `nextCommand()`'s per-step lock).
- D2: `RUN_UNTIL_USER_GATE_MAX_STEPS = 20` named constant; plus a `maxSteps` validation guard (non-negative integer).
- D3: `withRunSummary()` preserves the original error code (`...error`), appends a summary message, and adds `details.runUntilUserGate`. Verified by a test asserting the code is NOT `RUN_UNTIL_STEP_LIMIT` and the original code/text survives.
- D4/D5: tests cover step-limit no-extra-mutation, review back-edge traversal, and iteration-limit exhaustion.
- CLI wired: `args.ts` (union + parse), `main.ts` (dispatch via `commandOptions`), `output.ts` (help lists the command).

## Correctness notes (verified by trace)

- Already-at-gate / done / active-gate: the loop evaluates at the top of each iteration, so it stops with `Steps run: 0` and never invokes an agent. Tests assert no invocation markers and `deepEqual(state, before)` (no mutation).
- Step counting is consistent (loop index equals `stepResults.length` at each top-of-loop check), so "Steps run: N" is accurate (multi-step test asserts 3; back-edge test asserts 2).
- Post-loop re-evaluation (after `maxSteps`) is a correctness improvement over the plan: if the final allowed step lands exactly on a user gate, it returns a clean stop instead of a spurious `RUN_UNTIL_STEP_LIMIT`.
- Error/iteration-limit paths preserve the original code and do not advance state (tests assert `deepEqual(finalState, before)` and the original `ITERATION_LIMIT_EXCEEDED` / validation codes).

## Safety Assessment

The critical property — no user gate is cleared, skipped, or delegated — holds. The loop only calls `nextCommand()` (which itself blocks on active gates and user phases) and stops at the first user-owned phase or active gate. Fail-closed on every error and on step-limit, with no extra mutation. Scope stayed limited to `run-until-user-gate`; no delegation config, `review_verdict.json`, or gate auto-pass was added. The `evaluateRunStop()` decision-object boundary is in place for the future gate-policy engine.

## Test Quality

Strong. Stop cases assert state non-mutation via `deepEqual(state, before)` and agent non-invocation via marker enumeration; the cycle test even asserts invocation order via a log. Error tests assert exact codes and `details`. No tautological tests.

## Blocking / Major / Minor

None.

## Approval Status

Approved.

No revision required. The wave is implementation-complete and verified (build/typecheck/test green, independently confirmed). Remaining residuals are pre-existing and out of this wave's scope (IR-M6 symlink platform skip; `blockedCommands` subprocess boundary; agent `env` deferral).
