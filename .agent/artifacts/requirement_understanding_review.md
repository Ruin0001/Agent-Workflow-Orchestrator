# Requirement Understanding — Review Report

Reviewer: Claude Code (review session)
Artifact under review: `.agent/artifacts/requirement_understanding.md`
Review basis: `Agent Workflow Orchestrator Desig.txt` (design brief §33.1, §34), `AI_Agent_workflow.txt`, `Agent Handoff Automation Protocol.txt`
Mode: manual handoff

## Summary

The Requirement Understanding artifact is strong and comprehensive. It follows the brief's §33.1 heading structure exactly, cleanly separates confirmed facts / assumptions / open questions / user decisions, and extends user gates and guardrails beyond the brief's baseline. It is ready to proceed to Spec creation. There are no blocking issues. Four Major items should be folded into the Spec phase (not a Requirement Understanding rewrite) to avoid document churn.

## Requirement Compliance

- Brief §33.1 format: all 18 headings present and correctly ordered. PASS
- Brief §9 / Protocol §9 user gates: all present, plus extensions (iteration-limit exceeded, missing artifacts, invalid next-state proposal, unauthorized changes, timeout, non-zero exit). PASS
- State-ownership model (agents produce artifacts + `next_state_proposal.json`; orchestrator validates and writes canonical `workflow_state.json`) correctly represented. PASS
- Phase enum matches `AI_Agent_workflow.txt` and Protocol §5. PASS

## Blocking Issues

None.

## Major Issues

### M1 — "Option B" terminology collision (downstream confusion risk)

- Finding: The document uses "Option B" to mean a **product form** (independent local CLI). The brief §33.2 separately defines "Option A/B/C" on a different axis — **state-ownership models** (A = agents edit state directly, B = proposal + orchestrator-owned canonical, C = hybrid). The very next artifact to be produced is that "Design Options" document.
- Evidence: `requirement_understanding.md` Summary ("Option B: an independent local CLI") vs brief lines 1041-1044.
- Required Change: Disambiguate the two meanings (e.g., "Product-form B" vs "State-ownership Option B"). In Confirmed Technical Decisions, label product form and state-ownership model as separate items.
- Acceptance Criteria: In the Design Options artifact, the two "Option B" references are unambiguous.
- User Decision Required: No.

### M2 — Dependency policy lacks runtime/dev taxonomy; custom YAML parser carries inverse risk

- Finding: The policy frames "runtime dependency minimization" via supply-chain risk, but a **locally-run CLI executes all dependencies on the user's machine**, so the runtime-vs-dev boundary is what determines the protective effect. Separately, rejecting the mature `yaml` library in favor of a hand-rolled YAML subset parser reduces supply-chain surface but **increases parsing-correctness and security-bug surface** (config files are user-authored, i.e. trusted input).
- Evidence: NFR lines 99-103; Confirmed Technical Decisions lines 314-316.
- Required Change: (1) Define the dependency taxonomy — what executes on every invocation (parser) vs what only runs while developing the orchestrator (Prettier/ESLint/test runner) — and state the policy's scope. (2) Elevate the already-listed **JSON-first config** open question to a recommendation (`JSON.parse` removes both the dependency and the custom parser), which dissolves the problem at the root.
- Acceptance Criteria: The Spec states a clear allow/deny boundary for dependencies with rationale.
- User Decision Required: Yes — JSON-first vs YAML-subset config (already surfaced in the artifact).

### M3 — Secret handling is a "risk" only, not a requirement

- Finding: The tool captures agent stdout/stderr/transcript and is preserved on GitHub. Captured output may contain API keys, file contents, or env values, but secret redaction/exclusion appears only as a risk line and a single "avoid storing secrets" clause — not as a security requirement. The Protocol classifies privacy / sensitive-data handling as risk-sensitive.
- Evidence: Functional Requirements line 93; Risks line 352; transcript default is an Open Question (line 416).
- Required Change: Promote to a security requirement — "captured output and logs must support redaction; known secret patterns and secret-bearing env vars must not be written to logs." Recommend transcript capture default to opt-in or redacted-on.
- Acceptance Criteria: The Spec's security section contains an explicit secret-non-logging requirement.
- User Decision Required: Yes — transcript default (off / on / redacted-on), already surfaced.

### M4 — Protocol canonical state file / audit log absent (process compliance)

- Finding: `.agent/` contains no `workflow_state.json` (machine-readable source of truth) and no `agent_log.md` (append-only audit log). Protocol §3.1, §16, §23 require both. The project itself is designed around "the orchestrator owns canonical state," yet the process dogfooding that standard currently runs without the state file.
- Evidence: `.agent/` contains only `handoff.md` and `artifacts/`. Protocol lines 737-802.
- Resolution (this session): User selected **manual handoff mode**. Handoff is driven by `handoff.md` alone; `workflow_state.json` and `agent_log.md` are intentionally NOT initialized for now. This is acceptable for the design phase. Re-evaluate before any file-based auto/polling loop is enabled, since that mode requires `workflow_state.json`.
- User Decision Required: Resolved (manual mode).

## Minor Issues

- m1: MVP scope includes "basic diff checks" and "allowed change manifest representation," but their representation form and the Git-required question are unresolved open questions — MVP items depend on undecided user decisions. Sequence these in the Spec/Plan.
- m2: "TypeScript strict" + "prefer `node:test`" + "minimize dependencies" has friction — running TS tests needs a transform (tsx/ts-node, or Node experimental TS stripping). The Spec should pin the test-execution path.
- m3: The leaning toward an internal command parser (no CLI framework) is implied in NFR/In-Scope but not stated in Confirmed Technical Decisions.
- m4: Artifact paths follow brief §12 (`.agent/artifacts/...`) rather than Protocol §4 schema (`.agent/requirement_understanding.md`). Reasonable, but the divergence is not noted.

## Edge Case Coverage

The Initial Edge Cases list is thorough. Recommended additions (note: current environment is **Windows**):

- Windows path matching — `protected_paths` globs must work against backslash paths and a case-insensitive filesystem (e.g., avoid `.GIT\` bypass, `.env` casing).
- Symlink escape — protected/allowed path checks could be bypassed via symlinks pointing outside the boundary.
- Concurrent CLI invocations (OS-level, distinct from actor lock); empty config file; artifact partially written due to mid-write agent crash; `next_state_proposal.json` entirely absent vs present-but-invalid.

## Testability

Core modules (state machine, validators, guardrails, prompt assembly, adapters) are separated from the CLI layer and are testable — good. The `node:test` preference is only realizable once the TS test-execution path (m2) is decided.

## Security / Privacy Concerns

M3 (secret handling as a requirement) is the key item. Also confirm in the Spec that protected-path checks resist symlink/Windows bypass (see Edge Cases) and that `blocked_commands` are robust to shell variants (`rm  -rf`, path/flag variations).

## Recommendations

1. Absorb M1–M4 into the **Spec phase**, not a Requirement Understanding rewrite — these resolve naturally there without document churn.
2. Confirming JSON-first config early eliminates M2 and several YAML-related risks simultaneously.
3. M4 is resolved for now (manual mode); revisit before enabling any auto/polling handoff loop.

## Approval Status

Approved with minor comments.

Spec creation is approved to proceed. No blocking issues. The four Major items must be reflected in the Spec; if unaddressed, they will be re-raised at the Plan stage.
