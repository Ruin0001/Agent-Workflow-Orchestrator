# Gate Delegation Requirement Understanding

## Summary

This wave will define, then later implement, per-project gate delegation for `agent-flow`.

The feature allows selected user gates to be auto-cleared only when the project has explicitly opted in and the review agent provides a machine-readable strict approval verdict. It is intended for lower-risk personal or internal "vibe-coding" projects where the user wants initial spec/design involvement but does not want to manually approve every later review-convergence or verification gate.

This is not uncontrolled full automation. The feature must preserve a compiled-in hard safety floor, keep `user_spec_review` as a mandatory user gate, and never weaken existing fail-closed behavior from `nextCommand()` or `run-until-user-gate`.

The approved grounding design is `.agent/proposals/2026-06-14-gate-delegation-design.md`. The prerequisite `run-until-user-gate` wave is complete and provides the `evaluateRunStop()` decision boundary that this wave can extend or compose with.

## User Intent

The user wants a safe way to reduce repetitive manual approval in selected projects while keeping high-risk decisions under direct user control.

The intended operating split is:

- Production or serious projects: leave delegation disabled; every user gate still stops.
- Personal/internal pre-check projects: opt in to delegation; after the user reviews the initial spec, agents may continue through selected gates when implementation and review have reached strict consensus.

The user has already decided that this development workflow itself remains manual for this feature's design/spec/plan/review stages. Gate delegation must not be used to auto-pass the gates involved in creating this feature.

## Confirmed Facts

- The project is a local-first TypeScript CLI using Node.js built-ins and internal validators.
- The runtime currently avoids external schema libraries.
- The active config format is JSON via `.agent-flow.json`, not YAML.
- `AgentFlowConfig` currently has no `delegation` block.
- `run-until-user-gate` exists and loops over `nextCommand()`.
- `runUntilUserGateCommand()` currently stops at `evaluateRunStop()` decisions, `done`, errors, or a step limit.
- `evaluateRunStop()` is a pure workflow boundary in `src/workflow/run-stop.ts`.
- `evaluateRunStop()` currently stops on:
  - workflow done / actor `none`
  - any active explicit state gate
  - any user-owned phase
- `nextCommand()` owns agent invocation, lock handling, prompt rendering, proposal validation, guardrails, run logging, and canonical state advancement.
- `evaluateNextGates()` already blocks active gates and review iteration-limit exhaustion before accepting a proposed transition.
- Run logs are appended to `.agent/logs/runs.jsonl`.
- Existing artifact names are enumerated in `src/artifacts/paths.ts`; there is no `review_verdict` artifact yet.
- The approved design requires `review_verdict.json` as machine-readable consensus input, not Markdown parsing.
- The approved design requires double opt-in: config `delegation.enabled: true` and an explicit CLI flag such as `run-until-user-gate --delegated`.
- The approved design requires delegation to be default OFF.
- The approved design requires a three-tier gate model:
  - hard floor: never delegable
  - kept: remains a user gate
  - delegable: may auto-clear at strict bar
- The hard floor must be compiled in, not data-driven.
- `user_spec_review` is a kept gate.
- Delegable gates are `user_plan_approval`, `user_verification`, and review-iteration convergence.
- Auto-pass is allowed only when the review verdict is `Approved` with `blocking = 0` and `major = 0`.
- Missing, invalid, or below-bar verdicts must stop for the user.
- The approved design requires per-gate audit records and an end-of-run digest.

## Assumptions

- The delegation wave should include `review_verdict.json` as its foundation rather than requiring a separate prerequisite wave.
- The implementation should keep `runUntilUserGateCommand()` as the outer loop and move policy-specific stop/auto-pass logic into a small module that composes with or extends `evaluateRunStop()`.
- The CLI flag should be named `--delegated` unless the Spec finds a strong reason to choose a clearer name.
- The digest path should default to `.agent/logs/delegation_digest.md`, relative to the configured log directory.
- The existing run log redaction behavior remains sufficient for verdict and delegation audit records because the verdict should not contain secrets.
- Existing guardrail path protection can enforce config immutability if `.agent-flow.json` is treated as an always-protected path or equivalent agent-immutable path.
- The first implementation should prioritize correctness and auditability over advanced UX controls such as named profiles.

## Functional Requirements

- The CLI must support a project-level `delegation` config block.
- `delegation.enabled` must default to `false`.
- Delegation must be opt-in per project.
- Delegation must require both:
  - `delegation.enabled: true`
  - explicit delegated invocation, expected as `agent-flow run-until-user-gate --delegated`
- If `--delegated` is absent, `run-until-user-gate` must retain current behavior and stop at all user gates.
- If `--delegated` is present while config delegation is disabled, the command must refuse or fail closed with a clear error.
- Config validation must reject unknown delegated gate names.
- Config validation must reject hard-floor or kept gates in `delegatedGates`.
- v1 must support only the strict auto-pass bar.
- Review phases must be able to emit a machine-readable `review_verdict.json`.
- The orchestrator must validate `review_verdict.json` with internal path-aware validation.
- The verdict schema must include enough information to prove the strict bar:
  - phase
  - status
  - blocking count
  - major count
  - minor count
  - iteration
- The strict bar must pass only when:
  - `status` is exactly `Approved`
  - `blocking` is `0`
  - `major` is `0`
- Any missing verdict, malformed verdict, unknown status, negative count, phase mismatch, or below-bar verdict must stop for the user.
- Delegated progression must use the existing `nextCommand()` path for agent work.
- Delegated progression must not duplicate or bypass proposal validation, transition validation, locks, post-run guardrails, or run logs.
- Delegated progression must stop at all hard-floor gates.
- Delegated progression must stop at `user_spec_review`.
- Delegated progression may auto-clear `user_plan_approval`, `user_verification`, and review-iteration convergence only when configured and verdict-approved.
- Auto-cleared gates must be recorded in audit data.
- A delegated run must produce an end-of-run digest summarizing auto-cleared gates and evidence.
- `agent-flow status` should surface the latest digest pointer and auto-pass count once the digest exists.

## Non-Functional Requirements

- The implementation should remain lightweight and avoid new runtime dependencies when internal validation is practical.
- Behavior must be deterministic and testable with Node's built-in test runner.
- The safety model must be understandable from source and artifacts without relying on agent judgment.
- Error messages should be path-aware for config and verdict validation.
- Delegation must fail closed by default.
- The feature must be auditable after the run without requiring transcript capture.
- The feature should preserve the existing assisted and run-until behavior for non-delegated projects.
- The design should remain extensible for future named profiles, but v1 should not implement them.

## Architecture Requirements

- Keep `nextCommand()` as the only path that invokes agents and advances canonical workflow state after guardrail validation.
- Keep `runUntilUserGateCommand()` as the multi-step loop.
- Introduce a policy decision boundary that can answer whether a stop should remain a user stop or can be auto-cleared.
- The policy boundary should either extend `evaluateRunStop()` or compose with it in a nearby module; it should not rewrite the run loop.
- Gate tier definitions must be static code constants, not user-editable data.
- The config schema must add delegation defaults and validation in the existing internal validator style.
- The verdict validator should follow the existing `next_state_proposal.json` and allowed-change-manifest style: parse JSON, validate shape, return `Result`.
- Artifact path resolution must define where `review_verdict.json` lives. The Spec should decide whether this is:
  - one standard artifact name reused by all review phases, or
  - phase-specific verdict paths.
- Audit records should reuse `.agent/logs/runs.jsonl` where practical and add delegation-specific fields rather than inventing an unrelated log system.
- The end-of-run digest should be generated from in-memory run decisions or recorded audit data and appended/written under the configured log directory.
- Config immutability must be enforced by guardrails so agents cannot alter `.agent-flow.json` to grant themselves delegation.

## Security and Privacy Requirements

- Delegation must never clear or bypass hard-floor gates.
- Hard-floor gates must include:
  - destructive action approval
  - always-protected path changes
  - credential access
  - production-data access
  - external-service access approval
  - approved-Plan deviation approval
- `.agent-flow.json` must be agent-immutable for delegation safety.
- The hard floor must be compiled in and not expressible in config as a delegable set.
- `user_spec_review` must always stop for the user.
- Existing stop conditions must remain fail-closed:
  - guardrail violation
  - protected-path change
  - unauthorized file change
  - non-zero agent exit
  - timeout
  - missing required artifact
  - invalid next-state proposal
  - invalid transition
  - exceeded iteration limit unless explicitly handled by valid review-convergence delegation
  - missing or invalid verdict
  - verdict with any Blocking or Major findings
- Auto-pass evidence must not include secrets.
- Logs and digests must use existing redaction protections where applicable.
- The system must not rely on Markdown review text to grant autonomy.

## In Scope

- Requirement Understanding, Spec, review, and Plan for Gate Delegation.
- `delegation` config design with default OFF behavior.
- CLI surface for delegated run-until execution.
- Gate tier model and strict-bar evaluation.
- `review_verdict.json` schema and validation requirements.
- Delegated policy evaluation over the existing run-until boundary.
- Audit records for auto-cleared gates.
- End-of-run delegation digest.
- Tests for default-off, double opt-in, hard-floor, kept gate, delegable gate, verdict validation, strict-bar pass/fail, and fail-closed paths.

## Out of Scope

- Implementing delegation during Requirement Understanding, Spec, or Plan phases.
- Using delegation to auto-pass this feature's own `user_spec_review` or `user_plan_approval`.
- Named profiles such as `--profile vibe`.
- Configurable hard floor.
- Auto-progression on `Approved with minor comments`, `Needs revision`, or `Blocked`.
- Rollback checkpoints or automatic reversal of auto-passed gates.
- Markdown parsing for approval decisions.
- New external schema validation libraries.
- Cloud execution, remote policy service, GUI controls, or team administration.
- Broad refactors of `nextCommand()` unrelated to policy evaluation.

## Risks

- This feature intentionally weakens selected user gates, so a small policy mistake could create unintended autonomy.
- If config immutability is incomplete, an agent could attempt to widen its own autonomy.
- If hard-floor checks are represented too loosely, future additions could accidentally become configurable.
- If verdict validation is too permissive, a malformed or stale verdict could be treated as approval.
- If verdict storage is ambiguous, one phase could accidentally reuse another phase's verdict.
- If audit logs and digest records diverge, later review could become confusing.
- If review-iteration convergence is not modeled carefully, iteration-limit handling could be weakened instead of explicitly delegated.
- The existing Windows environment skips symlink guardrail tests, so config-immutability path safety may need Linux or privileged Windows verification.
- Adding delegation to CLI flags requires parser updates without weakening existing delimiter and unknown-flag behavior.

## Initial Edge Cases

- Config omits `delegation`.
- Config sets `delegation.enabled` to a non-boolean value.
- Config includes an unknown delegated gate.
- Config attempts to delegate `user_spec_review`.
- Config attempts to delegate a hard-floor gate.
- `--delegated` is passed while delegation is disabled.
- Delegation is enabled but `--delegated` is omitted.
- Verdict file is missing.
- Verdict file is invalid JSON.
- Verdict root is not an object.
- Verdict phase does not match the relevant review phase or gate context.
- Verdict status is unknown.
- Verdict status is `Approved with minor comments`.
- Verdict has `blocking > 0`.
- Verdict has `major > 0`.
- Verdict count fields are negative, non-integer, or missing.
- Verdict is stale from a previous review iteration.
- A delegated gate is reached after an agent timeout.
- A delegated gate is reached after a guardrail violation.
- A delegated gate is reached after an unauthorized file change.
- A hard-floor gate is active while delegation would otherwise pass.
- `user_spec_review` is reached with a strict approved verdict.
- Step limit is reached during delegated progression.
- Digest writing fails after a delegated run stops.
- Run log append fails while recording an auto-pass.
- `.agent-flow.json` is modified by an agent during a delegated run.

## Open Questions

- Should `review_verdict.json` be one canonical artifact path or phase-specific paths such as `spec_review_verdict.json`, `plan_review_verdict.json`, and `implementation_review_verdict.json`?
- Should the verdict include `runId` to prevent stale verdict reuse, matching the existing `next_state_proposal.json` pattern?
- Should `Approved with minor comments` always stop, or should it be treated as below strict bar with a tailored message explaining that only exact `Approved` auto-passes?
- How should review-iteration convergence map to concrete workflow transitions and gates in v1?
- Should auto-clearing `user_plan_approval` and `user_verification` be represented by adding explicit inactive/cleared gate records, or by policy-controlled state advancement without persisting a gate object?
- Should the digest be append-only per run, overwritten as latest, or both append history and latest pointer?
- What exact fields should `agent-flow status` display for delegation digest and auto-pass count?
- Should `.agent-flow.json` be added to default `protectedPaths`, or should the guardrail layer have a separate agent-immutable config rule?

## User Decisions Required

No user decision is required before drafting the Gate Delegation Spec.

The Spec should route these decisions to the `user_spec_review` gate:

- Final `review_verdict.json` storage model.
- Whether verdicts must include `runId`.
- Exact strict-bar wording exposed in CLI errors and digest.
- Digest retention model.
- Whether v1 bundles all approved delegable gates or ships a narrower first slice.
- How strongly to enforce `.agent-flow.json` immutability: default protected path, separate hard-coded guardrail, or both.
