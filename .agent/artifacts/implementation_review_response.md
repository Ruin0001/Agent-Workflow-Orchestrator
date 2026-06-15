# Implementation Review Response

Responder: Codex implementation session
Date: 2026-06-14
Review source: `.agent/artifacts/implementation_review.md`
Status: Fixes applied; ready for re-review after verification.

## Summary

Accepted and fixed the Blocking issue and the Major items that can be resolved in this local implementation pass: IR-B1, IR-M1, IR-M2, IR-M3, IR-M4, IR-M5, and IR-M7. IR-M6 remains a platform verification item because this Windows environment does not permit symlink creation for the two symlink-specific tests.

Minor items are recorded as follow-up work unless they were directly touched by a Major fix. The agent `env` config field remains intentionally deferred for this wave because the approved Wave 1 + Wave 2 plan schema does not include it.

## Item Responses

### IR-B1 - Secret redaction misses Spec-mandated patterns

Decision: Accepted.

Fix:
- Broadened secret assignment and structured-key detection to cover token, secret, and password families, including `GH_TOKEN`, `NPM_TOKEN`, `*_TOKEN`, `*_SECRET`, and `*_PASSWORD`.
- Added unit coverage for spec-mandated assignment and structured object redaction.

Verification:
- Targeted redaction tests failed before implementation and passed after the fix.
- Full test verification is recorded in `.agent/artifacts/test_results.md`.

### IR-M1 - Manifest `forbiddenPaths` matched case-sensitively

Decision: Accepted.

Fix:
- Removed the case-sensitive override for manifest `forbiddenPaths`, so these patterns now use the same Windows-safe case-insensitive matching as protected path policy.
- Added a policy test that verifies differently cased forbidden paths are blocked.

Verification:
- Targeted forbidden-path test failed before implementation and passed after the fix.

### IR-M2 - General `**` glob forms silently under-match

Decision: Accepted.

Fix:
- Replaced the equal-segment-only matcher with recursive segment matching that supports `**` in leading, middle, and trailing positions.
- Added coverage for `**/secrets.txt` and `a/**/b` style patterns.

Verification:
- Targeted globstar test failed before implementation and passed after the fix.

### IR-M3 - Run log missing required audit fields and written before outcome is known

Decision: Accepted.

Fix:
- Moved run-log emission to outcome-specific points after agent execution results, guardrail status, proposal validation, gate decisions, and accepted transition data are known.
- Added audit fields: `commandSummary`, `promptPath`, `artifactPaths`, `filesChanged`, `guardrailResult`, `proposedNextPhase`, `acceptedNextPhase`, `outcome`, and `failureCode`.
- Kept log serialization append-only and redacted through the existing logging path.

Verification:
- Added integration coverage asserting the success log contains the required audit fields after outcome is known.

### IR-M4 - `return` inside `finally` can report failure after state advance

Decision: Accepted.

Fix:
- Removed terminal returns from the `finally` block.
- Captured lock-release failure after a committed state advance and surfaced it as a warning suffix while preserving the successful transition result.

Verification:
- Added an integration fixture that corrupts lock ownership after writing a valid proposal.
- The test verifies state advances, the command exits successfully, and the lock-release warning is visible.

### IR-M5 - Dirty-working-tree pre-invocation block lacks tests

Decision: Accepted as a coverage gap.

Fix:
- Added an integration test that dirties a Git-backed workspace after baseline commit.
- The test asserts `next` fails before agent invocation and canonical state remains unchanged.

Verification:
- Test passed against the existing implementation, confirming the gap was test coverage rather than behavior.

### IR-M6 - Symlink escape guardrails skipped on Windows

Decision: Deferred external verification.

Reason:
- This Windows environment still cannot create symlinks for the symlink-specific tests.
- Existing non-symlink fail-closed resolver coverage remains in place, but the actual symlink escape path needs Linux CI or a Windows session with symlink privilege.

Required follow-up:
- Run the full suite on a symlink-capable platform and require the two skipped symlink tests to execute.

### IR-M7 - `blockedCommands` configured but not enforced

Decision: Partially accepted and implemented at the orchestrator interception point.

Fix:
- Added a pre-invocation check that rejects the configured agent command when its command summary matches a configured `blockedCommands` entry.
- Added integration coverage proving `git reset --hard` is rejected before the fake agent invocation marker is created.

Scope boundary:
- The orchestrator can validate the command it is about to spawn.
- It cannot observe arbitrary subprocess commands launched inside a real agent process with the current architecture. Full internal destructive-command interception is deferred unless the architecture adds an explicit agent sandbox/proxy.

## Minor Issues

Deferred follow-ups:
- IR-m1: move clean-tree check inside lock for tighter atomicity.
- IR-m2: consider reporting timeout/nonzero agent failures before post-run guardrail failures while preserving fail-closed behavior.
- IR-m3: report co-present unsupported YAML config when default JSON config is loaded.
- IR-m4: byte-count stream cap and redaction traversal optimization.
- IR-m5: document or implement `--strict`.
- IR-m6: make generated init config more self-documenting.
- IR-m7: add unreadable-config error-path test.

## Open Scope Decisions

- Agent `env`: Deferred intentionally for this wave. The Spec mentions it, but the approved plan schema omitted it; adding it now would expand the agent adapter/config surface.
- Gate delegation: Not part of this fix cycle. The queued design in `.agent/handoff.md` remains future-wave only.
