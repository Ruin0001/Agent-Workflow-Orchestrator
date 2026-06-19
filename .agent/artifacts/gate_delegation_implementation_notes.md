# Gate Delegation Implementation Notes

Date: 2026-06-19

## Summary

Implemented Gate Delegation v1 for `run-until-user-gate --delegated`.

## Scope

- Delegates only `user_plan_approval`.
- Uses `.agent/artifacts/plan_review_verdict.json`.
- Requires same-invocation `plan_review` step runId binding.
- Auto-clear is a validated non-agent transition to `task_classification`.
- Digest and run-log audit are written before state advance.
- `.agent-flow.json` is agent-immutable through both default protected paths and a hard-coded guardrail.
- `review_iteration`, `user_verification`, `spec_review` verdicts, and `implementation_review` verdicts remain deferred.

## Implementation Notes

- Added delegation config with default-off behavior and v1-only gate validation.
- Added `--delegated` CLI flag and help output.
- Added `plan_review_verdict` artifact path and validator.
- Refactored `nextCommand()` through `nextStepCommand()` so `run-until-user-gate --delegated` can bind the same-run `plan_review` step `runId`.
- Added `canDelegateUserPlanApproval()` policy checks for double opt-in, same-run verdict, and strict approval bar.
- Added `clearDelegatedUserPlanApproval()` for the non-agent `user_plan_approval -> task_classification` transition.
- Added delegation digest history/latest files and status summary.
- Added stale verdict deletion at delegated run start.

## Verification

- `npm run build`: pass
- `npm run typecheck`: pass
- `npm test`: pass with existing Windows symlink platform skips

Latest full test evidence:

- 154 tests
- 152 pass
- 0 fail
- 2 skipped

Skipped tests:

- `untracked symlinks fail closed instead of counting as zero lines`
- `symlink escape is detected when the platform supports symlink creation`
