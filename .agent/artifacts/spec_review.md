# Spec Review Report

Reviewer: Claude Code (review session)
Artifact under review: `.agent/artifacts/spec.md`
Review basis: design brief (`Agent Workflow Orchestrator Desig.txt`), `AI_Agent_workflow.txt` §8-9, `Agent Handoff Automation Protocol.txt`, plus `requirement_understanding.md` and its review/response.
Mode: manual handoff

## Summary

The Spec is high quality and materially stronger than the Requirement Understanding. Format compliance with `AI_Agent_workflow.txt` §8 is complete (all 15 sections present). I verified each Requirement Understanding review item against `spec.md` directly: M1-M4 and all Minor items are genuinely incorporated, not just claimed — the review response is truthful.

There are no blocking issues. I am raising 4 Major items and 4 Minor items. Two Major items (SR-3, SR-4) are real behavior gaps the Plan will depend on; two (SR-1, SR-2) are about not asserting unconfirmed decisions as settled requirements. Because the Protocol says Major issues should usually be resolved before proceeding, the status is **Needs revision** — but the revision is light, and most items resolve with a paragraph each or by routing to the `user_spec_review` gate.

## Requirement Compliance

- `AI_Agent_workflow.txt` §8 Spec format: all 15 sections present and ordered. PASS
- Verified incorporation of prior review (checked against `spec.md`):
  - M1 Product-form B vs State-ownership Option B — L11. PASS
  - M2 dependency taxonomy + JSON-first — L153-162, L188-213. PASS
  - M3 secret handling as explicit requirement + transcript default off — L346-374. PASS
  - M4 manual-mode note — L13. PASS
  - Minors (TS test path, internal parser, Windows/symlink/concurrency/partial-write/blocked-command variants) — L237, L395-403, L618, L668-675. PASS
- Brief §9 user gates: all present, plus credential/external-service access — L128-141. PASS
- State-ownership model: orchestrator-only canonical writes; agent output untrusted — L111-124, L590-594. PASS

## Blocking Issues

None.

## Major Issues

### SR-1 — JSON-first is asserted as a settled requirement while still an unconfirmed user decision

- Finding: The Spec states JSON-first as firm requirements ("The config system should be JSON-first", "preferred default config file should be `.agent-flow.json`", and the entire Security rationale rests on it), yet also lists it under User Decisions Required ("Confirm whether v1 should be JSON-first"). JSON-first originated as a *reviewer recommendation* (my M2), which is not a user decision. The brief, the §12 example config, and the original requirement all centered on YAML.
- Evidence: L153-162, L578-580 vs L697.
- Why it matters: A large fraction of the Spec (config section, dependency policy, security argument) unwinds if the user chooses YAML. A reviewer suggestion should not be promoted to a "must" requirement without passing the `user_spec_review` gate.
- Required Change: Mark the JSON-first config requirements as provisional/recommended pending user confirmation, and make the `user_spec_review` gate explicitly responsible for ratifying (a) JSON-first/JSON-only and (b) Git-required-for-full-guardrails before `plan_creation`. Keep the recommendation and rationale — just don't present it as already decided.
- Acceptance Criteria: The config requirements are clearly conditioned on the pending decision, and the user gate explicitly lists these decisions as blocking for Plan.
- User Decision Required: Yes (this is the point — route it to the gate).

### SR-2 — "Manual mode" conflates the meta-project design phase with the product's automation modes

- Finding: The product has automation modes Advisory / Assisted / Run-Until-User-Gate (brief §10). Separately, building *this* orchestrator is currently in a "manual handoff design phase." The Spec uses "manual mode" for both, and lets the meta-process concept leak into product command behavior.
- Evidence: L13 (design-phase manual mode) vs L452 init "initialize canonical state when operating beyond manual design mode" and L459 status "report manual mode if canonical state is absent." A real end user running `agent-flow` is not in the orchestrator's "design phase."
- Required Change: Separate the two vocabularies. Define product behavior (init/status) only in terms of product concepts (config present/absent, automation mode, canonical state present/absent). Keep the meta-project's manual-handoff phase as a process note (L13) that does not define `init`/`status` semantics.
- Acceptance Criteria: `init` and `status` behavior is described without reference to the orchestrator's own development phase.
- User Decision Required: No.

### SR-3 — `init` canonical-state initialization is underspecified (mode chicken-and-egg)

- Finding: `init` "initialize[s] canonical state when operating beyond manual design mode" (L452), but the automation mode lives in `.agent-flow.json`, which `init` itself creates. How does `init` decide whether to write `workflow_state.json`? No flag, prompt, or default is defined.
- Evidence: L446-453, interacts with L267 mode config and SR-2.
- Required Change: Define `init` behavior concretely — e.g., `init` always scaffolds config + directories, and either always initializes canonical state for product use, or gates it behind an explicit flag (`--manual` / `--mode`) with a stated default. Resolve against SR-2.
- Acceptance Criteria: Given a fresh repo, the exact set of files `init` creates (and when canonical state is among them) is unambiguous.
- User Decision Required: Possibly (default mode choice).

### SR-4 — Pre-existing dirty working tree has no defined behavior, but diff/manifest guardrails depend on a clean baseline

- Finding: The allowed-change-manifest and diff-size guardrails compare git diff after an implementation phase. If the working tree already has uncommitted changes before agent invocation, the post-run diff cannot be attributed to the agent, and unauthorized-change detection becomes unsound. The Spec lists "Git reports changed files before agent invocation" as an edge case (L556) but the Error Handling Policy defines no behavior for it.
- Evidence: L298-318, L405-416, L556 (listed, not handled).
- Required Change: Define a baseline policy for implementation/diff-checked phases — e.g., require a clean tree (or a committed/snapshot baseline) before `next` runs an agent in those phases, or capture a snapshot baseline at phase start and diff against it rather than against HEAD. State what happens when the tree is already dirty.
- Acceptance Criteria: Diff guardrail soundness is preserved regardless of pre-existing working-tree state, with explicit behavior documented.
- User Decision Required: No.

## Minor Issues

- m1: Prompt persistence contradiction — `next` "assemble and persist the prompt" (L430) vs Open Question "Should generated prompt files be persisted by default?" (L683). Reconcile: either persistence is conditional (debug mode) or always-on; the two statements currently conflict. Also note persisted prompts may carry project secrets, so tie to the redaction requirement.
- m2: `agent-flow reset-lock` (L235) should specify which lock it clears now that there are two (workflow actor lock + OS-level CLI lock, L399). Stale-OS-lock detection is deferred to an Open Question (L689) — acceptable, but `reset-lock` scope should be stated.
- m3: A few requirements drift to implementation detail (exact `npm run build` / `node --test` commands L668-675, atomic-rename/temp-file mechanics L401, "streaming redaction in future versions" L608). Per `AI_Agent_workflow.txt` §8 the Spec should avoid being an implementation checklist — consider moving the most prescriptive bits to the Plan. Low priority.
- m4: Config precedence is undefined — "Both `.agent-flow.json` and `.agent-flow.yaml` exist" is listed as an edge case (L516) but the Error Handling Policy doesn't state which wins. Define precedence (recommend JSON wins / YAML ignored-with-warning in v1).

## Edge Case Coverage

Now very thorough (L512-572). Suggested additions:
- Config file present but unreadable (permissions / locked file).
- Config precedence when both formats exist (see m4) — listed but unhandled.
- `next_state_proposal.json` proposes a valid transition but the artifact it claims to have produced is missing or empty (cross-check proposal against actual artifacts, not just presence).

## Security / Privacy Concerns

Strong framing — "agent output is untrusted," "user gates are security boundaries," redaction fail-safe (L510). Open items: SR-4 is partly a soundness/security issue (unattributable diffs weaken unauthorized-change detection); m1 (persisted prompts carrying secrets). Pattern-based redaction is acknowledged as best-effort with transcript default off — acceptable for v1.

## Testability

Strong. The compile-then-`node --test` path is pinned (L618, L668-675), avoiding runtime TS loaders, and a fake-agent integration path is specified (L662). Unit/integration coverage lists are comprehensive.

## Questions

1. For SR-1, do you want JSON-only in v1 (YAML fully deferred), or JSON-first with YAML as a later optional adapter? (This is the key `user_spec_review` decision.)
2. For SR-4, preference between "require clean tree before implementation phases" vs "orchestrator captures a snapshot baseline at phase start"?
3. For SR-3, should `init` default to product mode (canonical state created) with an opt-out flag, or manual mode by default?

## Recommendations

1. Apply SR-2, SR-3, SR-4, and the Minor items as a light Spec revision (each is roughly a paragraph). Route SR-1 explicitly to the `user_spec_review` gate.
2. Do not expand scope — these are clarifications and gap-fills, not new features.
3. After the spec_review_response, the next user gate (`user_spec_review`) should ratify JSON-first and Git-required before `plan_creation` begins.

## Approval Status

Needs revision.

The Spec is close and the revision is light. No blocking issues; the four Major items are clarifications and two genuine behavior gaps (init state-init, dirty-tree baseline) that the Plan will depend on. Resolve them in a `spec_review_response` (and a touched-up Spec), then proceed to `user_spec_review`.
