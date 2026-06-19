# Test Results

## Verification Date

2026-06-14

## Commands Run

- `npm run build`
  - Result: pass
  - Evidence: `tsc -p tsconfig.json` exited 0.
- `npm run typecheck`
  - Result: pass
  - Evidence: `tsc -p tsconfig.json --noEmit` exited 0.
- `npm ls --omit=dev`
  - Result: pass
  - Evidence: production dependency tree is empty.
- `npm test`
  - Result: pass with skips
  - Evidence: 110 tests, 108 pass, 0 fail, 2 skipped.

## Implementation Review Fix Verification

- IR-B1 redaction coverage added for `GH_TOKEN`, `NPM_TOKEN`, `*_TOKEN`, `*_SECRET`, and `*_PASSWORD`.
- IR-M1 forbidden-path matching is now case-insensitive for Windows-style safety.
- IR-M2 globstar matching now supports leading and middle `**` spans.
- IR-M3 run logs now include outcome-aware audit fields.
- IR-M4 lock-release failure after commit is reported as a warning without overriding successful state advancement.
- IR-M5 dirty Git working tree pre-invocation blocking is covered by integration test.
- IR-M7 configured agent commands matching `blockedCommands` are rejected before invocation.

## Skipped Checks

- `untracked symlinks fail closed instead of counting as zero lines`
- `symlink escape is detected when the platform supports symlink creation`

Both symlink tests were skipped because this Windows environment did not permit symlink creation. The fail-closed resolver path is covered by a non-symlink unit test.

## Review Results

- Task 6 spec compliance review: approved.
- Task 6 code quality review: approved after redaction hardening.
- Task 7 spec compliance review: approved after manifest-order and lock-scope fixes.
- Task 7 code quality review: approved after runId, lock, stale proposal, runner, and state/manifest fixes.
- Task 8 spec compliance review: approved after dependency, untracked-line, and post-run guardrail fixes.
- Task 8 code quality review: approved after fail-closed path, rename, case-sensitive manifest, line-count, dependency, and rename-scope fixes.

## Run-Until-User-Gate Wave Verification

Date: 2026-06-16

- `npm run build`
  - Result: pass
  - Evidence: `tsc -p tsconfig.json` exited 0.
- `npm run typecheck`
  - Result: pass
  - Evidence: `tsc -p tsconfig.json --noEmit` exited 0.
- `npm test`
  - Result: pass with existing symlink platform skips on Windows
  - Evidence: 127 tests, 125 pass, 0 fail, 2 skipped.

Coverage added:

- stop-decision unit tests, including active explicit gates
- CLI parser/help coverage for `run-until-user-gate`
- immediate stop at user phase and done
- repeated `nextCommand()` execution until user phase
- active explicit gate stop without agent invocation
- original next error-code preservation with run summary details
- step-limit fail-closed behavior
- review back-edge traversal
- iteration-limit exhaustion fail-closed behavior

Run-until task reviews:

- Task 1 stop-decision boundary: spec and code-quality reviews approved.
- Task 2 CLI parser/help: spec review approved; code-quality review approved after delimiter parser coverage was strengthened.
- Task 3 command loop: spec review approved after error-summary, step-limit code, and unchanged-state fixes; code-quality review approved after step-limit hardening.
- Task 4 normal multi-step stop: spec review approved; code-quality review approved after integration assertions were strengthened.
- Task 5 active gate, done, error preservation: spec review approved; code-quality review approved after immediate-stop full-state preservation assertions were added.
- Task 6 step-limit fail-closed behavior: spec review approved; code-quality review approved after deterministic invocation-order assertions were added.
- Task 7 review back-edge and iteration-limit stops: spec review approved; code-quality review approved after marker and full-state no-mutation assertions were added.

## User Verification Items

- Run `agent-flow init` in a disposable workspace and inspect created files.
- Configure a real implementation agent command and run one `agent-flow next` phase in assisted mode.
- In a Git-backed disposable workspace, verify protected-path guardrails block expected unauthorized changes.

## Gate Delegation Wave Verification

Date: 2026-06-19

- `npm run build`
  - Result: pass
  - Evidence: `tsc -p tsconfig.json` exited 0.
- `npm run typecheck`
  - Result: pass
  - Evidence: `tsc -p tsconfig.json --noEmit` exited 0.
- `npm test`
  - Result: pass with existing Windows symlink platform skips
  - Evidence: 154 tests, 152 pass, 0 fail, 2 skipped.

Coverage added:

- agent-immutable `.agent-flow.json` guardrail defaults and hard-coded policy enforcement
- delegated and non-delegated `.agent-flow.json` edit block tests
- delegation config defaults and validation
- delegated CLI flag parsing and help output
- plan review verdict validation and strict bar
- structured `nextStepCommand()` metadata
- v1 delegation policy
- validated non-agent `user_plan_approval` auto-clear transition
- delegation digest writing
- delegated run-until integration
- stale/mismatched verdict stop behavior
- prior-run verdict replay prevention
- status digest summary
