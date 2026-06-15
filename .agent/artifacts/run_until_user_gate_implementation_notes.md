# Run-Until-User-Gate Implementation Notes

Date: 2026-06-16

## Summary

Implemented `agent-flow run-until-user-gate` as a thin bounded loop over `nextCommand()`.

## Key Decisions

- No user gate is cleared, skipped, or delegated.
- `evaluateRunStop()` stops on `done`, user-owned phases, and active explicit gates.
- `RUN_UNTIL_USER_GATE_MAX_STEPS` is a named internal constant set to 20.
- `nextCommand()` errors preserve their original error code and include `details.runUntilUserGate`.
- No public config field was added in this wave.
- No persistent aggregate audit log was added; each step keeps using `nextCommand()` run logs.
- The stop-decision boundary remains small and explicit so a later Gate Policy Engine can extend it without rewriting the command loop.

## Verification

- `npm run build`: pass, `tsc -p tsconfig.json` exited 0.
- `npm run typecheck`: pass, `tsc -p tsconfig.json --noEmit` exited 0.
- `npm test`: pass with existing symlink platform skips on Windows; 127 tests, 125 pass, 0 fail, 2 skipped.

## Review Notes

- Task-level spec and code-quality reviews were completed through the subagent-driven workflow.
- Task 7 quality review required stronger assertions for review back-edge markers and iteration-limit no-mutation behavior; both were fixed and re-reviewed as approved.
- Final internal implementation review approved the wave as ready for external Claude implementation review.
