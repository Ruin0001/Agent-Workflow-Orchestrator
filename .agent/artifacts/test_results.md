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

## User Verification Items

- Run `agent-flow init` in a disposable workspace and inspect created files.
- Configure a real implementation agent command and run one `agent-flow next` phase in assisted mode.
- In a Git-backed disposable workspace, verify protected-path guardrails block expected unauthorized changes.
