# Spec

## Background

The user currently follows a structured AI-assisted development workflow with separate implementation and review roles. Codex is the default implementation agent and Claude Code is the default review agent, though project-specific overrides must be supported.

The existing workflow and handoff protocol use shared files under `.agent/` to coordinate phases, artifacts, review reports, review responses, testing notes, and final handoff. This has the right discipline, but too much process burden remains manual and the previous protocol allows agents to write the canonical workflow state directly.

This project will build an Agent Workflow Orchestrator: a deterministic local CLI that coordinates agent handoff, validates workflow transitions, enforces user gates, checks guardrails, manages artifacts, invokes configured agent CLIs, captures logs safely, and stops when user judgment is required.

The selected product form is **Product-form B: independent local CLI with repo-local config/state/artifacts/logs**. This is distinct from **State-ownership Option B**, which means agents write artifacts and a `next_state_proposal.json`, while the orchestrator validates proposals and owns the canonical `workflow_state.json`.

Process note for building this project: the current design work is using manual handoff through `.agent/handoff.md`. A canonical `.agent/workflow_state.json` and append-only `.agent/agent_log.md` for this project's own development workflow are intentionally deferred until the orchestrator's state model is specified or before any polling/automated handoff loop is enabled. This process note does not define product behavior for end users of `agent-flow`.

## Problem Statement

Coordinating multiple AI coding agents manually is repetitive, error-prone, and easy to desynchronize. The user needs a local tool that preserves the existing disciplined workflow while reducing manual handoff work.

The orchestrator must not become another autonomous LLM agent. It must be a deterministic controller that calls worker agents, validates their outputs, and blocks unsafe or unauthorized transitions.

The design must also account for supply-chain risk. Recent dependency supply-chain attacks make unnecessary third-party runtime libraries undesirable, especially for a tool that runs locally and may inspect code, invoke agents, read project files, and write logs.

## Goals

Build a local CLI orchestrator that:

- coordinates Codex, Claude Code, and future agent CLIs through adapters
- owns canonical workflow state
- enforces the user's standard development workflow
- preserves explicit user approval gates
- supports advisory, assisted, and later run-until-user-gate modes
- manages artifacts, handoffs, and logs
- validates phase transitions deterministically
- blocks unauthorized file changes and protected path edits
- captures command output without leaking secrets by default
- supports project-specific configuration without assuming repository structure
- minimizes runtime dependencies where internal implementation is reasonable
- remains extensible without plugin-marketplace complexity

## Non-Goals

The orchestrator is not:

- a new LLM agent
- a replacement for Codex or Claude Code
- an uncontrolled full-auto development loop
- a cloud service
- a GUI-first product
- a CI/CD platform
- a package manager wrapper
- a test runner replacement
- a project-specific one-off script
- a system where agents recursively call each other

Initial implementation should not prioritize:

- remote execution
- multi-repository orchestration
- parallel agent execution
- plugin marketplace
- web dashboard
- team administration
- SaaS authentication
- billing

## Requirements

### Workflow Requirements

The orchestrator must support this canonical phase sequence:

```text
requirement_understanding
→ spec_creation
→ spec_review
→ spec_review_response
→ user_spec_review
→ plan_creation
→ plan_review
→ plan_review_response
→ user_plan_approval
→ task_classification
→ implementation
→ implementation_review
→ implementation_review_response
→ testing
→ user_verification
→ final_handoff
→ done
```

Review phases may iterate until approved, blocked, or limited by configured iteration counts.

User gate phases must not be skipped.

The orchestrator must represent workflow status with at least:

- `ready`
- `in_progress`
- `waiting_for_user`
- `blocked`
- `done`

The orchestrator must represent actors with at least:

- `implementation`
- `review`
- `user`
- `none`

### State Ownership Requirements

The orchestrator must be the only authority that writes canonical `workflow_state.json`.

Agents may write:

- Markdown artifacts
- handoff content
- structured run output
- `next_state_proposal.json`

The orchestrator must validate proposals before updating canonical state.

Agents must not be trusted to advance phase, clear gates, reset locks, or mark completion without orchestrator validation.

### User Gate Requirements

The orchestrator must stop and set the next actor to `user` when any of these is required:

- user spec review
- user plan approval
- user decision
- user verification
- destructive action approval
- protected path approval
- plan deviation approval
- production data access approval
- credential access approval
- external service access requiring user authorization

The CLI must never provide a command path that silently clears a user gate.

### Product Form Requirements

The CLI must be independent from the repositories it orchestrates.

Each target repository should contain only repo-local configuration, state, artifacts, prompts, and logs unless the user explicitly opts into additional files.

The tool should be preserved in a personal GitHub repository first. Public package distribution may be added later but is not required for the first implementation wave.

### Configuration Requirements

The ratified v1 config direction is JSON-first and core-runtime JSON-only.

The default config file is `.agent-flow.json` because Node.js can parse it with `JSON.parse`, avoiding both an external YAML dependency and a custom YAML subset parser.

`.agent-flow.yaml` is deferred for v1. YAML support must not be required for the core runtime.

If YAML support is added, it must either:

- use a documented conservative subset with clear unsupported-syntax errors, or
- be implemented behind an optional adapter after explicit user approval of the dependency trade-off

If both `.agent-flow.json` and `.agent-flow.yaml` exist in a version that supports both formats, `.agent-flow.json` should take precedence and the CLI should warn that the YAML file was ignored. If v1 is JSON-only, `.agent-flow.yaml` should be reported as unsupported rather than silently read.

The config must support:

- workspace root
- state directory
- artifact directory
- log directory
- prompt directory
- agent commands and args
- agent environment variables
- agent input/output modes
- source-of-truth documents
- protected paths
- protected-unless-authorized paths
- blocked commands
- test, build, lint, and typecheck commands
- automation mode
- iteration limits
- diff limits
- timeout limits
- guardrail policies
- project context files
- transcript capture policy
- secret redaction policy

### Dependency Policy Requirements

Dependencies must be classified into:

- runtime dependencies: packages executed when the user runs `agent-flow`
- development dependencies: packages used only to build, format, lint, or test the orchestrator itself
- optional adapter dependencies: packages used only when a non-core feature is explicitly enabled

Runtime dependencies should default to zero third-party packages where practical.

Development dependencies are allowed only when they materially improve correctness, maintainability, or security and do not ship into the runtime path.

Optional adapter dependencies must be isolated so that core commands do not load them unless the related feature is used.

The first implementation wave should avoid external runtime libraries for:

- CLI argument parsing
- JSON config parsing
- config validation
- state validation
- phase transition validation
- prompt rendering
- path matching
- run logging

TypeScript itself is acceptable as a development dependency. The emitted JavaScript should run on Node.js LTS.

### CLI Requirements

The CLI must support at least:

- `agent-flow init`
- `agent-flow status`
- `agent-flow next`
- `agent-flow config validate`

Later commands should include:

- `agent-flow run-until-user-gate`
- `agent-flow approve spec`
- `agent-flow approve plan`
- `agent-flow block "reason"`
- `agent-flow resume`
- `agent-flow verify`
- `agent-flow handoff`
- `agent-flow finish`
- `agent-flow logs tail`
- `agent-flow reset-lock`

The initial command parser should be internal and small rather than using a CLI framework. If command complexity grows beyond the internal parser's safe scope, this decision should be revisited explicitly.

`agent-flow reset-lock` should distinguish workflow actor locks from OS-level CLI locks. Resetting either lock type must require an explicit command option or confirmation, and stale OS-lock detection remains a later design detail.

### Agent Adapter Requirements

Agent invocation must be implemented through adapters.

Each adapter must describe:

- role
- display name
- command
- args
- environment variables
- working directory
- input mode
- output mode
- timeout
- stdout capture behavior
- stderr capture behavior
- exit code policy
- transcript policy

Initial adapters:

- Codex CLI
- Claude Code CLI

Future adapters:

- Gemini CLI
- Antigravity CLI
- OpenCode
- Cursor
- custom shell command

The core state machine must not hardcode agent-specific CLI flags.

### Artifact Requirements

The orchestrator must manage artifact paths through configuration.

Default artifact layout should follow the design brief:

```text
.agent/artifacts/requirement_understanding.md
.agent/artifacts/spec.md
.agent/artifacts/spec_review.md
.agent/artifacts/spec_review_response.md
.agent/artifacts/plan.md
.agent/artifacts/plan_review.md
.agent/artifacts/plan_review_response.md
.agent/artifacts/task_classification.md
.agent/artifacts/implementation_notes.md
.agent/artifacts/implementation_review.md
.agent/artifacts/implementation_review_response.md
.agent/artifacts/test_results.md
.agent/artifacts/final_handoff.md
```

The older protocol placed some artifacts directly under `.agent/`. The new default should use `.agent/artifacts/` for cleaner separation while remaining configurable for compatibility.

### Allowed Change Manifest Requirements

Implementation must be constrained by an allowed change manifest.

The preferred representation is a machine-readable JSON artifact, referenced from the approved Plan.

Markdown plans may include a human-readable summary, but the orchestrator should enforce a structured manifest such as:

```json
{
  "files_to_inspect": ["src/foo.ts"],
  "files_to_modify": ["src/foo.ts"],
  "files_to_create": ["src/foo.test.ts"],
  "forbidden_paths": [".env", ".git/**"],
  "dependency_changes": { "allowed": false },
  "migration_changes": { "allowed": false },
  "destructive_actions": { "allowed": false }
}
```

Markdown-only extraction is not sufficient for deterministic enforcement.

### Logging Requirements

The orchestrator must maintain append-only logs.

Default logs should include:

- `.agent/logs/runs.jsonl`
- `.agent/logs/agent_log.md`

Each run log entry should include:

- timestamp
- phase
- actor
- agent command summary
- prompt file path
- output artifact paths
- exit code
- duration
- files changed
- guardrail result
- proposed next phase
- accepted next phase

Logs must not store raw secrets.

### Secret Handling Requirements

Captured stdout, stderr, prompts, transcripts, and logs must support redaction.

Known secret-bearing environment variables must not be written to logs.

At minimum, the redaction layer must handle common names and patterns such as:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GITHUB_TOKEN`
- `GH_TOKEN`
- `NPM_TOKEN`
- `*_TOKEN`
- `*_SECRET`
- `*_PASSWORD`
- bearer tokens
- private key blocks

Transcript capture must default to off for the first implementation wave.

If transcript capture is enabled later, the default should be redacted-on rather than raw-on.

The system must clearly distinguish:

- raw agent execution streams
- redacted logs
- persisted transcripts
- user-visible summaries

### Guardrail Requirements

The orchestrator must enforce:

- allowed phase transitions
- user gates
- lock state
- iteration limits
- protected path checks
- protected-unless-authorized path checks
- plan-authorized file changes
- dependency change control
- CI/config change control
- destructive command control
- diff size limits
- artifact existence validation
- required stop conditions
- test claim validation

Protected path matching must normalize path separators and handle Windows case-insensitive filesystems. A path such as `.GIT\config` must not bypass `.git/**` protection.

Guardrail checks must resolve symlinks when possible to prevent allowed-path or protected-path escape.

Concurrent CLI invocations must not corrupt state. The orchestrator should use an OS-level lock file or atomic lock acquisition in addition to workflow actor locks.

Artifact writes should use temporary files and atomic rename where practical to avoid partial-write artifacts after crashes.

Blocked command detection must handle shell variants, repeated whitespace, and platform-specific destructive command forms.

### Diff Requirements

Git-based diff checking should be the primary implementation path.

For diff-checked phases that invoke agents, v1 should require a clean Git working tree before invocation. If Git reports pre-existing uncommitted changes, the orchestrator should block the phase and instruct the user to commit, stash, discard, or explicitly choose a future snapshot-baseline mode.

If the project is not a Git repository, the orchestrator should enter limited guardrail mode unless a configured snapshot baseline exists.

Full guardrail enforcement should require either:

- Git repository state, or
- an orchestrator-created file snapshot baseline

The CLI must clearly report when diff enforcement is limited.

## User Scenarios

### Scenario 1: Initialize Orchestration

The user runs `agent-flow init` in a project. The CLI creates default config, state, artifact, prompt, and log directories. It does not assume a package manager or source layout.

### Scenario 2: Inspect Status

The user runs `agent-flow status`. The CLI displays current phase, status, current actor, next actor, active gates, lock status, relevant artifact paths, latest run result, and next required action.

### Scenario 3: Execute One Phase

The user runs `agent-flow next`. The orchestrator validates that no user gate is active, acquires the lock, builds the phase prompt, invokes the configured agent, captures output safely, validates artifacts and proposal, evaluates guardrails, updates canonical state, appends logs, and stops.

### Scenario 4: Stop at User Gate

The workflow reaches `user_plan_approval`. The orchestrator sets `status = "waiting_for_user"` and `next_actor = "user"`. Running `agent-flow next` reports that user approval is required and does not invoke an agent.

### Scenario 5: Unauthorized File Change

An agent modifies a protected file or a file outside the allowed change manifest. The orchestrator blocks the workflow, records the violation, preserves evidence in redacted logs, and asks for user decision or plan revision.

### Scenario 6: Command Timeout

An agent command exceeds its timeout. The orchestrator terminates or marks the process as timed out, records redacted stdout/stderr captured so far, releases the lock safely if possible, and blocks the workflow for user review.

## Functional Behavior

`agent-flow init` should:

- detect whether config, state, artifact, prompt, and log paths already exist
- avoid overwriting existing files without explicit confirmation
- create default repo-local directories for state, artifacts, prompts, and logs
- write `.agent-flow.json` by default if absent
- create `.agent/workflow_state.json` by default if absent
- create `.agent/handoff.md` by default if absent
- create `.agent/logs/agent_log.md` by default if absent
- create `.agent/logs/runs.jsonl` by default if absent
- initialize canonical state to the first configured workflow phase
- leave existing user-authored files untouched unless an explicit overwrite flag or confirmation is provided

`agent-flow status` should:

- load and validate config
- load and validate state if present
- report missing canonical state as "not initialized" and suggest `agent-flow init`
- report active gates and locks
- identify next required action
- avoid mutating files

`agent-flow next` should:

- load config and state
- validate no user gate blocks execution
- validate the current phase has an agent actor
- validate the working tree baseline for phases requiring diff enforcement
- acquire a CLI-level lock
- assemble the prompt
- persist a redacted prompt file only when configured to do so
- invoke the configured adapter
- capture stdout and stderr
- apply redaction before persistence
- validate required artifacts
- validate `next_state_proposal.json`
- cross-check proposal claims against actual artifact existence and non-empty content where required
- run guardrail checks
- update canonical state only after validation
- append run logs
- release locks
- stop after exactly one phase

`agent-flow config validate` should:

- parse config
- apply defaults
- validate field types and allowed enum values
- report path-aware errors
- avoid requiring agent commands to exist unless strict mode is requested

## Error Handling Policy

Invalid config must produce path-aware errors and no state mutation.

Unreadable config must produce a clear filesystem error and no state mutation.

Invalid state must block workflow mutation until repaired or explicitly reinitialized.

Invalid phase transition proposals must be rejected and logged.

Missing required artifacts must block transition.

A valid proposal that claims missing, empty, or unchanged required artifacts must block transition.

Non-zero agent exit must block by default.

Timeouts must block by default.

Pre-existing uncommitted Git changes must block diff-checked agent phases by default.

Protected path violations must block by default.

Unauthorized file changes must block by default.

If tests cannot be run because no command is configured, the result must be recorded as "not run" rather than "passed".

If redaction fails or cannot confidently sanitize a stream selected for persistence, the orchestrator should prefer not persisting that stream.

## Edge Cases

The config file is missing.

Both `.agent-flow.json` and `.agent-flow.yaml` exist.

The config file is empty.

The config file exists but cannot be read because of permissions, locking, or filesystem errors.

The JSON config has comments or trailing commas.

The state file is missing.

The state file is invalid JSON.

The current phase is unknown.

The next actor is unknown.

A user gate is active.

A workflow actor lock exists.

An OS-level CLI lock exists.

A lock appears stale.

The agent command is unavailable.

The agent command hangs.

The agent exits non-zero.

The agent writes partial artifacts then crashes.

The agent omits `next_state_proposal.json`.

The proposal is syntactically invalid.

The proposal requests a forbidden phase transition.

The proposal declares an artifact that is missing, empty, or not actually updated.

The review iteration limit is reached.

The project is not a Git repository.

Git reports changed files before agent invocation.

Windows path casing could bypass protected paths.

Backslash separators could bypass glob checks.

Symlinks point outside the workspace.

Generated artifacts exceed diff limits.

Blocked command patterns vary by shell or whitespace.

Captured stdout contains secrets.

Prompt files contain sensitive project snippets.

Transcript capture is accidentally enabled.

## Security Considerations

The orchestrator will run locally with the user's filesystem permissions, so safety checks must assume the tool can cause meaningful damage if misconfigured.

Supply-chain exposure must be minimized by avoiding unnecessary runtime dependencies.

The ratified safest v1 config path is JSON-first because it uses built-in parsing and avoids both YAML parser dependency risk and custom YAML parser correctness risk.

Secret-bearing values must not be persisted in logs, prompts, or transcripts without redaction.

Protected path checks must be deterministic across Windows and POSIX path styles.

Symlink resolution must be considered part of path safety.

Destructive command detection must not rely only on naive substring checks.

Agent output is untrusted for state transition purposes.

Agent proposals are suggestions, not authority.

User gates are security boundaries.

## Performance Considerations

The CLI should start quickly and avoid loading optional adapters unless needed.

Config and state files are expected to be small.

Diff checks should use Git when available for performance and correctness.

Large stdout/stderr streams should be capped according to configured limits.

Prompt assembly should avoid repeatedly reading large project files unless configured.

Redaction may initially operate on captured bounded strings; streaming-compatible redaction can be planned later if output volume requires it.

## Compatibility Considerations

The CLI should target Node.js LTS.

The source should use TypeScript strict mode.

The emitted JavaScript should run without TypeScript runtime hooks.

Tests should use Node's built-in `node:test` against emitted JavaScript where practical. During development, the test path should compile TypeScript first and then run `node --test` on the build output, avoiding runtime TS loaders such as `tsx` or `ts-node` in the core path.

Windows must be treated as a first-class environment because the current project is on Windows.

Path matching must normalize:

- `/`
- `\`
- drive-letter casing
- case sensitivity where relevant
- symlink-real paths where possible

The repository layout of orchestrated projects must remain configurable.

## Testing Strategy

Unit tests should cover:

- command parsing
- JSON config loading
- config defaulting
- config validation
- state validation
- phase transition validation
- user gate blocking
- proposal validation
- path normalization
- protected path matching
- Windows path behavior
- symlink escape detection where supported
- allowed change manifest validation
- diff result interpretation
- secret redaction
- log entry creation
- prompt rendering
- adapter command construction
- timeout handling
- non-zero exit handling
- unreadable config handling
- proposal and artifact cross-check behavior

Integration tests should cover:

- `agent-flow init`
- `agent-flow status`
- `agent-flow config validate`
- `agent-flow next` with a fake agent command
- unauthorized file change blocking
- missing artifact blocking
- invalid proposal blocking
- proposal claims missing artifact blocking
- user gate blocking
- dirty working tree blocking for diff-checked phases

Tests should run through compiled JavaScript with Node's built-in test runner. If a package manager is selected for the orchestrator repository itself, scripts may wrap the build and test commands, but the underlying test path should avoid runtime TypeScript execution dependencies.

The implementation Plan should pin the exact build and test commands after the repository package manager and script layout are chosen.

## Open Questions

If YAML is later supported, should it use an internal subset parser or an optional external dependency?

Should redacted generated prompt files later support a failed-runs-only persistence mode in addition to explicit configuration?

Should redacted transcript capture be added after v1, given that v1 transcript capture defaults to off?

Should `run-until-user-gate` be implemented immediately after assisted `next` and core guardrails are stable, or delayed further?

How should stale OS-level locks be reset without weakening safety?

Should non-Git projects be limited mode only, or should snapshot-baseline diffing be first-class in a later version?

Should config comments be supported through a future `.agent-flow.jsonc`, or should plain JSON remain the only supported core config?

## User Decisions Required

No blocking user decisions remain before `plan_creation`.

Ratified decisions for planning:

- v1 core config is JSON-only with `.agent-flow.json`; YAML is deferred.
- Full guardrail enforcement requires Git with a clean working tree; non-Git repositories run in limited guardrail mode for v1.
- Transcript capture defaults to off in v1.
- Redacted prompt files are persisted only when configured, not by default.
- `run-until-user-gate` follows after assisted `next` and core guardrails are stable.
- JSONC may be considered later if config comments become important.
- Protocol-level `.agent/workflow_state.json` and `.agent/agent_log.md` for this project's own development workflow can wait until before any automated/polling handoff loop.
