# Agent Handoff

## Current Phase

`run-until-user-gate` design complete; ready for Claude review.

## Current Status

The MVP cycle is functionally complete. Implementation review converged, user verification items 1-3 passed via live reviewer-run checks, and the remaining IR-M6 symlink check is a platform residual requiring Linux CI or a symlink-privileged Windows session.

The user has started the next wave and explicitly selected the narrow scope: implement `run-until-user-gate` only. The user chose the Loop Wrapper approach: stop at every `user` actor phase now, while keeping a small internal stop-decision boundary so the near-term Gate Policy Engine / delegation wave can be added quickly later.

Design artifact: `.agent/artifacts/run_until_user_gate_design.md`.

Manual handoff mode remains in effect.

## Previous Actor

Codex

## Next Actor

Claude Code review session

## Current Task

Review `.agent/artifacts/run_until_user_gate_design.md` for correctness, scope control, safety, and readiness for implementation planning.

The review should answer:

- Is the design aligned with the user's chosen scope: `run-until-user-gate` only?
- Does it preserve the rule that no user gate is cleared, skipped, or delegated in this wave?
- Is the proposed `evaluateRunStop()` boundary enough to support fast migration toward the later Gate Policy Engine without prematurely implementing delegation?
- Are the testing and acceptance criteria sufficient?
- Are any deferred MVP minor issues required before this wave can proceed?

If approved, hand back for implementation-plan creation. Do not implement the command in the review session unless the user explicitly redirects.

## What Was Done

MVP prior state:

- Implementation review iteration 2 approved the MVP with minor comments.
- User verification results were produced at `.agent/artifacts/user_verification_results.md`.
- Functional user-verification items 1-3 passed:
  - `agent-flow init`, `status`, and `config validate`
  - one assisted `agent-flow next`
  - protected-path guardrail blocking in a Git workspace
- IR-M6 symlink tests remain platform-skipped on this Windows environment.
- The project was initialized as a Git repository and pushed to GitHub:
  - `https://github.com/Ruin0001/Agent-Workflow-Orchestrator`

Next-wave design work:

- User requested "다음 wave 착수".
- Handoff indicated the next planned wave is `run-until-user-gate`; Gate Delegation remains future-wave only.
- Codex used the brainstorming flow and asked the user to choose the stop behavior.
- User selected:
  - stop at every `user` actor phase
  - do not implement selective gate continuation in this wave
  - keep design ready for near-term migration to the Gate Policy Engine
- Codex proposed three approaches:
  - Loop Wrapper
  - Shared Executor
  - Gate Policy Engine first
- User approved Loop Wrapper with future migration awareness.
- Codex wrote and self-reviewed `.agent/artifacts/run_until_user_gate_design.md`.
- The design was committed and pushed:
  - `1103876 Add run-until-user-gate design`

## Artifacts Created or Updated

- Created `.agent/artifacts/run_until_user_gate_design.md`
- Created `.agent/artifacts/user_verification_results.md`
- Updated `.agent/handoff.md`

## Files Changed Since Previous Pushed MVP Snapshot

- `.agent/artifacts/run_until_user_gate_design.md`
- `.agent/artifacts/user_verification_results.md`
- `.agent/handoff.md`

## Commands / Checks Run

For the `run-until-user-gate` design handoff:

- Read `.agent/handoff.md`
- Read `.agent/artifacts/implementation_review_2.md`
- Read `.agent/artifacts/user_verification_results.md`
- Read `.agent/proposals/2026-06-14-gate-delegation-design.md` by targeted search for sequencing/context
- Read current CLI/command/workflow source by targeted search
- Self-reviewed `.agent/artifacts/run_until_user_gate_design.md` for placeholders, ambiguity, scope creep, and contradictions
- Committed and pushed the design artifact

No implementation code has been changed for this wave yet.

## Design Summary For Review

Command to add:

- `agent-flow run-until-user-gate`

Core behavior:

- Repeatedly call existing `nextCommand()`.
- Re-read canonical state after every step.
- Stop successfully when `state.currentActor === "user"`.
- Stop successfully when `state.status === "done"` or `state.currentActor === "none"`.
- Stop immediately on the first `nextCommand()` error.
- Stop fail-closed on internal step-limit exhaustion.

Architecture:

- Add `src/commands/run-until-user-gate.ts`.
- Add `src/workflow/run-stop.ts`.
- Update CLI parser/dispatch/help.
- Do not duplicate `nextCommand()` guardrail, logging, lock, proposal, or state-transition logic.
- Do not add public config fields in this wave.
- Do not introduce persistent aggregate audit logs in this wave; each step keeps using `nextCommand()` run logs.

Future extension boundary:

- Add a small `evaluateRunStop()` function returning a decision object.
- Current policy is only `stop on any user actor` / `stop on done` / `continue otherwise`.
- Future Gate Policy Engine can extend this with delegated gates, hard floors, review verdict evidence, and richer stop reasons.

## Known Risks / Residuals

- IR-M6 symlink guardrail tests are still unverified on this Windows environment.
- `blockedCommands` enforcement remains scoped to the configured command the orchestrator spawns, not subprocesses inside a real agent.
- Agent `env` remains deferred; do not add it in this wave unless the user explicitly changes scope.
- Deferred MVP minors remain available as future cleanup, but the user selected `run-until-user-gate` only for this wave.

## Open Questions For Claude Review

- Is the fixed internal step limit acceptable without a public config field for this wave?
- Should the step-limit value be specified exactly in the implementation plan, or left as a named constant with tests?
- Is per-step locking via existing `nextCommand()` sufficient, or is any additional coordination needed without conflicting with the existing lock?
- Should the command return the original `nextCommand()` error code unchanged, or wrap it with a run summary while preserving the original code in details?

## User Decisions Already Made

- Proceed with `run-until-user-gate` only.
- Use the Loop Wrapper approach.
- Stop at every `user` actor phase.
- Consider future Gate Policy Engine migration, but do not implement it in this wave.

## Next Required Action

Claude Code should review `.agent/artifacts/run_until_user_gate_design.md` and produce a review artifact, suggested path:

- `.agent/artifacts/run_until_user_gate_design_review.md`

If approved, hand back for implementation plan creation. If revisions are needed, list blocking/major/minor issues and update this handoff for Codex.

---

# Queued Future-Wave Handoff: Gate Delegation Design (NOT part of the current wave)

The approved design for a future `agent-flow` feature — gate delegation (per-project autonomy profile) — remains queued. It must NOT be implemented in the `run-until-user-gate` wave.

- Design document: `.agent/proposals/2026-06-14-gate-delegation-design.md`
- Summary: per-project opt-in (default OFF) to auto-pass selected user gates (`user_plan_approval`, `user_verification`, review-iteration convergence) at a STRICT bar (review verdict `Approved` with 0 Blocking / 0 Major), while a compiled-in hard floor and `user_spec_review` always stop for the user.
- Sequencing: MVP → `run-until-user-gate` wave → machine-readable `review_verdict.json` if needed → gate-delegation wave.
- The `run-until-user-gate` design intentionally keeps a stop-decision boundary so this later policy engine can be added without rewriting the command loop.
