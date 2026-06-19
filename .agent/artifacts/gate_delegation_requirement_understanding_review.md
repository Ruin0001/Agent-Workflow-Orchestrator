# Gate Delegation — Requirement Understanding Review

Reviewer: Claude Code (review session)
Artifact: `.agent/artifacts/gate_delegation_requirement_understanding.md`
Basis: `.agent/proposals/2026-06-14-gate-delegation-design.md` (approved design), `AI_Agent_workflow.txt` §7, and current source (`run-stop.ts`, `next.ts`, `config/*`, `workflow/gates.ts`, `artifacts/paths.ts`, `logging/run-log.ts`).
Mode: manual handoff.

## Summary

A strong, faithful, well-structured Requirement Understanding. It follows the §7 format, stays true to the approved design (default OFF, double opt-in, three-tier gates, compiled-in hard floor, strict bar, machine-readable verdict, anti-escalation, audit+digest), and its Confirmed Facts about the codebase are accurate (verified against source). It surfaces most genuine unknowns as open questions and routes user decisions to `user_spec_review`.

Three Major items concern the coherence of the verdict→gate model — most importantly that `user_verification` has no upstream review verdict to evaluate. These must be resolved in the Spec (not an RU rewrite). Status: **Approved with minor comments**, with GD-M1..M3 as mandatory Spec content.

## Compliance

- §7 Requirement Understanding format: all sections present and ordered. PASS
- Faithful to the approved design on every decided point (tiers, strict bar, double opt-in, default OFF, anti-escalation, verdict-not-Markdown, digest). PASS
- Code-reality Confirmed Facts verified accurate: `evaluateRunStop()` boundary, `nextCommand()` ownership, `evaluateNextGates()` iteration-limit blocking, no `delegation` block in config, `runs.jsonl` logging, no `review_verdict` artifact. PASS
- No implementation started. PASS

## Blocking Issues

None.

## Major Issues

### GD-M1 — `user_verification` has no upstream review verdict; the strict-verdict model doesn't map to it

- Finding: The strict bar evaluates a review agent's `Approved` verdict. `user_plan_approval` is naturally authorized by a `plan_review` verdict. But `user_verification` follows `testing` (testing → user_verification → final_handoff); there is NO review phase between them that emits a verdict. So "auto-clear `user_verification` at a strict review verdict" has no verdict source. The RU lists `user_verification` as delegable without defining what evidence clears it.
- Why it matters: Without a defined evidence source, `user_verification` delegation is undefined or would fall back to something weaker than the strict-verdict model the whole feature is built on.
- Required Change (Spec): Either (a) define `user_verification`'s evidence explicitly (e.g., a machine-readable `test_results` "all checks ran and passed, 0 failures" verdict from the `testing` phase), or (b) DEFER `user_verification` from v1 and delegate only gates that have a clear review verdict. Recommendation: defer `user_verification` for v1 (see GD-m2) to keep the model coherent.

### GD-M2 — "review-iteration convergence" semantics are ambiguous and risk weakening the iteration-limit guardrail

- Finding: "Review-iteration convergence" is listed as a delegable item alongside the user gates, but it is a loop behavior, not a user gate — and in the current MVP, review loops already run autonomously (they don't stop for the user; they error fail-closed at the iteration limit). More concerning, Security requirement line 150 ("exceeded iteration limit unless explicitly handled by valid review-convergence delegation") can be read as letting delegation BYPASS the iteration limit, which would weaken a safety guardrail the design says never to weaken.
- Required Change (Spec): Define precisely what convergence delegation does — it should mean "auto-accept an `Approved` verdict to proceed without a user stop," and it must NOT bypass the iteration limit when review fails to converge. Iteration-limit exhaustion must remain a fail-closed stop for the user. Rewrite the line-150 clause to remove the bypass reading.

### GD-M3 — The verdict→gate authorization mapping (with runId binding) is the central mechanic but is left mostly as open questions

- Finding: How a specific review verdict authorizes a specific user gate — and how staleness/forgery is prevented — is the core of this feature, but it sits in Open Questions (#1 storage, #2 runId, #4 convergence mapping) and an edge case ("verdict phase does not match"). 
- Required Change (Spec): Make the mapping an explicit core requirement: e.g., `user_plan_approval` auto-clears only against the latest `plan_review` verdict produced in the current run, bound by `runId` (matching the existing `next_state_proposal.json` runId pattern). Elevate runId binding from open question to a requirement given the security stakes; leave only the storage-path shape (one canonical name vs phase-specific) as the genuinely open decision for `user_spec_review`.

## Minor Issues

- GD-m1 (trust boundary — state it explicitly): The orchestrator trusts the review agent's machine-readable verdict and deliberately does not cross-check the Markdown report. A review agent emitting a false `Approved`/0/0 verdict would auto-pass. This is inherent to "delegate to agent consensus," but it should be an explicit accepted assumption/risk so the trust decision is conscious — and it reinforces keeping the strict bar exact and `user_spec_review` always-kept.
- GD-m2 (v1 scope recommendation): Given the safety stakes and the GD-M1 gap, recommend a narrower v1 slice — delegate `user_plan_approval` (and well-defined review-loop convergence) only, deferring `user_verification`. The RU already routes "bundle all vs narrower slice" to `user_spec_review` (good); the Spec should present this recommendation there.
- GD-m3 (config-immutability timing — document it): Config is loaded once at the start of a delegated run, so a mid-run agent edit to `.agent-flow.json` does not affect the in-flight run and is caught by the post-run protected-path guardrail. This is adequate; state it so the immutability requirement isn't over-engineered. Open Question #8 (default protected path vs separate rule) can then be a small choice rather than a deep one.

## Edge Case Coverage

Thorough. One to fold in via GD-m1: verdict says `Approved/0/0` while the Markdown report contradicts it — by design the JSON verdict wins (trusted). Otherwise the missing/invalid/stale/below-bar/timeout/guardrail edge cases are well covered.

## Guidance on the RU's Open Questions (for the Spec / user_spec_review)

- Verdict storage (#1): phase-specific verdict paths are safer against cross-phase reuse; combine with runId binding.
- runId in verdict (#2): yes — make it a requirement (GD-M3), not an option.
- `Approved with minor comments` (#3): always stop (below strict bar), with a tailored message. This matches the ratified strict bar.
- Convergence mapping (#4): resolve per GD-M2.
- Cleared-gate representation (#5): prefer policy-controlled advancement with an explicit audit record over persisting fake "cleared" gate objects.
- Digest (#6): append history + maintain a latest pointer (both), building on the IR-M3 run-log fields.

## Approval Status

Approved with minor comments.

Proceed to Spec creation. GD-M1, GD-M2, GD-M3 are mandatory Spec content (especially the `user_verification` evidence gap and the convergence/iteration-limit clarification). Recommend the Spec present a narrower v1 slice (defer `user_verification`) and route scope to `user_spec_review`, which is a kept gate in this very feature.
