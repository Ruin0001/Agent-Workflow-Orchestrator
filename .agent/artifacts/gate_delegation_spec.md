# Gate Delegation Spec

## Background

`agent-flow` currently supports assisted single-step execution with `agent-flow next` and bounded multi-step execution with `agent-flow run-until-user-gate`.

The current `run-until-user-gate` behavior is conservative: it repeatedly calls `nextCommand()` and stops at any user-owned phase, active explicit gate, `done`, error, or step limit. This preserves user approval discipline but still requires manual confirmation at gates that are low-risk in some personal/internal projects.

The approved Gate Delegation design introduces a per-project opt-in mode for selected gates. The tightened v1 scope delegates only `user_plan_approval`. Other originally discussed delegation targets are deferred because they either lack a verdict source (`user_verification`) or are redundant in the current run-until architecture (`review_iteration`).

## Problem Statement

The system needs a deterministic way to auto-clear `user_plan_approval` only when the configured project, current command invocation, current gate, and latest structured `plan_review` evidence all authorize it.

The hard problem is ensuring that delegated autonomy is narrow, auditable, non-escalating, and impossible to trigger accidentally. Agent-owned workflow phases must still run through `nextCommand()`, while the user-gate auto-clear itself must be a validated orchestrator transition.

## Goals

- Add a default-off delegation policy model for `run-until-user-gate`.
- Require double opt-in: config enables delegation and the command invocation explicitly requests it.
- Preserve current `run-until-user-gate` behavior when delegation is not explicitly active.
- Define a machine-readable `plan_review` verdict artifact with path-aware validation.
- Bind the verdict to the specific `plan_review` step that produced it using `runId`.
- Auto-clear only at the strict bar: exact `Approved`, zero Blocking, zero Major.
- Delegate only `user_plan_approval` in v1.
- Keep `user_spec_review` as a mandatory user gate.
- Preserve the compiled-in hard floor as never delegable.
- Preserve all existing fail-closed stop conditions, including iteration-limit exhaustion.
- Record every auto-pass in audit data and produce an end-of-run digest.
- Keep the implementation lightweight and dependency-free at runtime.

## Non-Goals

- No delegation during this feature's own design, Spec, Plan, or review workflow.
- No delegation of `user_spec_review`.
- No delegation of `user_verification` in v1.
- No `review_iteration` delegation in v1.
- No `spec_review` or `implementation_review` verdict emission in v1.
- No configurable hard floor.
- No auto-pass for `Approved with minor comments`, `Needs revision`, or `Blocked`.
- No Markdown parsing for authorization.
- No new external schema-validation library.
- No named profiles such as `--profile vibe` in v1.
- No rollback/checkpoint system for auto-passed gates.
- No broad rewrite of `nextCommand()`.
- No changes to assisted `agent-flow next`; delegation applies only to the run-until loop.

## Requirements

### Confirmed Requirements

1. Delegation must be default OFF.
2. Delegation must be per-project.
3. Delegation must require both config opt-in and explicit command opt-in.
4. The config block must be named `delegation`.
5. The expected command opt-in flag is `agent-flow run-until-user-gate --delegated`.
6. If `--delegated` is absent, `run-until-user-gate` must stop at all user gates as it does today.
7. If `--delegated` is present while `delegation.enabled` is false, the command must fail closed with a clear error.
8. `delegation.delegatedGates` v1 must accept only `user_plan_approval`.
9. `delegation.autoPassBar` v1 must accept only `approved_no_blocking_no_major`.
10. The strict bar passes only when:
    - `status === "Approved"`
    - `blocking === 0`
    - `major === 0`
11. `Approved with minor comments` is below bar and must stop for the user.
12. Missing, invalid, stale, phase-mismatched, or below-bar verdicts must stop for the user.
13. The orchestrator must validate the plan-review verdict through internal path-aware validators.
14. The orchestrator must not parse Markdown review reports for delegation authorization.
15. The orchestrator must trust the machine-readable verdict as the review agent's declared consensus result.
16. The trust boundary must be documented: a false `Approved`/0/0 JSON verdict can auto-pass if every other policy check passes.
17. Each verdict must include a `runId` matching the `plan_review` agent step that produced it.
18. The delegated loop must know the producing `plan_review` step runId before it can auto-clear `user_plan_approval`.
19. `user_plan_approval` may auto-clear only from the latest successful `plan_review` verdict produced in the same delegated run invocation.
20. Stale verdict files must be cleared at delegated-run start as defense-in-depth.
21. Agent-owned workflow steps must continue to use `nextCommand()`.
22. Auto-clearing `user_plan_approval` is a non-agent orchestrator transition, not a `nextCommand()` step.
23. The auto-clear transition must validate `user_plan_approval -> task_classification`.
24. The auto-clear transition must use lock, state validation, transition validation, audit logging, and digest writing.
25. Iteration-limit exhaustion must remain a fail-closed user stop.
26. Existing `nextCommand()` guardrails, proposal validation, transition validation, lock handling, and run logging must not be bypassed for agent steps.
27. `.agent-flow.json` must be agent-immutable for delegation safety.
28. Config must be loaded once at the start of a delegated run; mid-run config edits must not alter the in-flight policy.
29. Mid-run `.agent-flow.json` edits by agents must be caught by post-run protected-path guardrails.
30. Every auto-pass must create an audit record.
31. A delegated run must create or append an end-of-run digest.
32. Digest write failure is fatal before claiming delegated completion.
33. `agent-flow status` should surface the latest delegation digest pointer and auto-pass count once available.

### Gate Tiers

The implementation must define gate tiers as static code constants.

Hard-floor gates are never delegable:

- destructive action approval
- always-protected path changes
- credential access
- production-data access
- external-service access approval
- approved-Plan deviation approval

Kept gates always stop for the user:

- `user_spec_review`

V1 delegable set:

- `user_plan_approval`

Deferred from v1:

- `user_verification`, because the current workflow has no review verdict between `testing` and `user_verification`
- `review_iteration`, because review phases already run autonomously in `run-until-user-gate` and iteration-limit exhaustion must remain fail-closed

### Plan Review Verdict Schema

V1 requires a machine-readable JSON verdict for `plan_review` only.

The plan-review verdict must include:

```json
{
  "runId": "uuid-from-plan-review-agent-step",
  "phase": "plan_review",
  "status": "Approved",
  "blocking": 0,
  "major": 0,
  "minor": 0,
  "iteration": 1,
  "summary": "Optional short review summary"
}
```

Validation requirements:

- root must be an object
- `runId` must be a non-empty string
- `phase` must be exactly `plan_review`
- `status` must be one of:
  - `Approved`
  - `Approved with minor comments`
  - `Needs revision`
  - `Blocked`
- `blocking`, `major`, `minor`, and `iteration` must be non-negative integers
- `summary`, if present, must be a string
- the `runId` must match the successful `plan_review` agent step from this delegated run invocation

V1 storage:

- `.agent/artifacts/plan_review_verdict.json`

Deferred storage:

- `spec_review_verdict.json`
- `implementation_review_verdict.json`

### Verdict Freshness Model

The delegated loop must prevent stale verdict replay.

Required model:

- At delegated-run start, remove stale plan-review verdict files if present.
- Each successful `nextCommand()` agent step must expose structured step metadata to the run-until loop, including the step `runId`, accepted phase, actor, and artifact paths.
- The delegated loop records the most recent successful `plan_review` step runId from the same `run-until-user-gate --delegated` invocation.
- When the loop reaches `user_plan_approval`, it reads `.agent/artifacts/plan_review_verdict.json`.
- The verdict can authorize auto-clear only when its `runId` equals the recorded `plan_review` step runId.
- A verdict from a previous invocation, previous plan-review iteration, wrong phase, or unknown runId must stop for the user.

The implementation plan may choose the exact API shape for structured step metadata, but it must not rely on parsing the human-readable `nextCommand()` success string.

### Verdict To Gate Mapping

Delegation must use explicit mapping, not generic "latest verdict wins" behavior.

V1 mapping:

- `plan_review` exact `Approved`/0/0 verdict from the recorded current invocation step authorizes auto-clearing `user_plan_approval`.
- Auto-clear performs the validated transition `user_plan_approval -> task_classification`.

Non-mapping requirements:

- `testing` does not emit a review verdict in the current workflow.
- `user_verification` is not delegable in v1.
- `spec_review` and `implementation_review` verdicts are not required in v1.
- Future versions may add more delegated gates only after defining concrete evidence sources and transitions.

### Auto-Clear Transition

Auto-clearing `user_plan_approval` is not an agent step.

When policy allows auto-clear:

1. Acquire the workflow lock or hold the run-until loop's gate-clear lock.
2. Read and validate canonical state.
3. Confirm current phase is `user_plan_approval`.
4. Confirm current actor is `user`.
5. Validate transition `user_plan_approval -> task_classification`.
6. Write an audit record containing the verdict evidence and auto-clear reason.
7. Write or append the delegation digest before claiming delegated completion.
8. Advance state to `task_classification`.
9. Continue the run-until loop, where the next agent-owned step will again use `nextCommand()`.

This reconciles the `nextCommand()` requirement:

- agent-owned phases go through `nextCommand()`
- auto-cleared user gates go through a separate validated non-agent transition
- no agent invocation, proposal validation, or guardrail path is duplicated for agent steps

## User Scenarios

### Scenario 1: Production Project

The project omits `delegation` or sets `delegation.enabled` to false. The user runs `agent-flow run-until-user-gate`. The command behaves exactly as it does today and stops at every user gate.

### Scenario 2: Config Enabled, Normal Run

The project has `delegation.enabled: true`, but the user runs `agent-flow run-until-user-gate` without `--delegated`. The command behaves exactly as it does today and stops at every user gate.

### Scenario 3: Delegated Run With Approved Plan Review

The project has delegation enabled. The user runs `agent-flow run-until-user-gate --delegated`. The review agent emits a valid same-invocation `plan_review_verdict.json` with exact `Approved`, zero Blocking, and zero Major findings. When the loop reaches `user_plan_approval`, the orchestrator records an auto-pass and performs the validated transition to `task_classification`.

### Scenario 4: Delegated Run With Minor Comments

The review agent emits `Approved with minor comments`. The command treats it as below strict bar, stops at `user_plan_approval`, and explains that only exact `Approved` with zero Blocking and zero Major findings can auto-pass.

### Scenario 5: Missing Or Stale Verdict

The command reaches `user_plan_approval`, but the verdict is missing, invalid, phase-mismatched, or has the wrong `runId`. The command stops for the user and does not auto-clear.

### Scenario 6: Kept Gate

The command reaches `user_spec_review` during a delegated run. It stops for the user. `user_spec_review` is not delegable in v1 or later unless the user explicitly changes the hard requirement.

### Scenario 7: Iteration Limit

A review loop fails to converge and reaches the configured iteration limit. The command fails closed and stops for the user. Delegation must not extend or bypass the limit.

## Functional Behavior

### Configuration

The config should support:

```json
{
  "delegation": {
    "enabled": false,
    "delegatedGates": ["user_plan_approval"],
    "autoPassBar": "approved_no_blocking_no_major",
    "digestOnStop": true
  }
}
```

Defaults:

- `enabled`: `false`
- `delegatedGates`: `["user_plan_approval"]` when delegation is enabled
- `autoPassBar`: `approved_no_blocking_no_major`
- `digestOnStop`: `true`

Validation:

- `enabled` must be boolean.
- `delegatedGates` must be a string array.
- Entries must be known v1 delegable identifiers.
- v1 accepts only `user_plan_approval`.
- Hard-floor and kept gates must be rejected.
- `review_iteration` must be rejected in v1.
- `user_verification` must be rejected in v1.
- `autoPassBar` must be exactly `approved_no_blocking_no_major`.
- `digestOnStop` must be boolean.

### Command Behavior

`run-until-user-gate` remains the base command.

When `--delegated` is absent:

- behavior is unchanged
- all user gates stop

When `--delegated` is present:

- load config once at command start
- require `delegation.enabled === true`
- clear stale `plan_review_verdict.json`
- run agent-owned steps through `nextCommand()`
- record structured metadata for each successful step
- when a stop decision reaches `user_plan_approval`, evaluate delegation policy
- require a valid mapped `plan_review` verdict with matching step `runId`
- if verdict passes strict bar, perform the validated non-agent auto-clear transition
- if verdict fails, stop
- stop normally at all other user gates

### Review Agent Output

The `plan_review` prompt must instruct the review agent to emit both:

- the existing Markdown plan review artifact
- `.agent/artifacts/plan_review_verdict.json`

The JSON artifact is authoritative for delegation decisions. The Markdown artifact remains for human-readable review.

V1 does not require verdict JSON from `spec_review` or `implementation_review`.

### Audit And Digest

Each auto-pass audit record must include:

- timestamp
- gate
- phase
- source verdict path
- verdict status
- blocking count
- major count
- minor count
- iteration
- runId
- transition
- reason for auto-pass

The end-of-run digest must include:

- run start/end timestamp
- command mode
- each auto-cleared gate
- verdict evidence for each auto-pass
- final stop reason
- digest file path

Digest retention:

- append history to `.agent/logs/delegation_digest.md`
- maintain or report a latest digest pointer for `agent-flow status`
- digest write failure is fatal before delegated completion is reported

## Error Handling Policy

- Delegation disabled with `--delegated`: fail closed with a config/policy error.
- Unknown delegated gate in config: validation error with path.
- `review_iteration` in v1 config: validation error with path.
- `user_verification` in v1 config: validation error with path.
- Hard-floor or kept gate in `delegatedGates`: validation error with path.
- Missing verdict: stop for user with a clear missing-verdict reason.
- Invalid verdict JSON: stop for user and preserve the validation error.
- Wrong verdict `runId`: stop for user as stale/mismatched verdict.
- Wrong verdict phase: stop for user as phase mismatch.
- Below-bar verdict: stop for user and show the strict-bar requirement.
- `Approved with minor comments`: stop for user and state that exact `Approved` is required.
- Iteration-limit exhaustion: fail closed and stop for user.
- Guardrail violation: preserve existing guardrail failure behavior.
- Digest write failure: fail before claiming delegated completion.
- Run-log write failure: preserve existing fail-closed logging behavior.

## Edge Cases

- Delegation config omitted.
- Delegation config malformed.
- `--delegated` appears after `--` delimiter and is treated according to parser semantics, not as a flag.
- Config enabled but delegated gate list empty.
- Config attempts to delegate `user_spec_review`.
- Config attempts to delegate `user_verification`.
- Config attempts to delegate `review_iteration`.
- Config attempts to delegate a hard-floor gate.
- Agent edits `.agent-flow.json` during a delegated run.
- Agent writes a verdict with current runId but wrong phase.
- Agent writes a verdict with right phase but stale runId.
- Agent writes strict approved JSON while Markdown says Needs revision.
- Multiple verdict files exist from previous runs.
- Step metadata is missing the plan-review runId.
- Review loop reaches iteration limit.
- Step limit is reached after an auto-pass.
- Digest writing fails before state advancement.
- Status command runs before any delegation digest exists.
- Non-Git workspace runs in limited guardrail mode.
- Windows symlink path-protection checks are skipped by platform limitations.

## Security Considerations

This feature reduces manual stops, so the default posture must be conservative.

Security requirements:

- Delegation must be off by default.
- Delegation must require double opt-in.
- The hard floor must be compiled in.
- Config must not be able to add hard-floor gates to the delegable set.
- Agents must not be able to widen delegation by editing `.agent-flow.json`.
- Config is loaded once at delegated-run start.
- Mid-run config edits must be caught as protected path changes.
- Verdict JSON is the trusted boundary. The orchestrator does not cross-check Markdown.
- A false but well-formed strict verdict is a known trust risk and accepted assumption of agent-consensus delegation.
- Existing guardrails and protected path checks remain mandatory.
- Stale verdict replay must be prevented by same-invocation step runId binding.
- Existing run logs and digest records must avoid secrets.

## Performance Considerations

- Delegation policy evaluation should be cheap: config lookup, state decision, verdict file read/validation, audit append, digest append.
- No network calls are required.
- No external schema library is required.
- Digest generation should be linear in the number of auto-passes in the delegated run.
- The feature should not materially slow non-delegated `run-until-user-gate`.

## Compatibility Considerations

- Existing configs without `delegation` must remain valid.
- Existing `agent-flow next` behavior must remain unchanged.
- Existing `agent-flow run-until-user-gate` behavior must remain unchanged without `--delegated`.
- Existing review Markdown artifacts remain supported.
- `plan_review` prompts must be updated to request verdict JSON, but human-readable review artifacts remain first-class.
- The implementation should follow the existing internal validator style.
- The implementation should use Node.js built-ins and `node:test`.

## Testing Strategy

Tests should cover:

- config defaults for `delegation`
- config validation for valid delegation block
- config validation rejects unknown, kept, hard-floor, `review_iteration`, and `user_verification` gates
- CLI parser accepts `--delegated`
- CLI parser preserves existing delimiter behavior
- non-delegated run behavior unchanged
- `--delegated` with disabled config fails closed
- valid strict `plan_review` verdict auto-clears `user_plan_approval`
- auto-clear performs validated `user_plan_approval -> task_classification` transition
- auto-clear writes audit record before reporting delegated completion
- auto-clear writes digest before reporting delegated completion
- missing verdict stops
- invalid verdict stops
- stale `runId` verdict from prior invocation stops
- wrong phase verdict stops
- `Approved with minor comments` stops
- `blocking > 0` stops
- `major > 0` stops
- `user_spec_review` always stops
- iteration-limit exhaustion still stops
- hard-floor/protected-path changes still stop
- digest write failure is fatal before completion
- status reports latest digest pointer/count when digest exists

Verification commands expected later:

- `npm run build`
- `npm run typecheck`
- `npm test`

## Open Questions

- Should the implementation expose step runId by widening `nextCommand()`'s return type, by adding an internal structured helper, or by returning structured metadata from a lower-level agent-step function?
- Should `.agent-flow.json` immutability be enforced by adding it to default `protectedPaths`, by a hard-coded guardrail, or both?
- What exact `agent-flow status` wording should be used for latest digest pointer and auto-pass count?

## User Decisions Required

At `user_spec_review`, the user should decide:

- Whether to accept the tightened v1 slice: delegate `user_plan_approval` only.
- Whether `.agent-flow.json` immutability should be default protected path, hard-coded guardrail, or both.
- Which step-runId exposure approach should be preferred for implementation planning.
- What exact status wording should be used for latest digest pointer and auto-pass count.

The Spec recommends:

- delegate `user_plan_approval` only in v1
- use `.agent/artifacts/plan_review_verdict.json`
- require `runId` in the plan-review verdict
- bind the verdict to the same delegated-run invocation's successful `plan_review` step runId
- treat `Approved with minor comments` as below strict bar
- represent auto-clear as a validated non-agent transition plus audit records
- use append history plus latest digest pointer
- make digest write failure fatal before delegated completion
- enforce `.agent-flow.json` immutability with both default protected path and a hard-coded agent-immutable rule
