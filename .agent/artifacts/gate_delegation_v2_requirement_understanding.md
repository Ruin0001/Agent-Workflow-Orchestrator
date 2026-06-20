# Gate Delegation v2 — Requirement Understanding

Author: Codex implementation session
Date: 2026-06-20
Phase: requirement_understanding
Status: Draft for Claude review

## 1. Purpose

Gate Delegation v1 safely delegates only `user_plan_approval` by using a same-run, machine-readable `plan_review_verdict.json` and a strict `Approved` / 0 Blocking / 0 Major bar.

This v2 wave explores extending delegation to `user_verification`, the gate v1 explicitly deferred because the current workflow has no review verdict between `testing` and `user_verification`.

The goal is narrow:

- allow `agent-flow run-until-user-gate --delegated` to auto-clear `user_verification` when objective verification evidence authorizes it
- preserve default-off, double opt-in delegation
- preserve `user_spec_review` as a kept user gate
- preserve the compiled-in hard floor
- build on the v1 infrastructure without rewriting it

This is not implementation. This RU should feed the Spec, Spec Review, and `user_spec_review` decision.

## 2. Current Grounding

Existing v1 implementation provides:

- Config model:
  - `delegation.enabled`
  - `delegation.delegatedGates`
  - `delegation.autoPassBar`
  - `delegation.digestOnStop`
- Current `DelegatedGate` type accepts only `user_plan_approval`.
- Current config validation rejects any delegated gate other than `user_plan_approval`.
- `run-until-user-gate --delegated` removes stale verdict artifacts at run start, tracks the current same-run `plan_review` runId, reads the verdict at `user_plan_approval`, and either auto-clears or cleanly stops.
- `clearDelegatedUserPlanApproval()` performs a non-agent validated transition:
  - `user_plan_approval -> task_classification`
  - with lock, state validation, transition validation, digest, run log, then state write.
- `appendDelegationDigest()` currently models only the `user_plan_approval` digest entry.
- `src/workflow/transitions.ts` confirms:
  - `testing -> user_verification`
  - `user_verification -> final_handoff`

Existing config also has command slots:

- `commands.typecheck`
- `commands.lint`
- `commands.test`
- `commands.build`

These default to `null` and are validated as nullable strings, but there is no existing orchestrator command-runner path that executes them for gate delegation.

## 3. Requirement Understanding

`user_verification` is different from `user_plan_approval`.

`user_plan_approval` delegates a review judgment: a review agent says the plan is approved with no blocking or major findings. The orchestrator validates the review verdict contract and runId freshness, but it still trusts the review agent's structured declaration.

`user_verification` is a mixed gate:

- Some evidence is objective and machine-checkable: typecheck, lint, tests, build, configured verification commands, exit codes.
- Some evidence is not fully machine-checkable: visual correctness, UX feel, external integrations, real-world workflows, screenshots, manual E2E, product acceptance, and whether the result satisfies the user's intent.

Therefore v2 must not pretend that automated checks equal full human verification. The honest scope is:

> Delegated `user_verification` may auto-clear only the portion of user verification represented by explicitly configured automated checks. Any missing, not-run, failing, manual-only, or ambiguous verification requirement must stop for the user.

This should be an explicit user decision at `user_spec_review`, because it relaxes a second judgment-heavy user gate.

## 4. Evidence Source Options

### Option A — Testing Verdict Artifact Only

The `testing` phase emits a machine-readable artifact such as `.agent/artifacts/test_results_verdict.json`.

Possible shape:

```json
{
  "runId": "uuid-from-testing-agent-step",
  "phase": "testing",
  "status": "Passed",
  "checks": [
    { "name": "typecheck", "command": "npm run typecheck", "status": "passed", "exitCode": 0 },
    { "name": "test", "command": "npm test", "status": "passed", "exitCode": 0 }
  ],
  "manualChecksPending": false
}
```

Benefits:

- Reuses the v1 verdict pattern.
- Lightweight to implement.
- Keeps agent-owned `testing` responsible for running verification.

Risks:

- The orchestrator trusts the testing agent's self-declared result.
- A false or stale "passed" declaration can auto-clear a user gate if schema and runId pass.
- It is weaker than the objective nature of testing should allow.

Assessment:

- Acceptable as an audit artifact.
- Weak as the sole authorization source for `user_verification`.

### Option B — Orchestrator Runs Configured Checks

At `user_verification`, the orchestrator runs configured checks from `commands.{typecheck,lint,test,build}` and gates on real process exit codes.

Benefits:

- Stronger evidence source: the orchestrator directly observes pass/fail.
- Avoids trusting an agent's self-declared test verdict.
- Fits the user's supply-chain/dependency posture: no external schema library is required; this can use Node's standard child process APIs and internal validators.
- Makes "not configured" / "not run" explicit and fail-closed.

Risks:

- Requires a new command-runner path.
- Need careful command execution design on Windows and Unix.
- Running configured commands from strings has shell-injection / quoting concerns if treated casually.
- Commands may be slow, flaky, or environment-dependent.

Assessment:

- Strongest safety model for an objective gate.
- Best default recommendation for v2, provided the Spec constrains command execution carefully.

### Option C — Hybrid: Testing Artifact + Orchestrator Re-Run

The `testing` phase may emit a machine-readable summary artifact, but auto-clear is authorized only after the orchestrator re-runs all configured checks and sees them pass.

Benefits:

- Keeps a human/audit-friendly testing artifact.
- Uses the stronger orchestrator-observed pass/fail result for authorization.
- Lets future status/digest output include both the testing phase's declared result and the orchestrator's confirmation.

Risks:

- More moving parts than Option B.
- Duplicate command execution may cost time.
- Need to define how mismatches are reported.

Assessment:

- Recommended direction for the Spec: Option B for authorization, with an optional or future-friendly testing evidence artifact for audit. In v2, the minimum safe implementation can authorize from orchestrator-run checks and record those results in the delegation digest/run log without requiring a separate trusted testing verdict.

## 5. Recommended Requirement Direction

Use orchestrator-run configured checks as the authorization source for `user_verification`.

The v2 strict bar should be:

1. Delegation is active:
   - config `delegation.enabled === true`
   - CLI `--delegated` is present
   - `delegation.delegatedGates` includes `user_verification`
2. The current stop is exactly:
   - phase `user_verification`
   - actor `user`
3. The same delegated invocation successfully ran the `testing` phase before reaching `user_verification`, and the delegated loop recorded that same-run `testing` step metadata.
4. At least one configured automated check exists.
5. Every required configured check runs and exits `0`.
6. No configured check is missing, skipped, timed out, killed, malformed, or not run.
7. No manual verification requirement is declared pending.
8. No guardrail, state, lock, transition, digest, run-log, or filesystem error occurs.

If any condition fails, delegated `run-until-user-gate` must stop cleanly at `user_verification` with exit 0 and no auto-clear.

## 6. Required Same-Run Binding

V1 prevents stale verdict replay by binding `plan_review_verdict.json` to the runId of the `plan_review` step from the current `run-until-user-gate --delegated` invocation.

V2 needs an equivalent freshness model for `user_verification`.

Possible model:

- `nextStepCommand()` already returns structured metadata for agent-owned steps.
- The delegated loop should record the successful same-run `testing` step metadata:
  - runId
  - phase `testing`
  - accepted artifact paths, including `test_results`
- At `user_verification`, auto-clear may run only if `lastTestingRunId` exists from this invocation.
- The digest/run-log must include that testing runId.

If a delegated run starts already at `user_verification`, it must not auto-clear based on old logs or old test artifacts. It should stop for the user.

## 7. Auto-Clear Transition

When policy allows `user_verification` auto-clear, the orchestrator should perform a separate validated non-agent transition:

- `user_verification -> final_handoff`

This mirrors v1's `user_plan_approval -> task_classification` clear path:

1. Acquire lock.
2. Re-read and validate state.
3. Confirm phase is `user_verification`.
4. Confirm actor is `user`.
5. Validate transition `user_verification -> final_handoff`.
6. Write delegation digest and run-log entry with verification evidence.
7. Write updated state:
   - phase `final_handoff`
   - current actor `implementation`
   - next actor `implementation`
8. Continue the delegated loop. The next agent-owned step should use `nextStepCommand()` as usual.

The actor ownership comes from `src/workflow/actors.ts`, where `final_handoff` is owned by `implementation`.

## 8. Command Execution Requirement Questions

The Spec must define a lightweight internal command-runner contract.

Open design details:

- Whether command strings execute through a shell or through parsed command/args.
- Timeout behavior for verification commands.
- Output capture and redaction.
- Whether checks run in fixed order:
  - typecheck
  - lint
  - test
  - build
- Whether all configured checks run even after one fails, or the runner stops at first failure.
- How to report "no configured checks".
- Whether `null` checks mean "not required" or "not enough evidence".

Recommended requirement:

- For delegation, `null` means "not configured"; it is allowed only if at least one check is configured and no required project check is declared elsewhere.
- If all four are `null`, `user_verification` must not auto-clear.
- Configured checks should run in deterministic order and collect all results when feasible, so the user gets a useful stop report.
- Any nonzero exit, timeout, spawn failure, signal, or invalid command is below bar.

## 9. Scope Honesty Requirements

The Spec should include a clear safety statement:

- Auto-clearing `user_verification` does not prove UX, visuals, product fit, external integrations, or manual acceptance.
- It proves only that configured automated checks passed in the orchestrator environment.
- Projects that require manual verification should not include `user_verification` in `delegatedGates`, or should leave a manual-pending marker that forces a stop.
- The project's own development workflow remains manual while building and reviewing this feature.

## 10. Expected Config Changes

The v2 Spec should widen the config validator from:

```ts
export type DelegatedGate = "user_plan_approval";
```

to:

```ts
export type DelegatedGate = "user_plan_approval" | "user_verification";
```

Validation must still reject:

- `user_spec_review`
- hard-floor gates
- `review_iteration`
- unknown gate names

Default behavior should remain conservative. The Spec should decide whether the default `delegatedGates` remains `["user_plan_approval"]` or becomes `["user_plan_approval", "user_verification"]` when `delegation.enabled` is false by default.

Recommended:

- Keep default `delegatedGates` as `["user_plan_approval"]`.
- Require explicit config edit to add `user_verification`.
- This avoids enabling a judgment-heavy gate by surprise if a project already has `delegation.enabled: true` from v1.

## 11. Audit And Digest Requirements

Digest/run-log entries for `user_verification` need a different evidence shape than review verdicts.

They should include:

- gate: `user_verification`
- transition: `user_verification -> final_handoff`
- testing runId from the same delegated invocation
- list of configured checks
- for each check:
  - name
  - command label or redacted command
  - exit code
  - status
  - duration if implemented
- final authorization reason

No secrets should be written to logs. Output capture should either be omitted in v2 or heavily redacted and bounded.

## 12. Non-Goals For V2

- No delegation of `user_spec_review`.
- No configurable hard floor.
- No review-iteration delegation.
- No `spec_review` or `implementation_review` verdict expansion.
- No external schema-validation library.
- No broad rewrite of `nextCommand()`.
- No named profiles.
- No rollback/checkpoint feature.
- No claim that automated checks equal full human acceptance.

## 13. Proposed Acceptance Scenarios

The Spec should cover at least these scenarios:

1. Delegation disabled:
   - `--delegated` fails closed if config delegation is disabled.
2. Config enabled but `user_verification` not in `delegatedGates`:
   - stop at `user_verification`.
3. Config enabled and `user_verification` delegated, no configured checks:
   - stop at `user_verification`, no digest auto-pass.
4. One or more configured checks pass:
   - auto-clear `user_verification -> final_handoff`.
5. Any configured check fails:
   - stop at `user_verification`, include check failure reason, no auto-clear.
6. Check times out or cannot spawn:
   - stop at `user_verification`, no auto-clear.
7. Delegated run starts already at `user_verification`:
   - stop; do not replay old testing evidence.
8. Same run reaches `user_verification` after `testing`:
   - same-run testing metadata is required before auto-clear.
9. `user_spec_review` remains kept:
   - never auto-clear.
10. v1 `user_plan_approval` behavior remains unchanged.

## 14. User Decisions To Route To Spec Review

These decisions should be made explicit during `user_spec_review`:

1. Evidence source:
   - RU recommendation: orchestrator-run configured checks authorize auto-clear; any testing verdict artifact is audit-only or deferred.
2. Strict bar:
   - RU recommendation: at least one configured check; all configured checks run and pass; no skipped/not-run/manual-pending checks.
3. Default delegated gates:
   - RU recommendation: keep `user_verification` out of defaults; require explicit addition.
4. Scope acceptance:
   - User must accept that this auto-clear covers automated verification only, not subjective/manual acceptance.

## 15. RU Conclusion

Gate Delegation v2 is feasible and should build directly on v1's delegation loop, policy, auto-clear, digest, and audit patterns.

The key change is the evidence model. For `user_verification`, the safer and more honest authorization source is not an agent-written verdict alone, but orchestrator-observed results from configured verification commands.

The next Spec should therefore define:

- the exact automated-check runner contract
- the same-run `testing` binding
- the `user_verification` strict bar
- the `user_verification -> final_handoff` auto-clear
- digest/run-log evidence shape
- fail-closed behavior for missing, failed, timed-out, skipped, stale, or manual-pending verification
