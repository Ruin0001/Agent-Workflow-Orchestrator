# Run-Until-User-Gate Implementation Plan Review

Reviewer: Claude Code (review session)
Artifact: `.agent/artifacts/run_until_user_gate_plan.md`
Note: This wave went design → design-review → plan → user gate without a separate plan_review step; this is that plan review, performed before the user approves.
Verification: load-bearing assumptions in the plan's embedded code/fixtures checked against the live source.
Mode: manual handoff.

## Summary

The plan is detailed, TDD-ordered, scope-controlled, and correctly incorporates all design-review findings (D1-D5). The two load-bearing assumptions that the test strategy depends on were verified against the code. No blocking or major issues. Two minor process notes for the user's awareness. Recommendation: approvable.

## D1-D5 incorporation (verified in the plan)

- D1: `evaluateRunStop()` stops on any active `state.gates[*].active`, carrying `gateName`/`gateReason`, before the `currentActor === "user"` check (plan run-stop.ts:180-192). Unit + integration tests included.
- D2: `RUN_UNTIL_USER_GATE_MAX_STEPS = 20` named constant with documented rationale (exceeds the worst-case inter-gate segment under default iteration limits). No public config field.
- D3: `nextCommand()` failures preserve the original error code; run summary added under `details.runUntilUserGate` (+ a message suffix). Test asserts the original code survives.
- D4: tests for step-limit no-extra-mutation, review back-edge traversal, iteration-limit exhaustion.
- D5: iteration-limit exhaustion documented and tested as a fail-closed error stop.

## Load-bearing assumptions (verified against source)

- Prompt format: the phase-aware fixtures parse `/^Phase: (.+)$/m`. `renderPrompt` emits `Phase: ${state.phase}` (render.ts:21). MATCH — fixtures will resolve the phase correctly.
- Gate schema: `WorkflowGate.requestedAt` is optional (state/schema.ts:9-13), so the D1 active-gate integration test that omits it is valid.
- `createInitialState(config)` takes the config (state/schema.ts:52) — matches the unit-test usage.

## Correctness spot-checks

- Step-limit math: with `maxSteps=2`, two `nextCommand()` calls run (RU→spec_creation, spec_creation→spec_review), then the loop exits with `RUN_UNTIL_STEP_LIMIT` and no third call — matches the test's `phase: spec_review` / no-extra-mutation assertion.
- Iteration-limit path: `evaluateNextGates` returns `ITERATION_LIMIT_EXCEEDED` before `writeState`, so the loop preserves the code with `stepsRun: 0` and no advance — matches the test.
- Reuse: the command loops `nextCommand()` and does not duplicate guardrails/logging/lock/proposal/state logic. Per-step locking only (no top-level lock) — correct, avoids deadlock.

## Minor notes (non-blocking)

- N1 (process): Task 8 commits per task and `git push origin main` (Task 8 Step 6) BEFORE the Claude implementation review (which Task 8 then hands off to). Code reaches `main` pre-review. This matches the project's established practice (Codex has committed/pushed in prior waves), but the user should be aware they are authorizing per-task commits + push by approving the plan. If the user prefers review-before-push, Task 8 should hand off for review first and push after.
- N2: Task 2 modifies an existing `args.test.ts` delimiter test. The change looks benign (makes the unknown-command expectation explicit), but modifying existing tests should preserve, not weaken, prior coverage.

## Approval Status

Approved with minor comments — ready for the user_plan_approval decision. No revisions required before implementation; N1/N2 are awareness items.
