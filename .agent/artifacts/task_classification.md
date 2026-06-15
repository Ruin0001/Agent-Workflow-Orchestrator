# Task Complexity Classification

## Summary

The user explicitly approved Wave 1 and Wave 2 together. Implementation may proceed through Tasks 1-8 from `.agent/artifacts/plan.md`, with Task 9 verification/handoff after the approved implementation work.

Although both waves are approved together, execution should still follow the Plan order. Wave 1 builds the safe skeleton first. Wave 2 introduces agent process spawning and Git/diff guardrails after the prerequisite core modules exist.

## Task Classifications

## Task 1: Repository Bootstrap

- Task ID: T1
- Classification: Mechanical
- Rationale: Creates package metadata, TypeScript config, ignore rules, and installs dev dependencies only.
- Required Review Depth: Lightweight diff check plus dependency review.
- Required Tests: `npm ls --omit=dev` after install; build may wait until source files exist.
- User Verification Required: Confirm zero runtime dependencies remain acceptable.

## Task 2: Core Result Helpers and CLI Parser

- Task ID: T2
- Classification: Simple
- Rationale: Adds small utility modules and deterministic command parsing without external runtime dependencies.
- Required Review Depth: Single combined review for parser correctness and CLI behavior.
- Required Tests: `test/unit/args.test.ts`, `npm run build`, `npm test`.
- User Verification Required: None unless command naming changes.

## Task 3: JSON Config Defaults and Validation

- Task ID: T3
- Classification: Integration
- Rationale: Defines config defaults and validation used by all CLI commands and future orchestration behavior.
- Required Review Depth: Plan compliance plus validation correctness review.
- Required Tests: `test/unit/config.test.ts`, unreadable/invalid JSON cases, YAML unsupported case.
- User Verification Required: Confirm generated `.agent-flow.json` is understandable after implementation.

## Task 4: State Schema, Transitions, and Gates

- Task ID: T4
- Classification: Design-sensitive
- Rationale: Establishes canonical workflow state, transition model, actor ownership, user gates, and iteration-limit enforcement.
- Required Review Depth: Architecture and safety review in addition to tests.
- Required Tests: `test/unit/state.test.ts`, `test/unit/transitions.test.ts`, `test/unit/actors.test.ts`.
- User Verification Required: None before implementation review.

## Task 5: Init, Status, and Config Validate Commands

- Task ID: T5
- Classification: Integration
- Rationale: Connects CLI command dispatch to config, state, artifact, and filesystem initialization.
- Required Review Depth: Plan compliance, filesystem safety, and no-overwrite behavior review.
- Required Tests: `test/integration/init-status.test.ts`, `test/integration/config-validate.test.ts`.
- User Verification Required: Confirm command output is acceptable for personal workflow use.

## Task 6: Artifacts, Redaction, Prompt Rendering, and Logs

- Task ID: T6
- Classification: Risk-sensitive
- Rationale: Handles persisted logs/prompts and secret redaction, which affects privacy and GitHub preservation safety.
- Required Review Depth: Security/privacy review plus correctness review.
- Required Tests: `test/unit/redact.test.ts`, artifact path tests, manifest validation tests.
- User Verification Required: Confirm redaction and prompt persistence defaults match expectations.

## Task 7: Agent Adapter, Runner, and Assisted Next

- Task ID: T7
- Classification: Risk-sensitive
- Rationale: Introduces child-process execution of configured commands and state advancement from agent-produced proposals.
- Required Review Depth: Two-stage review: safety/plan compliance first, then code correctness and failure modes.
- Required Tests: positive fake-agent flow plus non-zero exit, timeout, missing proposal, invalid proposal, missing artifact, and active user gate negative paths.
- User Verification Required: Confirm `agent-flow next` one-phase behavior after implementation.

## Task 8: Guardrails, Path Matching, and Git Diff

- Task ID: T8
- Classification: Risk-sensitive
- Rationale: Enforces filesystem safety, protected paths, symlink-aware path checks, allowed manifests, Git clean-tree policy, and unauthorized-change blocking.
- Required Review Depth: Security/data-safety review plus Windows path behavior review.
- Required Tests: path normalization, Windows-style protected path checks, symlink escape where platform-supported, dirty-tree blocking, protected path violation, manifest violation, non-Git limited mode.
- User Verification Required: Confirm limited guardrail messaging for non-Git workspaces.

## Task 9: Verification and Handoff

- Task ID: T9
- Classification: Mechanical
- Rationale: Records verification commands and updates handoff after implementation.
- Required Review Depth: Verification evidence review.
- Required Tests: `npm run build`, `npm test`, `npm ls --omit=dev`.
- User Verification Required: Review final handoff and any manual verification items.

## Overall Review Strategy

Wave 1 contains Tasks 1-6 and includes one Risk-sensitive task because redaction/logging affects privacy. It should receive implementation review before relying on it for real workflow use.

Wave 2 contains Tasks 7-8 and is Risk-sensitive because it executes commands and inspects/mutates filesystem state. It requires a stricter implementation review focused on process spawning, user gates, unauthorized file changes, protected paths, symlink behavior, timeouts, and proposal validation.

## Stop Condition

Task classification is complete. Proceed to implementation only under the approved Plan and only with the required implementation workflow skill.
