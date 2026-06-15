# Spec Review Response

## Item 1

- Decision: Accepted
- Restated Requirement: JSON-first config was written as if already confirmed, but it is still a recommended direction that must be ratified at the user spec review gate.
- Verified Against Artifact: `.agent/artifacts/spec.md` presented JSON-first as a firm configuration requirement while also listing it under User Decisions Required.
- Rationale: The design brief originally referenced YAML, and JSON-first originated as a review recommendation. The recommendation is technically sound for the dependency policy, but it must remain provisional until the user confirms it.
- Spec Change: Revised Configuration, Security, Open Questions, and User Decisions sections to mark JSON-first / JSON-only as the recommended v1 direction pending `user_spec_review`. The user gate now explicitly blocks `plan_creation` until JSON-first / JSON-only and Git-required-for-full-guardrails are decided.
- Remaining Risk: If the user chooses YAML-first, the Spec's dependency and config sections will need another focused revision before planning.

## Item 2

- Decision: Accepted
- Restated Requirement: The product's automation modes must be distinct from this project's current manual handoff process.
- Verified Against Artifact: `.agent/artifacts/spec.md` used manual mode both for current design coordination and product behavior around `init` / `status`.
- Rationale: A future end user of `agent-flow` is not participating in this project's manual design handoff. Product behavior should be described only in product concepts such as config state, workflow state, advisory mode, assisted mode, and run-until-user-gate mode.
- Spec Change: Revised Background, Goals, and Functional Behavior sections. Product modes now use Advisory / Assisted / Run-Until-User-Gate vocabulary. Current manual handoff is documented only as a process note for this project.
- Remaining Risk: None at the Spec level.

## Item 3

- Decision: Accepted
- Restated Requirement: `agent-flow init` must define exactly which files it creates and whether canonical state is initialized.
- Verified Against Artifact: The Spec previously said `init` initialized canonical state only when operating beyond manual design mode, but did not define how that mode was selected.
- Rationale: For product use, `init` should have deterministic behavior. The most conservative default is to scaffold canonical workflow state immediately, while still avoiding overwrites.
- Spec Change: Revised `agent-flow init` behavior to create `.agent-flow.json`, `.agent/workflow_state.json`, `.agent/handoff.md`, `.agent/logs/agent_log.md`, `.agent/logs/runs.jsonl`, `.agent/artifacts/`, `.agent/prompts/`, and `.agent/logs/` by default when absent. Existing files are never overwritten without explicit confirmation.
- Remaining Risk: The exact initial state schema will still be detailed in the Proposed Architecture and MVP Plan.

## Item 4

- Decision: Accepted
- Restated Requirement: Diff and allowed-change guardrails need a trustworthy baseline before agent invocation.
- Verified Against Artifact: The Spec listed pre-existing Git changes as an edge case but did not define behavior.
- Rationale: If the working tree is already dirty, post-agent diff cannot reliably attribute changes to the agent. Requiring a clean tree for diff-checked phases is the safest v1 policy and avoids snapshot complexity in the first implementation wave.
- Spec Change: Revised Diff Requirements and Error Handling Policy to require a clean Git working tree before diff-checked agent phases by default. Dirty tree blocks the phase unless the user explicitly accepts a configured snapshot-baseline mode in a later version.
- Remaining Risk: Users with intentional uncommitted work must commit, stash, or defer orchestration before diff-checked phases.

## Item 5

- Decision: Accepted
- Restated Requirement: Prompt persistence, reset-lock scope, overly prescriptive implementation details, and config precedence should be clarified.
- Verified Against Artifact: The Spec had a prompt persistence contradiction, listed `reset-lock` without distinguishing lock types, included exact test commands in the Spec, and did not define precedence when JSON and YAML config both exist.
- Rationale: These are light clarifications that reduce planning ambiguity.
- Spec Change: Revised prompt behavior so persisted prompt files are conditional and redacted. Added reset-lock scope language. Softened exact test commands into a strategy. Defined provisional v1 config precedence: `.agent-flow.json` wins and `.agent-flow.yaml` is ignored with a warning if YAML support exists.
- Remaining Risk: If prompt persistence becomes default later, the security section must be revisited.

## Item 6

- Decision: Accepted
- Restated Requirement: Add unreadable config and proposal/artifact mismatch behavior.
- Verified Against Artifact: The Spec covered missing and invalid config, but not unreadable config or valid proposals claiming missing/empty artifacts.
- Rationale: Both are practical failure modes that affect safe state transitions.
- Spec Change: Added unreadable config and proposal-vs-artifact cross-checks to Error Handling Policy, Edge Cases, and Testing Strategy.
- Remaining Risk: None at the Spec level.
