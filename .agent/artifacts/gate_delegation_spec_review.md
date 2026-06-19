# Gate Delegation — Spec Review

Reviewer: Claude Code (review session)
Artifact: `.agent/artifacts/gate_delegation_spec.md`
Basis: approved design, the RU + RU review, `AI_Agent_workflow.txt` §8-9, and current source (`run-stop.ts`, `next.ts`, `workflow/actors.ts`, `workflow/transitions.ts`, `workflow/gates.ts`, `config/*`, `artifacts/paths.ts`).
Mode: manual handoff.

## Summary

A strong, faithful Spec. It follows the §8 format, resolves every RU-review finding (GD-M1..M3, GD-m1..m3), and has solid scenarios, edge cases, and security framing. It correctly defers `user_verification` (GD-M1), forbids bypassing the iteration limit (GD-M2), makes runId binding + verdict→gate mapping core (GD-M3), and states the trusted-verdict boundary (GD-m1).

However, reviewing the verdict→gate mechanism against the actual run-until architecture surfaces three Major coherence gaps — most importantly that "review_iteration"/review-loop convergence is effectively a no-op in v1 (review loops already run autonomously), which means v1 should delegate `user_plan_approval` only. These should be resolved in a spec_review_response before the `user_spec_review` gate, so the user ratifies a coherent v1. Status: **Needs revision** (tightening, not redesign).

## Requirement Compliance

- §8 Spec format: all sections present. PASS
- RU-review findings incorporated: GD-M1 (defer user_verification), GD-M2 (convergence ≠ iteration-limit bypass), GD-M3 (runId + mapping), GD-m1 (trust boundary), GD-m2 (narrow v1), GD-m3 (config-immutability timing). PASS
- Faithful to the approved design (default OFF, double opt-in, compiled-in hard floor, strict bar, verdict-not-Markdown, audit+digest). PASS
- Code-reality: review phases that can emit verdicts (spec/plan/implementation_review) and the `user_plan_approval → task_classification` transition are valid in `transitions.ts`. PASS

## Blocking Issues

None.

## Major Issues

### GD-S1 — "review_iteration" / review-loop convergence is redundant in the run-until model; v1 should delegate `user_plan_approval` only

- Finding: In `run-until-user-gate`, review phases have an agent actor (`review`), so `evaluateRunStop()` already returns "continue" and the loop runs them autonomously. Review loops (`spec_review ↔ spec_review_response`, `implementation_review ↔ implementation_review_response`) converge or advance to the next phase WITHOUT ever producing a user stop. The only review-related user stop is the iteration limit, which GD-M2 forbids delegating. So "review-loop convergence" as a delegable item clears no user stop — it is a no-op, or (if it did something) it would be the forbidden iteration-limit bypass.
- Evidence: `run-stop.ts` stops only on done/active-gate/`currentActor==="user"`; review phases are `review` actors (`actors.ts`); the only terminal review stop is `user_spec_review` (kept) or `ITERATION_LIMIT_EXCEEDED` (must stay fail-closed).
- Required Change: Drop `review_iteration` from the v1 delegable set. v1 delegates ONLY `user_plan_approval`. Consequently, only `plan_review` needs to emit a verdict in v1; `spec_review`/`implementation_review` verdict emission can be deferred. Update the config example/default `delegatedGates` to `["user_plan_approval"]`, the Gate Tiers section, and the mapping section accordingly.
- Result: a crisp, minimal, safe v1 — one delegated gate, one verdict type.

### GD-S2 — The mechanism to advance PAST an auto-cleared user gate is unspecified and conflicts with "use nextCommand()"

- Finding: `nextCommand()` cannot execute a user-owned phase (it rejects with `NO_AGENT_FOR_PHASE`). So auto-clearing `user_plan_approval` cannot go through `nextCommand()`. It requires the orchestrator to perform the `user_plan_approval → task_classification` transition directly (the automated equivalent of the planned `approve plan` command). But Req 23 says existing `nextCommand()` behavior "must not be bypassed," creating an internal contradiction.
- Required Change: Specify that an auto-clear is a distinct, orchestrator-performed user-gate transition that REUSES the transition validator + lock + run-log/audit, but is NOT an agent step and therefore does not call `nextCommand()`. Clarify Req 23 to mean "agent steps go through `nextCommand()`; the gate-clear is a validated non-agent transition." Define which validated transition each delegable gate uses (`user_plan_approval → task_classification`).
- Acceptance: The Spec unambiguously states how the loop moves past an auto-cleared gate, with the same validation/lock/audit guarantees.

### GD-S3 — Verdict freshness ("runId matching the current run") is underspecified for verdicts consumed at a later loop step than the one that produced them

- Finding: `nextCommand()` generates a fresh `runId` per step internally and returns only a `Result<string>`; it does not expose the step's runId. The `plan_review` verdict carries the runId of the plan_review STEP, but the auto-clear happens in a LATER loop iteration (at `user_plan_approval`). The run-until loop currently has no way to know the plan_review step's runId, so "verdict runId matches the current run" is ambiguous (run-until invocation vs the producing step) and not implementable as written.
- Required Change: Define the freshness model concretely. Options: (a) `nextCommand()` returns the step runId so the loop can record the last review step's runId and require the verdict to match it; or (b) the loop clears stale verdict files at start (like `nextCommand` clears stale proposals) and requires the verdict to be from a step taken during this run-until invocation. Pick one so "current-run binding" is precise and implementable.
- Acceptance: A stale verdict from a prior run-until invocation cannot authorize an auto-clear, by a defined mechanism.

## Minor Issues

- GD-s1: The config example and default `delegatedGates` list `"review_iteration"` (lines ~216, ~226). Per GD-S1, change to `["user_plan_approval"]`.
- GD-s2: Since v1 needs only the `plan_review` verdict (per GD-S1), state that `spec_review`/`implementation_review` verdict emission is deferred — reduces prompt-template and validation scope for v1.
- GD-s3: Digest-write-failure open question — the Spec's lean (fatal before claiming completion) is correct; recommend stating it as the v1 decision rather than leaving fully open, since a silent audit gap on a safety feature is worse than a failed run.

## Edge Case Coverage

Thorough (missing/invalid/stale/phase-mismatch/below-bar verdicts; minor-comments stops; iteration limit; hard floor; config-immutability; Windows/non-Git). The "strict approved JSON while Markdown says Needs revision" edge case is correctly resolved by the trusted-verdict boundary (GD-m1). After GD-S1, drop the review-convergence edge cases that no longer apply.

## Security / Privacy

Strong: default OFF, double opt-in, compiled-in hard floor, config immutability, trusted-verdict boundary explicitly accepted. GD-S1 actually improves the security posture by shrinking the delegated surface to one gate. GD-S3 matters here too — a defined freshness model prevents stale/replayed verdicts.

## Testability

Good test list. After GD-S1/S2/S3, add/adjust: an explicit test that an auto-cleared `user_plan_approval` performs the validated transition with an audit record (GD-S2), and a stale-verdict-from-prior-run test (GD-S3). Drop review_iteration tests.

## Questions / Guidance for user_spec_review

The Spec's recommendations (defer user_verification, phase-specific paths, runId required, minor-comments stops, policy-advancement+audit not fake gates, append+latest digest, both immutability mechanisms) are sound. Add the GD-S1 recommendation: v1 delegable set = `user_plan_approval` only.

## Approval Status

Needs revision.

Resolve GD-S1 (v1 = `user_plan_approval` only; drop redundant review_iteration), GD-S2 (specify the non-agent validated transition for auto-clear; reconcile Req 23), and GD-S3 (define verdict freshness) in a spec_review_response and Spec update. These tighten the core mechanism without redesign. Then route the (now-coherent) v1 to the `user_spec_review` gate.
