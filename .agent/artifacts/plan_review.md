# Plan Review Report

Reviewer: Claude Code (review session)
Artifact under review: `.agent/artifacts/plan.md`
Review basis: approved `spec.md` (ratified), design brief (`Agent Workflow Orchestrator Desig.txt` §29-31, §33.4-33.5), `AI_Agent_workflow.txt` §13, ratified user-gate decisions.
Mode: manual handoff

## Summary

The Plan is detailed, format-compliant with `AI_Agent_workflow.txt` §13 (all 18 sections present), TDD-first (failing tests before implementation), and honors the ratified decisions (JSON-only v1, Git-required full guardrails, transcript off, prompts configured-only). Spec reconciliation is verified: provisional language is now "ratified" (spec.md:153, 603, 721).

No blocking issues. I am raising 4 Major and 6 Minor items, plus a test-coverage gap. The biggest is scope/phasing: the Plan bundles the entire MVP — including child-process agent spawning and Git guardrails — into one approval/implementation unit, which conflicts with the brief's guidance that the first implementation task be the skeleton only. There is also one concrete build-breaking bug (the `bin` path). Status: **Needs revision** (moderate, no redesign required).

## Spec Compliance

- `AI_Agent_workflow.txt` §13 Plan format: all sections present; Stop Condition verbatim correct (plan.md:870). PASS
- Ratified decisions reflected: JSON-only (Preconditions, Task 3), Git clean-tree (Task 8 Step 3), transcript off / prompts configured-only (config type), YAML/JSONC/run-until-gate/snapshot in Non-Goals. PASS
- State-ownership model: agent writes `next_state_proposal.json`; `next` validates before writing canonical state (Task 7 Step 5). PASS
- First task is bootstrap with no agent invocation (Task 1), matching brief §30 ordering. PASS

## Blocking Issues

None.

## Major Issues

### PR-1 — Entire MVP bundled into one approval/implementation unit (phasing)

- Finding: The Plan is a single 9-task unit spanning bootstrap → config/state → init/status → artifacts/logs/redaction → **child-process agent spawning** (Task 7) → **Git diff guardrails** (Task 8). The brief §30 says the first implementation task should be the skeleton only and explicitly "Do not implement actual agent invocation in the first task," and §33 separates an MVP Plan (§33.4) from a First Task Plan (§33.5). `AI_Agent_workflow.txt` §16 plan exit criteria includes "tasks are small enough to implement safely."
- Evidence: plan.md Tasks 7-8 vs brief §30, §33.4-33.5.
- Why it matters: One `user_plan_approval` gate authorizing process-spawning + filesystem guardrails + diff logic is a large, hard-to-review surface to approve at once. Agent invocation (spawning arbitrary configured commands) is the highest-risk capability and deserves its own review boundary.
- Required Change: Either (a) split into waves — Wave 1: Tasks 1-6 (no `child_process`, no agent execution), land and review; Wave 2: Tasks 7-8 (adapter/runner/`next` execution + guardrails) as a separate plan/approval — or (b) keep one Plan but make the `user_plan_approval` explicitly staged, with Wave 2 gated on Wave 1 being implemented and reviewed. Surface the size explicitly to the user at the approval gate.
- Acceptance Criteria: Agent process-spawning is not authorized for implementation in the same breath as the skeleton; the user knowingly approves the agent-execution wave.
- User Decision Required: Yes (how to stage approval).

### PR-2 — `package.json` bin path is inconsistent with the TypeScript output layout (build-breaking)

- Finding: `tsconfig.json` uses `rootDir: "."` with `include: ["src/**/*.ts", "test/**/*.ts"]`, so `tsc` emits to `dist/src/...` and `dist/test/...`. But `package.json` sets `"bin": { "agent-flow": "./dist/cli/main.js" }` — that path will not exist; the entrypoint compiles to `dist/src/cli/main.js`. (The test glob `dist/test/**/*.test.js` is consistent with this layout, which confirms outputs land under `dist/src` and `dist/test`.)
- Evidence: plan.md:141 (bin) vs plan.md:145, 167-176 (rootDir/include) and plan.md:145 test glob.
- Required Change: Set `bin` to `./dist/src/cli/main.js`, or restructure (e.g., `rootDir: "src"` with a separate test tsconfig) so the entry lands at `dist/cli/main.js`. Pick one and make bin + outputs consistent.
- Acceptance Criteria: `agent-flow` resolves to the emitted entry file after `npm run build`.
- User Decision Required: No.

### PR-3 — Iteration-limit guardrail is required by the Spec but not implemented or explicitly deferred

- Finding: Max review-iteration limits (spec_review / plan_review / implementation_review) are a named guardrail in the Spec, both workflow documents (`AI_Agent_workflow.txt` §16, Protocol §10/limits), and brief §24 (#4). The Plan's `AgentFlowConfig` (Task 3) and state schema (Task 4) carry a generic `limits`/`gates` but define no iteration counters, and `next` (Task 7) implements no iteration counting or limit check. It is also not listed in Non-Goals as deferred.
- Evidence: plan.md Task 3 Step 2 config type, Task 4 Step 3 state fields, Non-Goals (plan.md:855-866) — iteration limits absent from both implementation and deferral list.
- Required Change: Either add minimal iteration counters (config limits + state counters + a check in `next` that blocks/escalates at the limit) or explicitly list iteration-limit enforcement as a deferred Non-Goal with rationale, so it is a conscious decision rather than a silent gap.
- Acceptance Criteria: Iteration limits are either enforced in MVP or visibly deferred.
- User Decision Required: No (technical), though deferral affects safety posture.

### PR-4 — Symlink resolution (a Spec security requirement) is silently deferred in Risks

- Finding: The Spec requires "Guardrail checks must resolve symlinks when possible to prevent allowed-path or protected-path escape" (Security/Guardrail requirements). The Plan defers this to "after MVP" inside the Risks section (plan.md:853), not as an explicit Non-Goal, while still claiming protected-path guardrails for MVP. A protected-path check that does not resolve symlinks can be bypassed by a symlink pointing into a protected path.
- Evidence: spec.md guardrail/security requirements vs plan.md:853 (Risks) and Task 8 (path matching without realpath).
- Required Change: Add a minimal `realpath`/symlink-resolution step to the Task 8 path guard (Node `fs.realpathSync` on candidate paths before matching), OR move the deferral to an explicit Non-Goal stating the bypass implication so the user accepts it knowingly. Given the user's stated security/supply-chain priority, a minimal MVP realpath check is recommended.
- Acceptance Criteria: Symlink-based protected-path escape is either checked in MVP or explicitly accepted as a known v1 gap.
- User Decision Required: Possibly (accept the gap vs require minimal check).

## Minor Issues

- m1: The `AgentFlowConfig` type omits several Spec config fields (test/build/lint/typecheck commands, source-of-truth / project-context files, explicit iteration limits). `next` prompt assembly is meant to include "configured project context" (Spec) — confirm which fields are in MVP vs deferred, and keep the config type and prompt renderer consistent.
- m2: `next` "validate actor for current phase" (Task 7 Step 5) needs a phase→actor/role mapping, but no module owns it — `transitions.ts` only defines phase→phase. Add an explicit phase→actor map (e.g., in `workflow/phases.ts` or `gates.ts`).
- m3: OS-level concurrent-invocation lock (Spec L399) is not in the Plan; only atomic state writes (Task 4 Step 4) and the workflow actor lock exist. Add a minimal lockfile or list it as a deferred Non-Goal.
- m4: The CLI arg parser (`src/cli/args.ts`) has no dedicated unit test (Task 2's test note is vague). Parsing is logic worth a small unit test.
- m5: `test_results.md` is created in Task 9 but is not in the top-level "Files to Create"; also, how `next` locates the active allowed-change manifest (from the plan artifact) is unspecified in Task 8 Step 4.
- m6: Task 1 Step 5 "verify empty build baseline" will error with TS18003 (no inputs) given the `include` globs; harmless but consider building after Task 2 instead of asserting on an expected failure.

## Edge Case Coverage

Good Windows coverage (`.GIT\config` → `.git/**`, `.env.*`) and dirty-tree blocking. The Plan addresses the earlier-raised Windows path and clean-tree concerns. Remaining: symlink (PR-4), config precedence test (Spec m4 — verify a test exists for JSON-wins / YAML-unsupported).

## Test Coverage

TDD-first ordering is good. Gap vs the Spec's testing strategy: the integration tests cover the happy path ("state advances only after valid proposal") but do not explicitly cover the negative guardrail paths the Spec requires — non-zero agent exit blocks, timeout blocks, missing/invalid `next_state_proposal.json` blocks, missing required artifact blocks, unauthorized-change blocks. Add these negative-path integration tests; they are the core safety behavior and should not be left implicit.

## Regression Risk

Low — greenfield repository. Main risk is the bin/output-path mismatch (PR-2) producing a non-runnable CLI, and best-effort redaction (acknowledged).

## User Verification Points

The Plan's User Verification Points (plan.md:830-835) are reasonable. Add: confirm the chosen approval staging for PR-1, and confirm acceptance (or not) of the symlink deferral (PR-4).

## Questions

1. PR-1: do you want the agent-execution + guardrail wave (Tasks 7-8) split into a separate plan/approval from the skeleton wave (Tasks 1-6), or approve the whole MVP at once knowingly?
2. PR-3 / PR-4: implement minimal iteration-limit counting and symlink realpath checks in MVP, or explicitly defer them as accepted v1 gaps?

## Recommendations

1. Fix PR-2 (bin path) — mechanical, do it in the plan_review_response.
2. Resolve PR-1 by stating an explicit approval staging (recommended: Wave 1 = Tasks 1-6, Wave 2 = Tasks 7-8).
3. For PR-3 and PR-4, choose implement-or-explicitly-defer and record it in Non-Goals; lean toward minimal MVP coverage given the security priority.
4. Add the negative-path integration tests (Test Coverage) and the phase→actor map (m2).
5. Process note: the brief's Design Options (§33.2) and Proposed Architecture (§33.3) artifacts were skipped in favor of the standard Spec→Plan flow. Acceptable, but PR-2 is exactly the kind of layout issue an architecture pass catches — worth a brief architecture sanity check before implementation.

## Approval Status

Needs revision.

The Plan is close and no redesign is needed. Fix PR-2, decide the PR-1 approval staging, and resolve PR-3/PR-4 as implement-or-explicitly-defer, then add the negative-path tests. After the plan_review_response, proceed to the `user_plan_approval` gate.
