# Agent Workflow Orchestrator MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP local CLI for deterministic AI-agent workflow orchestration with JSON-only v1 config, canonical state initialization, assisted `next`, basic agent invocation, logs, artifacts, and guardrails.

**Architecture:** The CLI layer stays thin and delegates to focused core modules for config, state, workflow transitions, artifacts, logs, prompts, adapters, and guardrails. Runtime code uses Node.js built-ins only; TypeScript and Node type declarations are development dependencies only. Full diff guardrails require Git with a clean working tree; non-Git workspaces run in limited guardrail mode.

**Tech Stack:** Node.js LTS, TypeScript strict, npm for this orchestrator repository, Node built-in `node:test`, zero third-party runtime dependencies.

---

## Approval Staging

This Plan describes the MVP roadmap, but implementation approval should be staged.

Wave 1 approval covers Tasks 1-6 only:

- repository bootstrap
- CLI parser and command dispatch skeleton
- JSON config loading/defaulting/validation
- state schema, transitions, phase actor ownership, user gates, and iteration counters
- `init`, `status`, and `config validate`
- artifacts, allowed manifest schema, redaction, prompt rendering, and append-only logs

Wave 1 explicitly excludes child-process agent execution and Git diff guardrail enforcement.

Wave 2 approval covers Tasks 7-8 only, after Wave 1 has been implemented, reviewed, and accepted:

- agent adapter and `child_process` runner
- assisted `next` invoking configured agent commands
- OS-level CLI lock enforcement around execution
- Git clean-tree checks, post-run diff checks, protected path checks, and symlink-aware path resolution
- negative-path safety tests around agent failures and unauthorized changes

Task 9 applies to each approved wave as verification and handoff. The user may still approve the whole MVP at once, but that should be an explicit decision at the `user_plan_approval` gate.

## Objective

Implement the first safe MVP of `agent-flow` as an independent local CLI that can initialize workflow files, report status, validate JSON config, run one assisted workflow phase through a configured agent command, capture redacted output, validate state transitions, append logs, and enforce initial guardrails.

## Preconditions

- The revised Spec is approved for planning.
- v1 config is JSON-only with `.agent-flow.json`; YAML is deferred.
- Full guardrail enforcement requires Git and a clean working tree.
- Non-Git workspaces use limited guardrail mode in v1.
- Transcript capture is off in v1.
- Redacted prompt files are persisted only when configured.
- `run-until-user-gate` is deferred until assisted `next` and guardrails are stable.
- No implementation begins until this Plan is reviewed and explicitly approved by the user.

## Files to Inspect

- `Agent Workflow Orchestrator Desig.txt`
- `.agent/artifacts/requirement_understanding.md`
- `.agent/artifacts/requirement_understanding_review.md`
- `.agent/artifacts/requirement_understanding_review_response.md`
- `.agent/artifacts/spec.md`
- `.agent/artifacts/spec_review.md`
- `.agent/artifacts/spec_review_response.md`
- `.agent/handoff.md`

## Files to Create

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.gitignore`
- `src/cli/main.ts`
- `src/cli/args.ts`
- `src/cli/output.ts`
- `src/commands/init.ts`
- `src/commands/status.ts`
- `src/commands/config-validate.ts`
- `src/commands/next.ts`
- `src/core/result.ts`
- `src/core/errors.ts`
- `src/core/json.ts`
- `src/config/defaults.ts`
- `src/config/load.ts`
- `src/config/schema.ts`
- `src/state/schema.ts`
- `src/state/store.ts`
- `src/workflow/phases.ts`
- `src/workflow/actors.ts`
- `src/workflow/transitions.ts`
- `src/workflow/gates.ts`
- `src/locks/lockfile.ts`
- `src/artifacts/paths.ts`
- `src/artifacts/manifest.ts`
- `src/prompts/render.ts`
- `src/prompts/templates.ts`
- `src/agents/adapter.ts`
- `src/agents/runner.ts`
- `src/logging/redact.ts`
- `src/logging/run-log.ts`
- `src/guards/path-patterns.ts`
- `src/guards/git-diff.ts`
- `src/guards/policy.ts`
- `test/unit/config.test.ts`
- `test/unit/args.test.ts`
- `test/unit/state.test.ts`
- `test/unit/transitions.test.ts`
- `test/unit/actors.test.ts`
- `test/unit/redact.test.ts`
- `test/unit/path-patterns.test.ts`
- `test/unit/lockfile.test.ts`
- `test/integration/init-status.test.ts`
- `test/integration/config-validate.test.ts`
- `test/integration/next-fake-agent.test.ts`
- `test/fixtures/fake-agent.mjs`
- `test/fixtures/fake-agent-invalid-proposal.mjs`
- `test/fixtures/fake-agent-missing-artifact.mjs`
- `test/fixtures/fake-agent-nonzero.mjs`
- `test/fixtures/fake-agent-timeout.mjs`
- `.agent/artifacts/test_results.md`

## Files to Modify

- `.agent/handoff.md` after Plan review handoff only.
- `.agent/artifacts/plan.md` only if the review requires revisions.

## Expected Changes by File

- `package.json`: define package metadata, CLI bin, build/test scripts, and dev dependencies only.
- `package-lock.json`: lock TypeScript-related dev dependencies.
- `tsconfig.json`: strict TypeScript compile to `dist/`.
- `.gitignore`: ignore `node_modules/`, `dist/`, coverage, temp files, and local runtime output where appropriate.
- `src/cli/*`: parse commands and print deterministic output.
- `src/commands/*`: implement `init`, `status`, `config validate`, and assisted `next`.
- `src/core/*`: shared result/error/JSON helpers.
- `src/config/*`: JSON-only config loading, defaulting, and path-aware validation.
- `src/state/*`: canonical workflow state schema, validation, read/write helpers.
- `src/workflow/*`: phase enum, phase actor ownership, transition table, user gate and iteration-limit checks.
- `src/locks/*`: OS-level CLI lockfile acquisition and release.
- `src/artifacts/*`: artifact path defaults and allowed change manifest validation.
- `src/prompts/*`: phase prompt rendering and optional redacted prompt persistence.
- `src/agents/*`: command adapter and process runner with timeout/non-zero handling.
- `src/logging/*`: secret redaction and append-only JSONL log writer.
- `src/guards/*`: protected path checks, Git clean-tree checks, basic diff summaries.
- `test/*`: unit and integration coverage for the MVP behavior.

## Implementation Sequence

1. Bootstrap repository and TypeScript build.
2. Add core result/error helpers and command parsing.
3. Implement JSON-only config defaults and validation.
4. Implement workflow state schema, transitions, and gate checks.
5. Implement `init`, `status`, and `config validate`.
6. Implement artifacts, logs, redaction, and prompt rendering.
7. After explicit Wave 2 approval, implement agent adapter/runner and `next` orchestration with fake-agent positive and negative integration paths.
8. After explicit Wave 2 approval, implement protected path, allowed manifest, Git clean-tree, symlink-aware path, and unauthorized-change guardrails.
9. Run full verification for the approved wave, update handoff, and stop for the next review or user gate.

## Task Breakdown

### Task 1: Repository Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Expected generated: `package-lock.json`

- [ ] **Step 1: Write package metadata and scripts**

Create `package.json` with no runtime dependencies:

```json
{
  "name": "agent-workflow-orchestrator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "agent-flow": "./dist/src/cli/main.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build && node --test \"dist/test/**/*.test.js\"",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Add strict TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": false,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Add ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.tmp/
*.log
```

- [ ] **Step 4: Install dev dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and no runtime dependencies are installed.

- [ ] **Step 5: Verify dependency shape**

Run:

```bash
npm ls --omit=dev
```

Expected: npm reports no third-party runtime dependency tree beyond this package.

### Task 2: Core Result Helpers and CLI Parser

**Files:**
- Create: `src/core/result.ts`
- Create: `src/core/errors.ts`
- Create: `src/cli/args.ts`
- Create: `src/cli/output.ts`
- Create: `src/cli/main.ts`
- Test: `test/unit/args.test.ts`

- [ ] **Step 1: Add result primitives**

Create `src/core/result.ts`:

```ts
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: AppError };
export type Result<T> = Ok<T> | Err;

export type AppError = {
  code: string;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
};

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(error: AppError): Err {
  return { ok: false, error };
}
```

- [ ] **Step 2: Add error helpers**

Create `src/core/errors.ts`:

```ts
import type { AppError } from "./result.js";

export function validationError(path: string, message: string): AppError {
  return { code: "VALIDATION_ERROR", path, message };
}

export function filesystemError(message: string, path?: string): AppError {
  return { code: "FILESYSTEM_ERROR", path, message };
}

export function usageError(message: string): AppError {
  return { code: "USAGE_ERROR", message };
}
```

- [ ] **Step 3: Add command parser**

Create `src/cli/args.ts` with support for:

```ts
export type CliCommand =
  | { name: "init"; flags: Record<string, string | boolean> }
  | { name: "status"; flags: Record<string, string | boolean> }
  | { name: "config-validate"; flags: Record<string, string | boolean> }
  | { name: "next"; flags: Record<string, string | boolean> }
  | { name: "help"; flags: Record<string, string | boolean> };
```

Parsing rules:

- `agent-flow init`
- `agent-flow status`
- `agent-flow config validate`
- `agent-flow next`
- `--config <path>`
- `--workspace <path>`
- boolean flags such as `--strict`

- [ ] **Step 4: Write parser unit tests**

Create `test/unit/args.test.ts` covering:

- `init`
- `status`
- `config validate`
- `next`
- `--config <path>`
- `--workspace <path>`
- boolean `--strict`
- unknown command failure

- [ ] **Step 5: Add CLI entrypoint**

Create `src/cli/main.ts` that parses `process.argv.slice(2)`, dispatches to command handlers, prints errors to stderr, and exits with code `1` on failure.

- [ ] **Step 6: Verify build**

Run:

```bash
npm run build
```

Expected: TypeScript compiles after minimal command handler exports are added or after command files are added in Task 5.

### Task 3: JSON Config Defaults and Validation

**Files:**
- Create: `src/core/json.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/schema.ts`
- Create: `src/config/load.ts`
- Test: `test/unit/config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create tests that assert:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyConfigDefaults, validateConfig } from "../../src/config/schema.js";

test("validates defaulted JSON-only config", () => {
  const result = validateConfig(applyConfigDefaults({ version: 1 }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.workspace.stateDir, ".agent");
    assert.equal(result.value.mode.default, "assisted");
  }
});

test("rejects YAML config marker as unsupported in v1", () => {
  const result = validateConfig({ version: 1, configFormat: "yaml" });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Implement config types and defaults**

`src/config/schema.ts` must define:

```ts
export type AutomationMode = "advisory" | "assisted";
export type AgentRole = "implementation" | "review";
export type AgentConfig = {
  role: AgentRole;
  name: string;
  command: string;
  args: string[];
  inputMode: "stdin";
  outputMode: "stdout";
  timeoutSeconds: number;
};
export type AgentFlowConfig = {
  version: 1;
  workspace: {
    root: string;
    stateDir: string;
    artifactDir: string;
    promptDir: string;
    logDir: string;
  };
  mode: {
    default: AutomationMode;
  };
  agents: {
    implementation: AgentConfig;
    review: AgentConfig;
  };
  guardrails: {
    requireGitForFullGuardrails: boolean;
    requireCleanWorkingTree: boolean;
    protectedPaths: string[];
    protectedUnlessExplicitlyAllowed: string[];
    blockedCommands: string[];
  };
  limits: {
    maxChangedFiles: number;
    maxAddedLines: number;
    maxDeletedLines: number;
    commandTimeoutSeconds: number;
    maxSpecReviewIterations: number;
    maxPlanReviewIterations: number;
    maxImplementationReviewIterations: number;
  };
  commands: {
    typecheck: string | null;
    lint: string | null;
    test: string | null;
    build: string | null;
  };
  projectContext: {
    sourceOfTruth: string[];
    files: string[];
    extraInstructions: string[];
  };
  artifacts: {
    allowedChangeManifest: string;
  };
  logging: {
    transcriptCapture: "off";
    persistPrompts: "off" | "configured";
  };
};
```

- [ ] **Step 3: Implement JSON loading**

`src/config/load.ts` must:

- read `.agent-flow.json` by default
- reject `.agent-flow.yaml` in v1 with an unsupported-config-format error
- return clear errors for missing, unreadable, invalid JSON, and wrong root type
- never mutate files

- [ ] **Step 4: Run config tests**

Run:

```bash
npm test
```

Expected: config tests pass after implementation.

### Task 4: State Schema, Transitions, and Gates

**Files:**
- Create: `src/state/schema.ts`
- Create: `src/state/store.ts`
- Create: `src/workflow/phases.ts`
- Create: `src/workflow/actors.ts`
- Create: `src/workflow/transitions.ts`
- Create: `src/workflow/gates.ts`
- Test: `test/unit/state.test.ts`
- Test: `test/unit/transitions.test.ts`

- [ ] **Step 1: Write state validation tests**

Tests must cover:

- initial state is valid
- unknown phase is rejected
- active user gate blocks `next`
- invalid transition is rejected
- phase actor ownership is correct
- review iteration limit blocks the next review loop

- [ ] **Step 2: Define phases and transitions**

`src/workflow/phases.ts` must export the phase list from the Spec.

`src/workflow/actors.ts` must export phase ownership:

- implementation phases: `requirement_understanding`, `spec_creation`, `spec_review_response`, `plan_creation`, `plan_review_response`, `task_classification`, `implementation`, `implementation_review_response`, `testing`, `final_handoff`
- review phases: `spec_review`, `plan_review`, `implementation_review`
- user phases: `user_spec_review`, `user_plan_approval`, `user_verification`
- none phase: `done`

`src/workflow/transitions.ts` must allow only:

```text
requirement_understanding -> spec_creation
spec_creation -> spec_review
spec_review -> spec_review_response | user_spec_review
spec_review_response -> spec_review
user_spec_review -> plan_creation
plan_creation -> plan_review
plan_review -> plan_review_response | user_plan_approval
plan_review_response -> plan_review
user_plan_approval -> task_classification
task_classification -> implementation
implementation -> implementation_review
implementation_review -> implementation_review_response | testing
implementation_review_response -> implementation_review
testing -> user_verification
user_verification -> final_handoff
final_handoff -> done
```

- [ ] **Step 3: Define state schema**

`src/state/schema.ts` must include:

- `workflow`
- `version`
- `phase`
- `status`
- `currentActor`
- `nextActor`
- lock fields
- `agents`
- `currentTask`
- `artifacts`
- `gates`
- `limits`
- `iterationCounters`
- `lastActor`
- `lastAction`
- `updatedAt`

- [ ] **Step 4: Implement atomic state read/write**

`src/state/store.ts` must read JSON state, validate it, and write updates via temp file plus rename.

- [ ] **Step 5: Implement iteration limit checks**

`src/workflow/gates.ts` must compare config limits with state iteration counters for `spec_review`, `plan_review`, and `implementation_review`. At the configured max, it must block and require user decision rather than continuing the loop.

- [ ] **Step 6: Run state tests**

Run:

```bash
npm test
```

Expected: state and transition tests pass.

### Task 5: Init, Status, and Config Validate Commands

**Files:**
- Create: `src/commands/init.ts`
- Create: `src/commands/status.ts`
- Create: `src/commands/config-validate.ts`
- Modify: `src/cli/main.ts`
- Test: `test/integration/init-status.test.ts`
- Test: `test/integration/config-validate.test.ts`

- [ ] **Step 1: Write integration tests for init/status**

Tests must create a temp directory and assert `agent-flow init` creates:

- `.agent-flow.json`
- `.agent/workflow_state.json`
- `.agent/handoff.md`
- `.agent/logs/agent_log.md`
- `.agent/logs/runs.jsonl`
- `.agent/artifacts/`
- `.agent/prompts/`
- `.agent/logs/`

- [ ] **Step 2: Implement `init`**

`init` must:

- create absent files/directories only
- never overwrite existing files without explicit future confirmation support
- initialize state at `requirement_understanding`
- use JSON-only config

- [ ] **Step 3: Implement `status`**

`status` must print:

- phase
- status
- current actor
- next actor
- active gates
- lock summary
- next required action

- [ ] **Step 4: Implement `config validate`**

`config validate` must parse config, apply defaults, validate, and print either `Config valid` or path-aware errors.

- [ ] **Step 5: Run integration tests**

Run:

```bash
npm test
```

Expected: init/status/config validate tests pass in isolated temp directories.

### Task 6: Artifacts, Redaction, Prompt Rendering, and Logs

**Files:**
- Create: `src/artifacts/paths.ts`
- Create: `src/artifacts/manifest.ts`
- Create: `src/prompts/render.ts`
- Create: `src/prompts/templates.ts`
- Create: `src/logging/redact.ts`
- Create: `src/logging/run-log.ts`
- Test: `test/unit/redact.test.ts`

- [ ] **Step 1: Write redaction tests**

Tests must assert redaction for:

- `OPENAI_API_KEY=sk-test`
- `ANTHROPIC_API_KEY=secret`
- `GITHUB_TOKEN=ghp_example`
- `Authorization: Bearer abc123`
- private key block markers

- [ ] **Step 2: Implement artifact path defaults**

`src/artifacts/paths.ts` must map the standard artifact names to `.agent/artifacts/*.md` and allow config overrides.

- [ ] **Step 3: Implement allowed change manifest schema**

`src/artifacts/manifest.ts` must validate a machine-readable JSON manifest with:

- `filesToInspect`
- `filesToModify`
- `filesToCreate`
- `forbiddenPaths`
- `dependencyChanges.allowed`
- `migrationChanges.allowed`
- `destructiveActions.allowed`

The active manifest path for MVP defaults to `.agent/artifacts/allowed_change_manifest.json` and is configurable through `config.artifacts.allowedChangeManifest`.

- [ ] **Step 4: Implement prompt rendering**

`src/prompts/templates.ts` must include templates for MVP phases used by `next`. `src/prompts/render.ts` must render deterministic text from state, config, artifact paths, role, stop condition, and guardrails.

- [ ] **Step 5: Implement append-only run logging**

`src/logging/run-log.ts` must append redacted JSONL entries to `.agent/logs/runs.jsonl`.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: redaction and artifact tests pass.

### Task 7: Agent Adapter, Runner, and Assisted Next

**Files:**
- Create: `src/agents/adapter.ts`
- Create: `src/agents/runner.ts`
- Create: `src/commands/next.ts`
- Create: `src/locks/lockfile.ts`
- Modify: `src/cli/main.ts`
- Test: `test/fixtures/fake-agent.mjs`
- Test: `test/fixtures/fake-agent-invalid-proposal.mjs`
- Test: `test/fixtures/fake-agent-missing-artifact.mjs`
- Test: `test/fixtures/fake-agent-nonzero.mjs`
- Test: `test/fixtures/fake-agent-timeout.mjs`
- Test: `test/integration/next-fake-agent.test.ts`

- [ ] **Step 1: Write fake agent fixture**

`test/fixtures/fake-agent.mjs` must write a configured artifact and `next_state_proposal.json`, then exit with code `0`.

- [ ] **Step 2: Write `next` integration test**

The test must:

- initialize temp workspace
- configure implementation agent command as `node test/fixtures/fake-agent.mjs`
- run `agent-flow next`
- assert one phase runs
- assert state advances only after valid proposal
- assert run log is appended

- [ ] **Step 3: Write negative-path `next` tests**

The integration test must also assert:

- non-zero fake agent exit blocks state advancement
- timeout fake agent blocks state advancement
- missing `next_state_proposal.json` blocks state advancement
- syntactically invalid proposal blocks state advancement
- proposal claiming a missing artifact blocks state advancement
- active user gate blocks agent invocation

- [ ] **Step 4: Implement OS-level CLI lockfile**

`src/locks/lockfile.ts` must acquire a lockfile before agent execution and release it after completion. If the lock exists, `next` must fail without invoking the agent. Stale-lock aging policy is deferred, but the lock must record pid, command, and timestamp for diagnosis.

- [ ] **Step 5: Implement agent adapter type**

`src/agents/adapter.ts` must define:

```ts
export type AgentRunRequest = {
  role: "implementation" | "review";
  command: string;
  args: string[];
  cwd: string;
  input: string;
  timeoutMs: number;
};

export type AgentRunResult = {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
};
```

- [ ] **Step 6: Implement process runner**

`src/agents/runner.ts` must use Node `child_process.spawn`, stdin input, timeout, stdout/stderr capture caps, and non-zero exit reporting.

- [ ] **Step 7: Implement `next` orchestration**

`src/commands/next.ts` must:

- reject active user gates
- validate actor for current phase using `src/workflow/actors.ts`
- enforce iteration limits before review loops continue
- acquire OS-level CLI lock before invoking the agent
- render prompt
- optionally persist redacted prompt
- invoke adapter
- validate required artifacts and proposal
- load the active allowed change manifest from `config.artifacts.allowedChangeManifest` when present
- validate transition
- append log
- update state
- release OS-level CLI lock
- stop after one phase

- [ ] **Step 8: Run integration test**

Run:

```bash
npm test
```

Expected: fake-agent `next` test passes.

### Task 8: Guardrails, Path Matching, and Git Diff

**Files:**
- Create: `src/guards/path-patterns.ts`
- Create: `src/guards/git-diff.ts`
- Create: `src/guards/policy.ts`
- Modify: `src/commands/next.ts`
- Test: `test/unit/path-patterns.test.ts`
- Test: `test/integration/next-fake-agent.test.ts`

- [ ] **Step 1: Write path guard tests**

Tests must assert:

- `.GIT\config` matches `.git/**` on Windows-style normalization
- `.env.local` matches `.env.*`
- `node_modules/pkg/index.js` is protected
- protected-unless-authorized files are flagged unless manifest allows them
- symlink escape is detected when the platform allows symlink creation

- [ ] **Step 2: Implement path normalization**

`src/guards/path-patterns.ts` must normalize separators, drive-letter casing, and case-insensitive protected matching for Windows.

- [ ] **Step 3: Implement symlink-aware realpath resolution**

Path checks must call `fs.realpath` or `fs.realpathSync.native` where possible before matching candidate paths. If a path does not exist yet, check the nearest existing parent and the normalized candidate path. If symlink resolution fails unexpectedly, block rather than allow.

- [ ] **Step 4: Implement Git clean-tree check**

`src/guards/git-diff.ts` must run `git status --porcelain` in the workspace. If Git is unavailable or the workspace is not a Git repo, return limited mode. If output is non-empty before a diff-checked phase, block.

- [ ] **Step 5: Implement post-run diff summary**

Use Git diff commands to collect changed files and added/deleted line counts after agent execution. Compare against configured limits and allowed manifest.

- [ ] **Step 6: Wire guardrails into `next`**

`next` must block before invocation for dirty Git tree in diff-checked phases and block after invocation for protected path, symlink escape, or manifest violations.

- [ ] **Step 7: Add unauthorized-change integration tests**

The fake-agent integration suite must assert:

- modifying `.env` blocks
- modifying `.github/workflows/test.yml` blocks unless manifest explicitly permits it
- creating a file outside `filesToCreate` blocks when a manifest is active
- non-Git workspaces report limited guardrail mode

- [ ] **Step 8: Run guardrail tests**

Run:

```bash
npm test
```

Expected: path, symlink, dirty-tree, and unauthorized-change tests pass.

### Task 9: Verification and Handoff

**Files:**
- Modify: `.agent/handoff.md`
- Create or update: `.agent/artifacts/test_results.md` during implementation verification

- [ ] **Step 1: Run full build**

Run:

```bash
npm run build
```

Expected: build passes.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Verify runtime dependency count**

Run:

```bash
npm ls --omit=dev
```

Expected: no third-party runtime dependency tree beyond the package itself.

- [ ] **Step 4: Write test results artifact**

Record commands actually run, pass/fail status, skipped checks, and user verification items in `.agent/artifacts/test_results.md`.

- [ ] **Step 5: Update handoff**

Update `.agent/handoff.md` for implementation review only after implementation is complete. Do not move to implementation without user plan approval.

## Data Structure Changes

MVP introduces these internal data structures:

- `AgentFlowConfig`
- `WorkflowState`
- `NextStateProposal`
- `AllowedChangeManifest`
- `RunLogEntry`
- `AgentRunRequest`
- `AgentRunResult`
- `GuardrailResult`

All persisted machine-readable files use JSON or JSONL in v1.

## API Changes

No public library API is required in MVP.

The CLI command surface introduced by the MVP is:

- `agent-flow init`
- `agent-flow status`
- `agent-flow config validate`
- `agent-flow next`

## UI Changes

No GUI or TUI is included.

CLI output must be plain text, deterministic, and concise.

## Test Plan

Run after each task:

```bash
npm test
```

Run before final handoff:

```bash
npm run build
npm test
npm ls --omit=dev
```

Expected final result:

- build passes
- all unit tests pass
- all integration tests pass
- runtime dependencies remain empty
- fake-agent `next` flow advances exactly one phase
- dirty-tree guardrail blocks diff-checked phases
- non-zero exit, timeout, missing/invalid proposal, missing artifact, user gate, and unauthorized-change paths block safely
- symlink-aware path checks block protected-path escapes where platform support allows testing

## Verification Commands

```bash
npm run build
npm test
npm ls --omit=dev
```

## User Verification Points

- Confirm the CLI command names and output are acceptable for personal workflow use.
- Confirm JSON-only v1 config remains acceptable after seeing the generated `.agent-flow.json`.
- Confirm limited guardrail mode messaging for non-Git workspaces is understandable.
- Confirm `agent-flow next` stopping after one phase matches the intended assisted mode.
- Confirm whether to approve Wave 1 only first, or knowingly approve Wave 1 and Wave 2 together.
- Confirm the MVP should include minimal iteration-limit and symlink realpath checks as planned.

## Rollback / Recovery Considerations

- If repository bootstrap causes dependency concerns, remove `node_modules/`, `package-lock.json`, and package metadata changes before retrying.
- If config/state schema proves too broad, reduce MVP fields to the minimum required by `init`, `status`, and `next`.
- If Git diff checks are unreliable on Windows paths, block full guardrails on affected paths until normalization tests pass.
- If fake-agent integration is flaky, simplify it to deterministic file writes with no timing assumptions.
- If Wave 2 risk feels too broad after Wave 1, pause before agent execution and write a narrower Wave 2 Plan.

## Risks and Edge Cases

- Internal validators may miss malformed data unless tests are thorough.
- JSON config lacks comments in v1.
- Clean-tree requirement may interrupt users with intentional uncommitted work.
- Non-Git limited mode has weaker safety.
- Pattern redaction is best-effort.
- Agent CLI behavior may differ across versions.
- Windows path case and separator behavior must be tested.
- Symlink escape handling is included minimally in MVP, but platform-specific tests may be skipped when symlink creation privileges are unavailable.

## Non-Goals

- No YAML support in v1.
- No JSONC support in v1.
- No `run-until-user-gate` in the first wave.
- No transcript capture in v1.
- No GUI.
- No plugin marketplace.
- No cloud service.
- No multi-repository orchestration.
- No recursive agent-to-agent calls.
- No snapshot-baseline diffing for non-Git repositories in v1.
- No stale-lock aging or automatic stale-lock reset in v1; basic lock presence blocks execution and reports diagnostic metadata.

## Stop Condition

Stop after writing this Plan. Do not implement until the user explicitly approves this Plan.
