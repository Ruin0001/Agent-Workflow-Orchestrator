# Plan Review Response

## Item 1

- Decision: Accepted
- Restated Requirement: The Plan must not authorize the skeleton, child-process agent spawning, and Git guardrails as one undifferentiated approval unit.
- Verified Against Artifact: `.agent/artifacts/plan.md` had Tasks 1-8 in one implementation sequence and did not provide an approval boundary before Task 7 agent execution.
- Rationale: Agent command spawning is the highest-risk MVP capability. The design brief recommends starting with a safe skeleton before actual agent invocation. A staged approval model preserves the whole MVP roadmap while giving the user a clear gate before execution-capable features.
- Plan Change: Added explicit Approval Staging: Wave 1 covers Tasks 1-6 and excludes `child_process`; Wave 2 covers Tasks 7-8 and requires explicit user approval after Wave 1 implementation/review. Task 9 applies as verification/handoff for each approved wave.
- Remaining Risk: The user may still choose whole-MVP approval, but the Plan now surfaces the risk explicitly.

## Item 2

- Decision: Accepted
- Restated Requirement: The `package.json` bin path must match the emitted TypeScript output path.
- Verified Against Artifact: `tsconfig.json` uses `rootDir: "."`, so `src/cli/main.ts` emits to `dist/src/cli/main.js`; the Plan used `./dist/cli/main.js`.
- Rationale: The previous bin path would produce a non-runnable CLI after build.
- Plan Change: Changed the planned `bin.agent-flow` path to `./dist/src/cli/main.js`.
- Remaining Risk: None if implementation follows the Plan.

## Item 3

- Decision: Accepted
- Restated Requirement: Iteration-limit enforcement must either be implemented in MVP or explicitly deferred.
- Verified Against Artifact: The Spec requires iteration limits, while the Plan only had generic `limits` fields and no counters/checks.
- Rationale: Iteration limits are part of the deterministic safety model and are small enough to implement in MVP.
- Plan Change: Added config iteration limits, state iteration counters, transition checks, and tests for blocking at review iteration limits.
- Remaining Risk: The first implementation may use simple phase-based counters; richer review-result parsing can come later.

## Item 4

- Decision: Accepted
- Restated Requirement: Symlink path escape must be checked minimally or explicitly accepted as a v1 gap.
- Verified Against Artifact: The Spec requires symlink-aware guardrails, while the Plan mentioned symlink handling only as a risk.
- Rationale: A minimal `fs.realpath` check is feasible with Node built-ins and fits the user's safety posture.
- Plan Change: Added realpath-based path resolution to Task 8 and tests for symlink escape where the platform supports symlink creation.
- Remaining Risk: Windows symlink creation can require privileges; tests should skip only the symlink creation case when unavailable, while keeping realpath logic unit-tested.

## Item 5

- Decision: Accepted
- Restated Requirement: Minor gaps around config field coverage, phase-to-actor ownership, OS-level lock, CLI parser tests, test results artifact, manifest source, and empty-build behavior should be resolved.
- Verified Against Artifact: The Plan lacked explicit files/tests for these areas or left them vague.
- Rationale: These are small planning fixes that remove hidden assumptions before implementation.
- Plan Change: Added `src/workflow/actors.ts`, `src/locks/lockfile.ts`, CLI parser tests, `test_results.md` to Files to Create, config fields for commands/context/iteration limits, and an active manifest path default. Removed the empty-build expectation from Task 1 and moved build verification after minimal source exists.
- Remaining Risk: Stale-lock aging policy remains deferred, but basic concurrent-invocation locking is now in MVP.

## Item 6

- Decision: Accepted
- Restated Requirement: Negative-path integration tests must be explicit because they are core safety behavior.
- Verified Against Artifact: The Plan had a happy-path fake-agent test but did not list non-zero exit, timeout, missing/invalid proposal, missing artifact, and unauthorized-change integration tests.
- Rationale: The orchestrator's value is mostly in safe failure modes, so negative tests are required.
- Plan Change: Added negative-path fixtures/tests to Task 7 and Task 8, plus final acceptance criteria for those failures.
- Remaining Risk: Timeout tests must use short deterministic timeouts to avoid flaky test runtime.
