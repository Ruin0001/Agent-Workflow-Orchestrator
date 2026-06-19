# Gate Delegation Spec Review Response

## Item 1: GD-S1

- Decision: Accepted
- Restated Requirement: Remove `review_iteration` / review-loop convergence from the v1 delegable set because current review phases already run as agent-owned phases in `run-until-user-gate`; they do not create a user gate to auto-clear.
- Verified Against Artifact: `gate_delegation_spec.md` listed review-loop convergence in goals, gate tiers, config defaults, verdict mapping, scenarios, and tests.
- Verified Against Codebase: `evaluateRunStop()` stops only on `done`, active gates, and `currentActor === "user"`. Review phases are agent-owned and therefore already continue through `runUntilUserGateCommand()`. Iteration-limit exhaustion is handled by `evaluateNextGates()` and must remain fail-closed.
- Rationale: Keeping `review_iteration` in v1 creates a false feature surface. It either does nothing or risks being misread as an iteration-limit bypass.
- Spec Change: Tightened v1 to delegate only `user_plan_approval`; deferred `spec_review` and `implementation_review` verdict emission; removed review-loop convergence from config defaults, gate tiers, mapping, scenarios, and tests.
- Remaining Risk: Future versions may add other delegation surfaces, but they need a concrete user gate or explicit non-agent transition.

## Item 2: GD-S2

- Decision: Accepted
- Restated Requirement: Define how a delegated run advances past `user_plan_approval`, since `nextCommand()` cannot execute user-owned phases.
- Verified Against Artifact: The previous Spec said agent steps must use `nextCommand()` but did not distinguish a non-agent gate-clear transition from an agent step.
- Verified Against Codebase: `nextCommand()` rejects phases handled by `user` with `NO_AGENT_FOR_PHASE`; `user_plan_approval -> task_classification` is a valid workflow transition.
- Rationale: Auto-clear must be an orchestrator action, not an agent action. It should reuse state validation, transition validation, locking, and audit logging, but it cannot call `nextCommand()` for a user phase.
- Spec Change: Added a dedicated "Auto-Clear Transition" section. Clarified that agent steps still go through `nextCommand()`, while auto-clearing `user_plan_approval` is a validated non-agent transition from `user_plan_approval` to `task_classification`.
- Remaining Risk: The implementation plan must define the exact helper/module for this non-agent transition so it does not duplicate fragile state-write logic.

## Item 3: GD-S3

- Decision: Accepted
- Restated Requirement: Define verdict freshness precisely enough to prevent stale verdict replay.
- Verified Against Artifact: The previous Spec required a matching `runId` but did not define how the run-until loop learns the producing `plan_review` step runId.
- Verified Against Codebase: `nextCommand()` currently generates a per-step `runId` internally and returns only a string summary, so the delegated loop cannot validate the verdict against the producing step without an added structured result or equivalent metadata.
- Rationale: Stale verdict replay is a core safety issue. The orchestrator needs a concrete binding between the verdict and the plan-review step that produced it.
- Spec Change: Added a freshness model requiring agent-step metadata to expose the step `runId`; the delegated loop records the most recent successful `plan_review` step runId during the same invocation and accepts only a verdict with that runId. Stale verdict files are also cleared at delegated-run start as defense-in-depth, not as the sole freshness mechanism.
- Remaining Risk: The implementation plan must decide whether this is exposed by widening `nextCommand()`'s return type, adding an internal helper, or returning structured run metadata from the lower-level agent-step path.

## Item 4: GD-s1

- Decision: Accepted
- Restated Requirement: Change config examples/defaults from `["user_plan_approval", "review_iteration"]` to `["user_plan_approval"]`.
- Verified Against Artifact: The previous Spec had `review_iteration` in config examples and defaults.
- Rationale: This aligns config with the tightened v1 scope.
- Spec Change: Updated config example and defaults.
- Remaining Risk: None for Spec.

## Item 5: GD-s2

- Decision: Accepted
- Restated Requirement: Defer `spec_review` and `implementation_review` verdict emission in v1.
- Verified Against Artifact: The previous Spec listed phase-specific verdicts for all review phases.
- Rationale: If v1 delegates only `user_plan_approval`, only `plan_review` verdict emission is needed.
- Spec Change: The Spec now makes `plan_review_verdict.json` the v1 verdict artifact and explicitly defers other review verdicts.
- Remaining Risk: Future expansion should revisit verdict emission for other review phases only when there is a concrete gate to authorize.

## Item 6: GD-s3

- Decision: Accepted
- Restated Requirement: Make digest-write failure fatal before delegated completion rather than leaving it as an open question.
- Verified Against Artifact: The previous Spec had a recommendation but still listed this as an open question.
- Rationale: Delegation is a safety-sensitive feature. Claiming an auto-pass without durable audit/digest evidence would weaken oversight.
- Spec Change: The Spec now states digest write failure is fatal before completing a delegated auto-clear/run.
- Remaining Risk: If implementation later discovers state has already advanced before digest failure, the Plan must sequence audit/digest writes before committing the auto-clear transition or explicitly handle rollback/fail-safe reporting.
