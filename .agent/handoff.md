# Agent Handoff

## Current Phase

`run-until-user-gate` implementation (plan approved at user_plan_approval).

## Current Status

The plan was reviewed by the Claude Code review session (plan_review: Approved with minor comments, no blocking/major; load-bearing assumptions verified against source). The user CLEARED the `user_plan_approval` gate: approved the plan with push included, and chose subagent-driven execution.

Plan artifact: `.agent/artifacts/run_until_user_gate_plan.md`.
Plan review: `.agent/artifacts/run_until_user_gate_plan_review.md`.
Design + design review: `.agent/artifacts/run_until_user_gate_design.md`, `.agent/artifacts/run_until_user_gate_design_review.md`.

Manual handoff mode remains in effect.

## Previous Actor

User (approved plan)

## Next Actor

Codex (implementation agent)

## Current Task

Implement `.agent/artifacts/run_until_user_gate_plan.md` task-by-task (Tasks 1-8) using `superpowers:subagent-driven-development`, with TDD red/green per task and verification before completion. Commit per task and `git push origin main` at Task 8 (push approved). Then hand off to the Claude review session for implementation review.

User decisions made at the gate:
- Plan approved (push included).
- Execution style: subagent-driven.

Plan review awareness items to honor during implementation:
- N1: per-task commits + push-before-review are approved.
- N2: when modifying the existing `args.test.ts` delimiter test, preserve (do not weaken) existing coverage.
- Keep scope to `run-until-user-gate` only; do NOT start Gate Delegation, add delegation config, `review_verdict.json`, or any gate auto-pass.

## What Was Done

Claude design review:

- Reviewed `.agent/artifacts/run_until_user_gate_design.md`.
- Approval status: Approved with minor comments.
- Confirmed the Loop Wrapper approach is aligned with the user's chosen scope.
- Confirmed no user gate is cleared, skipped, or delegated.
- Confirmed the `evaluateRunStop()` boundary is a sound migration point for the later Gate Policy Engine.
- Produced `.agent/artifacts/run_until_user_gate_design_review.md`.

Review findings incorporated into the plan:

- D1: `evaluateRunStop()` stops on active explicit gates, not only `currentActor === "user"`.
- D2: step limit is a named internal constant, `RUN_UNTIL_USER_GATE_MAX_STEPS = 20`, with rationale and tests.
- D3: `nextCommand()` failures preserve the original error code and attach run summary details.
- D4: tests cover no extra mutation on step-limit exhaustion, review back-edge traversal, and iteration-limit exhaustion.
- D5: iteration-limit exhaustion is documented and tested as a fail-closed error stop requiring user attention.

Plan created:

- `.agent/artifacts/run_until_user_gate_plan.md`

## Artifacts Created or Updated

- Created `.agent/artifacts/run_until_user_gate_design_review.md`
- Created `.agent/artifacts/run_until_user_gate_plan.md`
- Updated `.agent/handoff.md`

## Files Changed Since Last Pushed Commit

- `.agent/artifacts/run_until_user_gate_design_review.md`
- `.agent/artifacts/run_until_user_gate_plan.md`
- `.agent/handoff.md`

## Commands / Checks Run

- Read `.agent/handoff.md`.
- Read `.agent/artifacts/run_until_user_gate_design_review.md`.
- Read `.agent/artifacts/run_until_user_gate_design.md`.
- Inspected current source needed for plan accuracy:
  - `src/cli/args.ts`
  - `src/cli/main.ts`
  - `src/cli/output.ts`
  - `src/state/schema.ts`
  - `src/state/store.ts`
  - `src/workflow/actors.ts`
  - `src/workflow/gates.ts`
  - `src/workflow/transitions.ts`
  - `src/prompts/render.ts`
  - current integration/unit test patterns
- Self-reviewed `.agent/artifacts/run_until_user_gate_plan.md` for placeholders, scope creep, D1-D5 coverage, and type-name consistency.

No build/test verification was run because no implementation code changed. Plan-only artifact creation does not require build execution.

## Plan Summary

The plan is TDD-oriented and split into eight tasks:

1. Add `src/workflow/run-stop.ts` and stop-decision unit tests.
2. Add CLI parser/help support.
3. Add `src/commands/run-until-user-gate.ts` and dispatch.
4. Cover normal multi-step stop at first user gate.
5. Cover active gate, done, and original error-code preservation.
6. Cover step-limit fail-closed behavior.
7. Cover review back-edge and iteration-limit stops.
8. Run final verification and hand off for Claude implementation review.

The plan explicitly stops after implementation review handoff and forbids starting Gate Delegation in this wave.

## Known Risks / Residuals

- IR-M6 symlink guardrail tests are still unverified on this Windows environment.
- `blockedCommands` enforcement remains scoped to the configured command the orchestrator spawns, not subprocesses inside a real agent.
- Agent `env` remains deferred; do not add it in this wave unless the user explicitly changes scope.
- Deferred MVP minors remain available as future cleanup, but the user selected `run-until-user-gate` only for this wave.

## User Decisions Required

None — the user_plan_approval gate is cleared (plan approved, push included, subagent-driven execution).

## Next Required Action

Codex implements `.agent/artifacts/run_until_user_gate_plan.md` task-by-task with `superpowers:subagent-driven-development` (TDD per task, verification before completion), committing per task and pushing at Task 8. On completion, Codex hands off to the Claude review session for the implementation review of this wave.

---

# Queued Future-Wave Handoff: Gate Delegation Design (NOT part of the current wave)

The approved design for a future `agent-flow` feature — gate delegation (per-project autonomy profile) — remains queued. It must NOT be implemented in the `run-until-user-gate` wave.

- Design document: `.agent/proposals/2026-06-14-gate-delegation-design.md`
- Summary: per-project opt-in (default OFF) to auto-pass selected user gates (`user_plan_approval`, `user_verification`, review-iteration convergence) at a STRICT bar (review verdict `Approved` with 0 Blocking / 0 Major), while a compiled-in hard floor and `user_spec_review` always stop for the user.
- Sequencing: MVP → `run-until-user-gate` wave → machine-readable `review_verdict.json` if needed → gate-delegation wave.
- The `run-until-user-gate` plan keeps the stop-decision boundary so this later policy engine can be added without rewriting the command loop.
