# Requirement Understanding

## Summary

This project will design and later implement a deterministic local CLI workflow orchestrator for coordinating multiple AI coding agents, especially Codex and Claude Code.

The selected product form is Option B: an independent local CLI with repo-local configuration, state, artifacts, and logs. The CLI should be usable across different repositories without assuming a fixed language, package manager, directory layout, or test command.

The orchestrator is not an LLM agent. It is a controller responsible for workflow state, phase transitions, user gates, artifacts, logs, guardrails, diff checks, and agent invocation. Codex, Claude Code, and future agents remain workers. The user remains the final authority.

The design and implementation of this project itself must follow the user's existing AI Agent Standard Development Workflow and Agent Handoff Automation Protocol for now.

## Product Intent

The product exists to reduce manual handoff work between AI development agents while preserving review discipline, explicit user approval, and safety boundaries.

The current manual protocol coordinates agents through shared files such as `.agent/workflow_state.json`, `.agent/handoff.md`, and `.agent/agent_log.md`. The new orchestrator should keep the useful parts of that protocol while moving canonical state ownership and safety validation from agents into a deterministic CLI.

The central safety improvement is that agents should not directly finalize workflow state transitions. Agents may produce artifacts and a machine-readable next-state proposal, but the orchestrator should validate the proposal and write the canonical state.

## Target Users

The primary user is an individual developer who uses multiple AI coding agents in a structured development workflow and wants the resulting tool preserved on GitHub for personal use.

Secondary users may include developers or small teams who want controlled semi-automatic handoff between implementation and review agents, with strong limits around user gates, protected paths, unauthorized changes, and verification claims.

The product should not optimize first for enterprise distribution, SaaS operation, marketplace plugins, or GUI workflows. It should optimize first for local reliability, auditability, and safe personal workflow automation.

## Core User Scenarios

1. A user initializes the orchestrator in an existing project with `agent-flow init`.
2. The orchestrator creates repo-local config, state, artifact, and log locations without imposing a project-specific layout.
3. The user runs `agent-flow status` to inspect the current workflow phase, next actor, active user gates, artifact status, lock status, and latest handoff summary.
4. The user runs `agent-flow next` to execute exactly one workflow phase in assisted mode.
5. The orchestrator assembles a phase-specific prompt, invokes the configured agent adapter, captures output, validates artifacts, evaluates guardrails, and updates canonical state only if the transition is allowed.
6. When user review, approval, verification, destructive action approval, protected path approval, plan deviation approval, credential access, or production data access is required, the orchestrator stops and sets the workflow to a user gate.
7. The user may later choose safer multi-step automation such as `run-until-user-gate`, but only after assisted mode is reliable.

## Functional Requirements

The orchestrator must load project configuration from `.agent-flow.yaml` by default.

The orchestrator must support configurable state, artifact, and log directories. `.agent/` may be the default, but it must not be hardcoded into core behavior.

The orchestrator must support the standard workflow phases:

- `requirement_understanding`
- `spec_creation`
- `spec_review`
- `spec_review_response`
- `user_spec_review`
- `plan_creation`
- `plan_review`
- `plan_review_response`
- `user_plan_approval`
- `task_classification`
- `implementation`
- `implementation_review`
- `implementation_review_response`
- `testing`
- `user_verification`
- `final_handoff`
- `done`

The orchestrator must support blocking states for invalid transitions, unresolved locks, exceeded iteration limits, unauthorized changes, failed guardrails, missing artifacts, timeouts, non-zero agent exits, and active user gates.

The orchestrator must provide at least these initial commands:

- `agent-flow init`
- `agent-flow status`
- `agent-flow next`
- `agent-flow config validate`

The orchestrator should later support:

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

The orchestrator must manage phase-specific prompt templates.

The orchestrator must support agent adapters for Codex CLI and Claude Code CLI first, while allowing future adapters for Gemini CLI, OpenCode, Cursor, Antigravity CLI, and custom shell commands.

The orchestrator must capture agent stdout, stderr, exit code, duration, artifacts updated, files changed, guardrail result, and proposed next phase.

The orchestrator must maintain append-only run logs and avoid storing secrets.

## Non-Functional Requirements

The CLI should be local-first, deterministic, reviewable, and lightweight.

Runtime dependency count should be minimized because recent software supply-chain attacks make unnecessary third-party dependencies a material risk.

The core runtime should prefer Node.js built-in APIs and small internal implementations where practical.

The CLI should keep core logic independent of any specific CLI framework, package manager, schema validation library, YAML parser, or agent CLI flag convention.

The implementation should favor simple, explicit, testable modules over broad abstractions.

The tool should be suitable for long-term personal preservation in a GitHub repository.

## Architecture Requirements

The architecture should separate these responsibilities:

- CLI command parsing and command dispatch
- config loading, defaulting, and validation
- conservative config file parsing
- workflow state storage
- finite-state machine transition validation
- user gate control
- artifact management
- prompt assembly
- agent adapter invocation
- stdout, stderr, and transcript capture
- guardrail evaluation
- diff and protected-path checks
- append-only logging
- error reporting

The CLI layer should remain thin. The state machine, validators, guardrails, prompt assembly, and adapters should be testable as core modules.

The initial product form should be an independent local CLI. Repositories using it should contain only configuration, state, artifacts, and logs unless the user chooses otherwise.

## Security and Safety Requirements

The orchestrator must never skip user gates.

The orchestrator must stop for:

- user spec review
- user plan approval
- user decision
- user verification
- destructive action approval
- protected path approval
- plan deviation approval
- production data or credential access approval
- exceeded review iteration limits
- missing required artifacts
- invalid next-state proposals
- unauthorized file changes
- command timeout
- non-zero agent exit, unless explicitly configured as non-blocking for a phase

The orchestrator should support two levels of path protection:

- always protected paths
- protected unless explicitly authorized paths

Always protected examples include:

- `.env`
- `.env.*`
- `.git/**`
- `node_modules/**`
- `dist/**`
- `build/**`
- `coverage/**`

Protected unless explicitly authorized examples include:

- `package.json`
- lockfiles
- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/**`

The orchestrator must not treat test, build, lint, typecheck, visual verification, or manual verification as passed unless the command or verification was actually performed.

## Configurability Requirements

The default config file should be `.agent-flow.yaml`.

Because runtime dependency minimization is a requirement, the config format should use a conservative YAML subset rather than relying on full YAML behavior. Unsupported YAML constructs should produce clear errors instead of being interpreted incorrectly.

The configuration must allow overriding:

- workspace root
- state directory
- artifact directory
- log directory
- agent commands
- agent arguments
- agent environment variables
- input and output modes
- source-of-truth documents
- protected paths
- test, build, lint, and typecheck commands
- package manager detection behavior
- automation mode
- review iteration limits
- diff limits
- timeout limits
- guardrail policies
- project context files

Defaults should make the tool usable quickly, but project-specific behavior must remain configurable.

## Agent Integration Requirements

Agent integration should be represented through adapters.

Each adapter should support:

- command
- args
- environment variables
- input mode
- output mode
- working directory
- timeout
- stdout capture
- stderr capture
- exit code handling
- optional transcript capture

The core state machine must not hardcode Codex or Claude Code CLI flags.

Prompt assembly should be template-based and phase-aware.

Prompts should include:

- current phase
- current state summary
- current actor
- next actor
- role assignment
- relevant artifact paths
- relevant previous artifacts
- configured project context
- required output format
- required stop condition
- guardrail constraints
- recommended Superpowers skill, when available

## In Scope

The full product scope includes deterministic local orchestration for the user's standard AI development workflow.

The initial MVP should include:

- independent CLI project skeleton
- internal command parser or very small command layer
- `.agent-flow.yaml` loading using a conservative internal parser
- internal config validation
- internal state validation
- config defaults
- state initialization
- state transition validation
- user gate enforcement
- artifact path management
- handoff document support
- append-only run logging
- prompt template loading
- assisted mode with `agent-flow next`
- basic agent adapter invocation
- stdout and stderr capture
- command timeout handling
- non-zero exit handling
- protected path checks
- basic diff checks
- basic allowed change manifest representation
- tests for config, state, transitions, guardrails, and command behavior

The broader implementation should continue past MVP until the requirements in the design brief are satisfied, while still using review and user approval gates.

## Out of Scope

The project should not be designed as:

- a new LLM agent
- a replacement for Codex or Claude Code
- uncontrolled full automation
- a cloud service
- a GUI-first product
- a fixed project-specific script
- a general CI/CD platform
- a package manager wrapper
- a test runner replacement
- an agent-to-agent recursive calling system

The initial implementation should not prioritize:

- plugin marketplace
- remote execution
- multi-repository orchestration
- parallel agent execution
- complex web dashboard
- team administration features
- SaaS authentication or billing

## Confirmed Technical Decisions

Product form: independent local CLI with repo-local config, state, artifacts, and logs.

Initial audience: personal use, preserved on GitHub.

Workflow standard for this project: the user's AI Agent Standard Development Workflow and Agent Handoff Automation Protocol.

Canonical state ownership: orchestrator-owned.

Agent output model: agents produce artifacts and `next_state_proposal.json`; the orchestrator validates and writes canonical `workflow_state.json`.

Initial automation mode: assisted mode, one phase per command.

Dependency policy: runtime dependencies should be avoided when the functionality can be implemented internally at reasonable complexity and risk.

Config parsing policy: prefer a conservative internal YAML subset parser over full YAML dependency behavior, unless later review shows this creates more risk than it removes.

Schema validation policy: implement internal path-aware validators instead of adopting Zod, Valibot, TypeBox, Ajv, or similar libraries in the runtime core.

Testing preference: prefer Node.js built-in `node:test` where adequate.

Likely implementation language: TypeScript strict on Node.js LTS.

## Assumptions

The user is willing to trade some initial implementation speed for reduced runtime supply-chain exposure.

The CLI can be distributed through GitHub first and later packaged more formally if desired.

The user values deterministic safety behavior more than full automation speed.

The current two-agent default remains Codex for implementation and Claude Code for review, but project-specific overrides must be supported.

Full YAML compatibility is not required for MVP if the accepted subset is documented and validation errors are clear.

Git will usually be available for diff checks, but the design must define fallback behavior for non-Git directories.

## Risks

Implementing config parsing and schema validation internally increases the amount of code that must be tested.

An overly limited YAML subset may surprise users if the error messages are not clear.

If adapter behavior is too generic, agent-specific usability may suffer. If it is too specific, extensibility will suffer.

Allowed change manifest extraction from Markdown may be unreliable unless a machine-readable representation is required.

Agent CLIs may change behavior, flags, output format, or exit behavior over time.

Running external agent commands can modify files outside the intended scope, so post-run diff and guardrail checks are mandatory.

GitHub preservation for personal use does not eliminate the need for careful secret handling in logs and artifacts.

## Initial Edge Cases

The config file is missing.

The config file uses unsupported YAML syntax.

The state file is missing.

The state file exists but is invalid JSON.

The state file has an unknown phase.

The state file has an active user gate.

The workflow is locked by another actor.

The lock appears stale.

The configured agent command is missing.

The agent command times out.

The agent exits with a non-zero code.

The agent produces no required artifact.

The agent produces an invalid `next_state_proposal.json`.

The proposed phase transition is invalid.

The review iteration limit has been reached.

Protected paths are changed.

Files outside the allowed change manifest are changed.

The project is not a Git repository.

No test command is configured.

Tests cannot be run safely.

The user requests a plan deviation.

The workflow requires credentials or production data access.

## Open Questions

Should `.agent-flow.yaml` remain the only config format, or should `.agent-flow.json` be supported as a dependency-free alternative?

How strict should the conservative YAML subset be in v1?

Should the allowed change manifest live inside the Plan Markdown, in a separate YAML/JSON artifact, or both?

Should `run-until-user-gate` be implemented immediately after `agent-flow next`, or delayed until all single-step guardrails are proven?

How should stale locks be detected and reset without weakening safety?

What fallback diff mechanism should be used outside Git repositories?

Should generated prompt files be persisted for every run by default?

Should transcript capture be enabled by default or opt-in to reduce accidental sensitive logging?

## User Decisions Required

The user should confirm whether JSON config should be supported alongside `.agent-flow.yaml` to reduce parser complexity and dependency risk.

The user should confirm whether `run-until-user-gate` belongs in the first full implementation wave or should follow after assisted mode is stable.

The user should decide whether transcript capture should default to off, on, or redacted-on.

The user should decide whether Git must be required for full guardrail enforcement or whether non-Git fallback should be a first-class mode.
