# Gate Delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the tightened v1 Gate Delegation feature: `run-until-user-gate --delegated` can auto-clear only `user_plan_approval` when a same-run `plan_review_verdict.json` satisfies the strict approval bar.

**Architecture:** Keep agent-owned phases on the existing `nextCommand()` path. Add structured step metadata so the run-until loop can bind a `plan_review` verdict to the exact step runId that produced it. Add a separate validated non-agent auto-clear transition for `user_plan_approval -> task_classification`, with audit and digest written before delegated completion is reported.

**Tech Stack:** TypeScript, Node.js built-ins only, existing internal validators, existing `Result` error style, Node `node:test`.

---

## Objective

Implement the approved Gate Delegation v1 Spec:

- Default OFF.
- Double opt-in: config `delegation.enabled === true` and CLI `--delegated`.
- V1 delegates only `user_plan_approval`.
- V1 verdict artifact is `.agent/artifacts/plan_review_verdict.json`.
- Verdict must bind to the same delegated-run invocation's successful `plan_review` step runId.
- `.agent-flow.json` is agent-immutable by both default protected paths and a hard-coded guardrail.
- Auto-clear is a validated non-agent transition, not `nextCommand()`.
- Digest write failure is fatal before delegated completion.

## Preconditions

- The user approved the tightened Gate Delegation Spec at `user_spec_review`.
- Do not implement `review_iteration`, `user_verification`, `spec_review` verdict emission, or `implementation_review` verdict emission.
- Do not add runtime dependencies.
- Keep existing non-delegated `run-until-user-gate` behavior unchanged.

## Files To Inspect

- `src/config/schema.ts`
- `src/config/defaults.ts`
- `src/cli/args.ts`
- `src/cli/main.ts`
- `src/cli/output.ts`
- `src/commands/next.ts`
- `src/commands/run-until-user-gate.ts`
- `src/commands/status.ts`
- `src/artifacts/paths.ts`
- `src/prompts/render.ts`
- `src/prompts/templates.ts`
- `src/workflow/run-stop.ts`
- `src/workflow/transitions.ts`
- `src/workflow/actors.ts`
- `src/state/schema.ts`
- `src/state/store.ts`
- `src/locks/lockfile.ts`
- `src/logging/run-log.ts`
- `src/guards/policy.ts`
- `test/unit/config.test.ts`
- `test/unit/args.test.ts`
- `test/unit/prompts.test.ts`
- `test/unit/path-patterns.test.ts`
- `test/integration/next-fake-agent.test.ts`
- `test/integration/run-until-user-gate.test.ts`

## Files To Create

- `src/artifacts/review-verdict.ts`
- `src/workflow/delegation-policy.ts`
- `src/commands/delegated-gate-clear.ts`
- `src/logging/delegation-digest.ts`
- `test/unit/review-verdict.test.ts`
- `test/unit/delegation-policy.test.ts`
- `test/unit/delegation-digest.test.ts`
- `test/fixtures/fake-agent-modify-agent-flow-config.mjs`
- `test/fixtures/fake-agent-gate-delegation-plan.mjs`
- `test/fixtures/fake-agent-gate-delegation-stale-verdict.mjs`

## Files To Modify

- `src/config/schema.ts`
- `src/config/defaults.ts`
- `src/cli/args.ts`
- `src/cli/main.ts`
- `src/cli/output.ts`
- `src/artifacts/paths.ts`
- `src/prompts/render.ts`
- `src/commands/next.ts`
- `src/guards/policy.ts`
- `src/commands/run-until-user-gate.ts`
- `src/commands/status.ts`
- `test/unit/config.test.ts`
- `test/unit/args.test.ts`
- `test/unit/prompts.test.ts`
- `test/integration/next-fake-agent.test.ts`
- `test/integration/run-until-user-gate.test.ts`
- `.agent/artifacts/test_results.md`
- `.agent/handoff.md`

## Expected Changes By File

- `src/config/schema.ts`: add `DelegationConfig`, parse/default/validate `delegation`.
- `src/config/defaults.ts`: default delegation to disabled with `["user_plan_approval"]`; include `.agent-flow.json` in default protected paths.
- `src/guards/policy.ts`: add a hard-coded agent-immutable config guardrail for `.agent-flow.json`, independent of configured `protectedPaths`.
- `src/cli/args.ts`: add boolean `--delegated`.
- `src/cli/main.ts`: pass `delegated` to `runUntilUserGateCommand()`.
- `src/cli/output.ts`: mention delegated option in help.
- `src/artifacts/paths.ts`: add `plan_review_verdict`.
- `src/artifacts/review-verdict.ts`: validate `plan_review_verdict.json`.
- `src/prompts/render.ts`: include new artifact path in prompt artifact list.
- `src/commands/next.ts`: split internal structured step execution from CLI string wrapper.
- `src/workflow/delegation-policy.ts`: hold v1 gate constants and strict-bar decision helpers.
- `src/commands/delegated-gate-clear.ts`: perform locked validated non-agent transition.
- `src/logging/delegation-digest.ts`: append digest and create latest pointer content.
- `src/commands/run-until-user-gate.ts`: support delegated loop.
- `src/commands/status.ts`: display latest delegation digest pointer/count if present.

## Implementation Sequence

0. Agent-immutable config guardrail.
1. Config surface.
2. CLI flag surface.
3. Verdict artifact path and validator.
4. Prompt support for plan-review verdict.
5. Structured `next` step metadata.
6. Delegation policy and strict-bar tests.
7. Non-agent auto-clear transition.
8. Digest/audit support.
9. Delegated run-until integration.
10. Status output and final verification/handoff.

## Task Breakdown

### Task 0: Agent-Immutable Config Guardrail

**Files:**
- Modify: `src/config/defaults.ts`
- Modify: `src/guards/policy.ts`
- Test: `test/unit/config.test.ts`
- Test: `test/unit/path-patterns.test.ts`
- Test: `test/integration/next-fake-agent.test.ts`
- Test: `test/integration/run-until-user-gate.test.ts`
- Create: `test/fixtures/fake-agent-modify-agent-flow-config.mjs`

- [ ] **Step 1: Write failing default protected-path test**

Update the existing default config test in `test/unit/config.test.ts` so `guardrails.protectedPaths` includes `.agent-flow.json`:

```ts
assert.deepEqual(config.guardrails.protectedPaths, [
  ".agent-flow.json",
  ".env",
  ".env.*",
  ".git/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
]);
```

- [ ] **Step 2: Write failing hard-coded policy tests**

Add to `test/unit/path-patterns.test.ts`:

```ts
test("agent flow config is blocked even when protectedPaths is overridden", async () => {
  const blocked = await enforceChangePolicy({
    workspace: process.cwd(),
    config: applyConfigDefaults({
      version: 1,
      guardrails: { protectedPaths: [] },
    }),
    changedFiles: [{
      path: ".agent-flow.json",
      status: "modified",
      addedLines: 1,
      deletedLines: 1,
    }],
  });

  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, "GUARDRAIL_AGENT_IMMUTABLE_PATH");
    assert.match(blocked.error.message, /\.agent-flow\.json|agent-immutable/i);
  }
});

test("renaming agent flow config is blocked by the hard-coded guardrail", async () => {
  const blocked = await enforceChangePolicy({
    workspace: process.cwd(),
    config: applyConfigDefaults({
      version: 1,
      guardrails: { protectedPaths: [] },
    }),
    changedFiles: [{
      path: "agent-flow-renamed.json",
      previousPath: ".agent-flow.json",
      status: "renamed",
      addedLines: 0,
      deletedLines: 0,
    }],
  });

  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, "GUARDRAIL_AGENT_IMMUTABLE_PATH");
  }
});
```

- [ ] **Step 3: Write failing non-delegated integration test**

Create `test/fixtures/fake-agent-modify-agent-flow-config.mjs`:

```js
import { writeFile } from "node:fs/promises";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";

await writeFile(".agent-flow.json", JSON.stringify({
  version: 1,
  guardrails: { protectedPaths: [] },
  delegation: { enabled: true, delegatedGates: ["user_plan_approval"] }
}, null, 2) + "\n", "utf8");
await writeFile(".agent/next_state_proposal.json", JSON.stringify({
  runId,
  nextPhase: "spec_creation",
  artifacts: [],
  summary: "Tried to edit config"
}, null, 2) + "\n", "utf8");
```

Add to `test/integration/next-fake-agent.test.ts`:

```ts
test("next blocks agent edits to .agent-flow.json even when config would remove protectedPaths", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-agent-flow-config.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }

  const result = await captureMain(["--workspace", workspace, "next"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /\.agent-flow\.json|agent-immutable|protected/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});
```

- [ ] **Step 4: Write failing delegated integration test**

Add to `test/integration/run-until-user-gate.test.ts`:

```ts
test("run-until-user-gate --delegated blocks agent edits to .agent-flow.json", async (t) => {
  const workspace = await setupGitGuardrailWorkspace("fake-agent-modify-agent-flow-config.mjs");
  if (workspace === undefined) {
    t.skip("git is unavailable");
    return;
  }
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /\.agent-flow\.json|agent-immutable|protected/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});
```

- [ ] **Step 5: Run guardrail tests and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "agent flow config|agent-immutable|\\.agent-flow\\.json|delegated blocks agent edits"
```

Expected: FAIL because `.agent-flow.json` is not in defaults and no hard-coded guardrail exists.

- [ ] **Step 6: Implement defaults and hard-coded guardrail**

In `src/config/defaults.ts`, add `.agent-flow.json` to the built-in `protectedPaths` default list before `.env`.

In `src/guards/policy.ts`, add a non-configurable guard before configured `protectedPaths`:

```ts
const agentImmutablePathPatterns = [".agent-flow.json"];
```

Then, inside the per-file loop after `pathsToProtect` is computed and before checking `config.guardrails.protectedPaths`:

```ts
const immutableMatch = findFirstMatchingPathPattern(pathsToProtect, agentImmutablePathPatterns);
if (immutableMatch !== undefined) {
  return err({
    code: "GUARDRAIL_AGENT_IMMUTABLE_PATH",
    path: immutableMatch.path,
    message:
      `Agent-immutable config path changed: ${immutableMatch.path} matches ${immutableMatch.pattern}`,
  });
}
```

This rule must not be bypassable through `.agent-flow.json` `guardrails.protectedPaths` overrides or allowed-change manifests. Keep it scoped to the default config file path for v1; custom config path immutability can be added later if the CLI grows first-class multi-config support.

- [ ] **Step 7: Run guardrail tests and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "agent flow config|agent-immutable|\\.agent-flow\\.json|delegated blocks agent edits"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/config/defaults.ts src/guards/policy.ts test/unit/config.test.ts test/unit/path-patterns.test.ts test/integration/next-fake-agent.test.ts test/integration/run-until-user-gate.test.ts test/fixtures/fake-agent-modify-agent-flow-config.mjs
git commit -m "Protect agent flow config from agent edits"
```

### Task 1: Delegation Config

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/defaults.ts`
- Test: `test/unit/config.test.ts`

- [ ] **Step 1: Write failing config tests**

Add tests to `test/unit/config.test.ts`:

```ts
test("delegation config defaults to disabled v1 policy", () => {
  const config = applyConfigDefaults({ version: 1 });

  assert.deepEqual(config.delegation, {
    enabled: false,
    delegatedGates: ["user_plan_approval"],
    autoPassBar: "approved_no_blocking_no_major",
    digestOnStop: true,
  });
});

test("validateConfig accepts the v1 delegation config", () => {
  const result = validateConfig({
    version: 1,
    delegation: {
      enabled: true,
      delegatedGates: ["user_plan_approval"],
      autoPassBar: "approved_no_blocking_no_major",
      digestOnStop: true,
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.delegation.enabled, true);
  }
});

test("validateConfig rejects non-v1 delegation gates", () => {
  for (const gate of ["review_iteration", "user_verification", "user_spec_review"]) {
    const result = validateConfig({
      version: 1,
      delegation: { enabled: true, delegatedGates: [gate] },
    });

    assert.equal(result.ok, false, gate);
    if (!result.ok) {
      assert.match(result.error.message, /delegatedGates|user_plan_approval/i);
    }
  }
});

test("validateConfig rejects unsupported delegation auto pass bars", () => {
  const result = validateConfig({
    version: 1,
    delegation: { autoPassBar: "approved_with_minor_comments" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, "$.delegation.autoPassBar");
  }
});
```

- [ ] **Step 2: Run config tests and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "delegation config|non-v1 delegation|auto pass"
```

Expected: FAIL because `AgentFlowConfig` has no `delegation` field.

- [ ] **Step 3: Implement config types and defaults**

In `src/config/schema.ts`, add:

```ts
export type DelegatedGate = "user_plan_approval";
export type DelegationAutoPassBar = "approved_no_blocking_no_major";

export type DelegationConfig = {
  enabled: boolean;
  delegatedGates: DelegatedGate[];
  autoPassBar: DelegationAutoPassBar;
  digestOnStop: boolean;
};
```

Add to `AgentFlowConfig`:

```ts
delegation: DelegationConfig;
```

Add to `PartialAgentFlowConfig`:

```ts
delegation?: OptionalSection<DelegationConfig>;
```

In `readPartialConfig()`, parse `delegation`:

```ts
if ("delegation" in input) {
  const result = readObject(input.delegation, "$.delegation");
  if (!result.ok) return result;
  const delegatedGates = readOptionalStringArray(
    result.value,
    "delegatedGates",
    "$.delegation.delegatedGates",
  );
  if (!delegatedGates.ok) return delegatedGates;
  const autoPassBar = result.value.autoPassBar;
  if (
    autoPassBar !== undefined &&
    autoPassBar !== "approved_no_blocking_no_major"
  ) {
    return err(
      validationError(
        "$.delegation.autoPassBar",
        "delegation autoPassBar must be approved_no_blocking_no_major",
      ),
    );
  }
  config.delegation = {
    enabled: readOptionalBoolean(result.value, "enabled", "$.delegation.enabled"),
    delegatedGates: delegatedGates.value as DelegatedGate[] | undefined,
    autoPassBar: autoPassBar as DelegationAutoPassBar | undefined,
    digestOnStop: readOptionalBoolean(result.value, "digestOnStop", "$.delegation.digestOnStop"),
  };
}
```

In `validateCompleteConfig()`, validate gates:

```ts
for (let index = 0; index < config.delegation.delegatedGates.length; index += 1) {
  const gate = config.delegation.delegatedGates[index];
  if (gate !== "user_plan_approval") {
    return err(
      validationError(
        `$.delegation.delegatedGates[${index}]`,
        "V1 delegation supports only user_plan_approval",
      ),
    );
  }
}
```

In `src/config/defaults.ts`, add:

```ts
delegation: {
  enabled: input.delegation?.enabled ?? false,
  delegatedGates: arrayOrDefault(input.delegation?.delegatedGates, ["user_plan_approval"]),
  autoPassBar: input.delegation?.autoPassBar ?? "approved_no_blocking_no_major",
  digestOnStop: input.delegation?.digestOnStop ?? true,
},
```

- [ ] **Step 4: Run config tests and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "delegation config|non-v1 delegation|auto pass"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/config/schema.ts src/config/defaults.ts test/unit/config.test.ts
git commit -m "Add delegation config validation"
```

### Task 2: CLI Delegated Flag

**Files:**
- Modify: `src/cli/args.ts`
- Modify: `src/cli/main.ts`
- Modify: `src/cli/output.ts`
- Test: `test/unit/args.test.ts`
- Test: `test/unit/output.test.ts`

- [ ] **Step 1: Write failing parser/help tests**

Add to `test/unit/args.test.ts`:

```ts
test("parses delegated flag for run-until-user-gate", () => {
  const result = parseArgs(["--delegated", "run-until-user-gate"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "run-until-user-gate");
    assert.equal(result.value.flags.delegated, true);
  }
});

test("treats delegated after delimiter as positional", () => {
  const result = parseArgs(["--", "--delegated", "run-until-user-gate"]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /Unknown command: --delegated run-until-user-gate/);
  }
});
```

Add to `test/unit/output.test.ts`:

```ts
test("help lists delegated run-until option", () => {
  assert.match(helpText(), /--delegated/);
});
```

- [ ] **Step 2: Run parser/help tests and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "delegated flag|delegated after delimiter|delegated run-until option"
```

Expected: FAIL because `--delegated` is unknown.

- [ ] **Step 3: Implement CLI flag**

In `src/cli/args.ts`, add:

```ts
const booleanFlags = new Set(["strict", "delegated"]);
```

In `src/cli/main.ts`, update run-until dispatch:

```ts
case "run-until-user-gate":
  return runUntilUserGateCommand({
    ...commandOptions(command),
    delegated: command.flags.delegated === true,
  });
```

In `src/cli/output.ts`, add help text line:

```ts
"    --delegated    Use configured gate delegation for run-until-user-gate",
```

- [ ] **Step 4: Run parser/help tests and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "delegated flag|delegated after delimiter|delegated run-until option"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/cli/args.ts src/cli/main.ts src/cli/output.ts test/unit/args.test.ts test/unit/output.test.ts
git commit -m "Add delegated run-until CLI flag"
```

### Task 3: Plan Review Verdict Artifact And Validator

**Files:**
- Modify: `src/artifacts/paths.ts`
- Create: `src/artifacts/review-verdict.ts`
- Modify: `src/prompts/render.ts`
- Test: `test/unit/review-verdict.test.ts`
- Test: `test/unit/artifacts.test.ts`
- Test: `test/unit/prompts.test.ts`

- [ ] **Step 1: Write failing verdict validator tests**

Create `test/unit/review-verdict.test.ts`:

```ts
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { validatePlanReviewVerdict, strictBarPasses } from "../../src/artifacts/review-verdict.js";

test("validatePlanReviewVerdict accepts strict approved verdict", () => {
  const result = validatePlanReviewVerdict({
    runId: "run-1",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 1,
    iteration: 2,
    summary: "Approved",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(strictBarPasses(result.value), true);
  }
});

test("validatePlanReviewVerdict rejects wrong phase and stale runId shape", () => {
  const wrongPhase = validatePlanReviewVerdict({
    runId: "run-1",
    phase: "spec_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });
  assert.equal(wrongPhase.ok, false);
  if (!wrongPhase.ok) assert.equal(wrongPhase.error.path, "$.phase");

  const emptyRunId = validatePlanReviewVerdict({
    runId: "",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });
  assert.equal(emptyRunId.ok, false);
  if (!emptyRunId.ok) assert.equal(emptyRunId.error.path, "$.runId");
});

test("strictBarPasses rejects minor-comments and major findings", () => {
  const minor = validatePlanReviewVerdict({
    runId: "run-1",
    phase: "plan_review",
    status: "Approved with minor comments",
    blocking: 0,
    major: 0,
    minor: 1,
    iteration: 1,
  });
  assert.equal(minor.ok, true);
  if (minor.ok) assert.equal(strictBarPasses(minor.value), false);

  const major = validatePlanReviewVerdict({
    runId: "run-1",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 1,
    minor: 0,
    iteration: 1,
  });
  assert.equal(major.ok, true);
  if (major.ok) assert.equal(strictBarPasses(major.value), false);
});
```

- [ ] **Step 2: Write failing artifact/prompt tests**

In `test/unit/artifacts.test.ts`, assert:

```ts
assert.equal(paths.plan_review_verdict, ".agent/artifacts/plan_review_verdict.json");
```

In `test/unit/prompts.test.ts`, assert rendered prompt includes:

```ts
assert.match(prompt, /plan_review_verdict: \.agent\/artifacts\/plan_review_verdict\.json/);
```

- [ ] **Step 3: Run verdict tests and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "PlanReviewVerdict|plan_review_verdict|strictBar"
```

Expected: FAIL because module and artifact path do not exist.

- [ ] **Step 4: Implement artifact path and validator**

In `src/artifacts/paths.ts`, add `"plan_review_verdict"` to `STANDARD_ARTIFACT_NAMES` and default:

```ts
plan_review_verdict: `${artifactDir}/plan_review_verdict.json`,
```

Create `src/artifacts/review-verdict.ts`:

```ts
import { validationError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export type PlanReviewStatus =
  | "Approved"
  | "Approved with minor comments"
  | "Needs revision"
  | "Blocked";

export type PlanReviewVerdict = {
  runId: string;
  phase: "plan_review";
  status: PlanReviewStatus;
  blocking: number;
  major: number;
  minor: number;
  iteration: number;
  summary?: string;
};

export function validatePlanReviewVerdict(input: unknown): Result<PlanReviewVerdict> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err(validationError("$", "Verdict root must be an object"));
  }
  const root = input as Record<string, unknown>;
  const runId = readNonEmptyString(root.runId, "$.runId");
  if (!runId.ok) return runId;
  if (root.phase !== "plan_review") {
    return err(validationError("$.phase", "Plan review verdict phase must be plan_review"));
  }
  const status = readStatus(root.status);
  if (!status.ok) return status;
  const blocking = readNonNegativeInteger(root.blocking, "$.blocking");
  if (!blocking.ok) return blocking;
  const major = readNonNegativeInteger(root.major, "$.major");
  if (!major.ok) return major;
  const minor = readNonNegativeInteger(root.minor, "$.minor");
  if (!minor.ok) return minor;
  const iteration = readNonNegativeInteger(root.iteration, "$.iteration");
  if (!iteration.ok) return iteration;
  if (root.summary !== undefined && typeof root.summary !== "string") {
    return err(validationError("$.summary", "Summary must be a string"));
  }
  return ok({
    runId: runId.value,
    phase: "plan_review",
    status: status.value,
    blocking: blocking.value,
    major: major.value,
    minor: minor.value,
    iteration: iteration.value,
    ...(root.summary === undefined ? {} : { summary: root.summary }),
  });
}

export function strictBarPasses(verdict: PlanReviewVerdict): boolean {
  return verdict.status === "Approved" && verdict.blocking === 0 && verdict.major === 0;
}

function readStatus(input: unknown): Result<PlanReviewStatus> {
  if (
    input === "Approved" ||
    input === "Approved with minor comments" ||
    input === "Needs revision" ||
    input === "Blocked"
  ) {
    return ok(input);
  }
  return err(validationError("$.status", "Unknown plan review status"));
}

function readNonEmptyString(input: unknown, path: string): Result<string> {
  if (typeof input !== "string" || input.trim() === "") {
    return err(validationError(path, "Value must be a non-empty string"));
  }
  return ok(input);
}

function readNonNegativeInteger(input: unknown, path: string): Result<number> {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
    return err(validationError(path, "Value must be a non-negative integer"));
  }
  return ok(input);
}
```

- [ ] **Step 5: Run verdict tests and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "PlanReviewVerdict|plan_review_verdict|strictBar"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/artifacts/paths.ts src/artifacts/review-verdict.ts src/prompts/render.ts test/unit/review-verdict.test.ts test/unit/artifacts.test.ts test/unit/prompts.test.ts
git commit -m "Add plan review verdict artifact"
```

### Task 4: Structured Next Step Metadata

**Files:**
- Modify: `src/commands/next.ts`
- Test: `test/integration/next-fake-agent.test.ts`

- [ ] **Step 1: Write failing structured next test**

In `test/integration/next-fake-agent.test.ts`, import `nextStepCommand` and add:

```ts
import { nextStepCommand } from "../../src/commands/next.js";

test("nextStepCommand returns structured metadata with runId", async () => {
  const workspace = await setupWorkspace("fake-agent.mjs");

  const result = await nextStepCommand({ workspace });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.value.message, /Advanced to spec_creation/);
  assert.equal(result.value.phase, "requirement_understanding");
  assert.equal(result.value.actor, "implementation");
  assert.equal(result.value.acceptedNextPhase, "spec_creation");
  assert.equal(typeof result.value.runId, "string");
  assert.notEqual(result.value.runId, "");
});
```

- [ ] **Step 2: Run structured next test and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "nextStepCommand returns structured metadata"
```

Expected: FAIL because `nextStepCommand` does not exist.

- [ ] **Step 3: Refactor `next.ts` without changing CLI behavior**

In `src/commands/next.ts`, add:

```ts
export type NextStepResult = {
  message: string;
  runId: string;
  phase: WorkflowPhase;
  actor: AgentRole;
  proposedNextPhase: WorkflowPhase;
  acceptedNextPhase: WorkflowPhase;
  artifactPaths: string[];
};
```

Change public wrapper:

```ts
export async function nextCommand(options: NextOptions = {}): Promise<Result<string>> {
  const result = await nextStepCommand(options);
  if (!result.ok) return result;
  return ok(result.value.message);
}
```

Move the existing body into:

```ts
export async function nextStepCommand(options: NextOptions = {}): Promise<Result<NextStepResult>> {
  // existing body
}
```

Where success currently sets `successMessage`, also set:

```ts
successResult = {
  message: `${successMessage}${releaseSuffix}`,
  runId,
  phase: state.phase,
  actor: currentActor,
  proposedNextPhase: proposal.value.nextPhase,
  acceptedNextPhase: proposal.value.nextPhase,
  artifactPaths: proposalArtifactPaths(proposal.value, artifactPaths),
};
```

Return `ok(successResult)` after release. Preserve the old message string exactly through `nextCommand()`.

- [ ] **Step 4: Run structured next and existing next tests**

Run:

```powershell
npm test -- --test-name-pattern "nextStepCommand returns structured metadata|next runs one implementation phase|run log includes audit"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/commands/next.ts test/integration/next-fake-agent.test.ts
git commit -m "Return structured next step metadata"
```

### Task 5: Delegation Policy

**Files:**
- Create: `src/workflow/delegation-policy.ts`
- Test: `test/unit/delegation-policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create `test/unit/delegation-policy.test.ts`:

```ts
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import { validatePlanReviewVerdict } from "../../src/artifacts/review-verdict.js";
import {
  canDelegateUserPlanApproval,
  DELEGABLE_GATES_V1,
  HARD_FLOOR_GATES,
  KEPT_USER_GATES,
} from "../../src/workflow/delegation-policy.js";

test("delegation policy exposes fixed v1 gate tiers", () => {
  assert.deepEqual(DELEGABLE_GATES_V1, ["user_plan_approval"]);
  assert.deepEqual(KEPT_USER_GATES, ["user_spec_review"]);
  assert.equal(HARD_FLOOR_GATES.includes("destructive_action"), true);
});

test("canDelegateUserPlanApproval requires config, flag, strict verdict, and matching runId", () => {
  const config = applyConfigDefaults({
    version: 1,
    delegation: { enabled: true, delegatedGates: ["user_plan_approval"] },
  });
  const verdict = validatePlanReviewVerdict({
    runId: "step-1",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;

  const decision = canDelegateUserPlanApproval({
    config,
    delegatedFlag: true,
    verdict: verdict.value,
    expectedRunId: "step-1",
  });

  assert.deepEqual(decision, { ok: true });
});

test("canDelegateUserPlanApproval rejects disabled config and stale verdicts", () => {
  const config = applyConfigDefaults({ version: 1 });
  const verdict = validatePlanReviewVerdict({
    runId: "old",
    phase: "plan_review",
    status: "Approved",
    blocking: 0,
    major: 0,
    minor: 0,
    iteration: 1,
  });
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;

  assert.equal(canDelegateUserPlanApproval({
    config,
    delegatedFlag: true,
    verdict: verdict.value,
    expectedRunId: "old",
  }).ok, false);

  const enabled = applyConfigDefaults({
    version: 1,
    delegation: { enabled: true, delegatedGates: ["user_plan_approval"] },
  });
  assert.equal(canDelegateUserPlanApproval({
    config: enabled,
    delegatedFlag: true,
    verdict: verdict.value,
    expectedRunId: "new",
  }).ok, false);
});
```

- [ ] **Step 2: Run policy tests and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "delegation policy|canDelegateUserPlanApproval"
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement policy module**

Create `src/workflow/delegation-policy.ts`:

```ts
import type { AgentFlowConfig } from "../config/schema.js";
import type { PlanReviewVerdict } from "../artifacts/review-verdict.js";
import { strictBarPasses } from "../artifacts/review-verdict.js";

export const DELEGABLE_GATES_V1 = ["user_plan_approval"] as const;
export const KEPT_USER_GATES = ["user_spec_review"] as const;
export const HARD_FLOOR_GATES = [
  "destructive_action",
  "always_protected_path",
  "credential_access",
  "production_data_access",
  "external_service_access",
  "approved_plan_deviation",
] as const;

export type DelegationDecision = { ok: true } | { ok: false; reason: string };

export function canDelegateUserPlanApproval(input: {
  config: AgentFlowConfig;
  delegatedFlag: boolean;
  verdict: PlanReviewVerdict;
  expectedRunId: string | null;
}): DelegationDecision {
  if (!input.delegatedFlag) {
    return { ok: false, reason: "Delegated flag is not set" };
  }
  if (!input.config.delegation.enabled) {
    return { ok: false, reason: "Delegation is disabled" };
  }
  if (!input.config.delegation.delegatedGates.includes("user_plan_approval")) {
    return { ok: false, reason: "user_plan_approval is not delegated" };
  }
  if (input.expectedRunId === null || input.verdict.runId !== input.expectedRunId) {
    return { ok: false, reason: "Plan review verdict runId does not match this delegated run" };
  }
  if (!strictBarPasses(input.verdict)) {
    return { ok: false, reason: "Plan review verdict does not satisfy approved_no_blocking_no_major" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run policy tests and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "delegation policy|canDelegateUserPlanApproval"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/workflow/delegation-policy.ts test/unit/delegation-policy.test.ts
git commit -m "Add delegation policy checks"
```

### Task 6: Delegation Digest

**Files:**
- Create: `src/logging/delegation-digest.ts`
- Test: `test/unit/delegation-digest.test.ts`

- [ ] **Step 1: Write failing digest tests**

Create `test/unit/delegation-digest.test.ts`:

```ts
import * as assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { appendDelegationDigest } from "../../src/logging/delegation-digest.js";

test("appendDelegationDigest writes history and latest pointer", async () => {
  const logDir = await mkdtemp(join(tmpdir(), "agent-flow-digest-"));

  const result = await appendDelegationDigest({
    logDir,
    autoPasses: [{
      gate: "user_plan_approval",
      phase: "user_plan_approval",
      transition: "user_plan_approval -> task_classification",
      verdictPath: ".agent/artifacts/plan_review_verdict.json",
      runId: "run-1",
      status: "Approved",
      blocking: 0,
      major: 0,
      minor: 0,
      iteration: 1,
    }],
    finalStopReason: "Stopped at user gate: user_verification",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.historyPath.endsWith("delegation_digest.md"), true);
  assert.equal(result.value.latestPath.endsWith("delegation_digest_latest.md"), true);
  assert.match(await readFile(result.value.historyPath, "utf8"), /user_plan_approval/);
  assert.match(await readFile(result.value.latestPath, "utf8"), /run-1/);
});
```

- [ ] **Step 2: Run digest test and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "appendDelegationDigest"
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement digest module**

Create `src/logging/delegation-digest.ts`:

```ts
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { filesystemError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export type DelegationAutoPassRecord = {
  gate: "user_plan_approval";
  phase: string;
  transition: "user_plan_approval -> task_classification";
  verdictPath: string;
  runId: string;
  status: string;
  blocking: number;
  major: number;
  minor: number;
  iteration: number;
};

export type AppendDelegationDigestInput = {
  logDir: string;
  autoPasses: DelegationAutoPassRecord[];
  finalStopReason: string;
};

export async function appendDelegationDigest(
  input: AppendDelegationDigestInput,
): Promise<Result<{ historyPath: string; latestPath: string }>> {
  const historyPath = join(input.logDir, "delegation_digest.md");
  const latestPath = join(input.logDir, "delegation_digest_latest.md");
  const rendered = renderDelegationDigest(input);
  try {
    await mkdir(input.logDir, { recursive: true });
    await appendFile(historyPath, `${rendered}\n`, "utf8");
    await writeFile(latestPath, `${rendered}\n`, "utf8");
    return ok({ historyPath, latestPath });
  } catch (error) {
    return err(filesystemError(errorMessage(error), historyPath));
  }
}

function renderDelegationDigest(input: AppendDelegationDigestInput): string {
  return [
    "## Delegated Run",
    "",
    `Timestamp: ${new Date().toISOString()}`,
    `Auto-passes: ${input.autoPasses.length}`,
    `Final stop: ${input.finalStopReason}`,
    "",
    ...input.autoPasses.flatMap((record, index) => [
      `### Auto-pass ${index + 1}`,
      "",
      `Gate: ${record.gate}`,
      `Transition: ${record.transition}`,
      `Verdict: ${record.verdictPath}`,
      `runId: ${record.runId}`,
      `Status: ${record.status}`,
      `Findings: blocking=${record.blocking}, major=${record.major}, minor=${record.minor}`,
      `Iteration: ${record.iteration}`,
      "",
    ]),
  ].join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to write delegation digest";
}
```

- [ ] **Step 4: Run digest test and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "appendDelegationDigest"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/logging/delegation-digest.ts test/unit/delegation-digest.test.ts
git commit -m "Add delegation digest logging"
```

### Task 7: Validated Non-Agent Auto-Clear Transition

**Files:**
- Create: `src/commands/delegated-gate-clear.ts`
- Test: `test/integration/run-until-user-gate.test.ts`

- [ ] **Step 1: Write failing auto-clear transition test**

Add to `test/integration/run-until-user-gate.test.ts`:

```ts
import { clearDelegatedUserPlanApproval } from "../../src/commands/delegated-gate-clear.js";

test("clearDelegatedUserPlanApproval advances user_plan_approval with audit and digest", async () => {
  const workspace = await setupWorkspace("fake-agent-run-until-sequence.mjs");
  const state = await readWorkflowState(workspace);
  state.phase = "user_plan_approval";
  state.status = "waiting_for_user";
  state.currentActor = "user";
  state.nextActor = "user";
  await writeWorkflowState(workspace, state);

  const result = await clearDelegatedUserPlanApproval({
    workspace,
    configPath: ".agent-flow.json",
    verdictPath: ".agent/artifacts/plan_review_verdict.json",
    verdict: {
      runId: "run-1",
      phase: "plan_review",
      status: "Approved",
      blocking: 0,
      major: 0,
      minor: 0,
      iteration: 1,
    },
  });

  assert.equal(result.ok, true);
  assert.equal((await readWorkflowState(workspace)).phase, "task_classification");
  const runLog = await readFile(join(workspace, ".agent", "logs", "runs.jsonl"), "utf8");
  assert.match(runLog, /delegated_auto_pass/);
  assert.equal(await exists(join(workspace, ".agent", "logs", "delegation_digest.md")), true);
});
```

- [ ] **Step 2: Run auto-clear test and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "clearDelegatedUserPlanApproval"
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement auto-clear module**

Create `src/commands/delegated-gate-clear.ts`:

```ts
import { isAbsolute, join } from "node:path";
import { DEFAULT_CONFIG_FILE } from "../config/defaults.js";
import { loadConfig } from "../config/load.js";
import { err, ok, type Result } from "../core/result.js";
import { appendRunLogEntry } from "../logging/run-log.js";
import { appendDelegationDigest } from "../logging/delegation-digest.js";
import type { PlanReviewVerdict } from "../artifacts/review-verdict.js";
import { acquireLockfile, releaseLockfile } from "../locks/lockfile.js";
import { readState, writeState } from "../state/store.js";
import { validateTransition } from "../workflow/transitions.js";

export type ClearDelegatedUserPlanApprovalInput = {
  workspace?: string;
  configPath?: string;
  verdictPath: string;
  verdict: PlanReviewVerdict;
};

export async function clearDelegatedUserPlanApproval(
  input: ClearDelegatedUserPlanApprovalInput,
): Promise<Result<string>> {
  const workspace = input.workspace ?? process.cwd();
  const configPath = input.configPath ?? DEFAULT_CONFIG_FILE;
  const loadedConfig = await loadConfig({ cwd: workspace, configPath });
  if (!loadedConfig.ok) return err(loadedConfig.error);
  const config = loadedConfig.value;
  const statePath = resolvePath(workspace, join(config.workspace.stateDir, "workflow_state.json"));
  const lockPath = resolvePath(workspace, join(config.workspace.stateDir, "agent-flow.lock"));
  const lock = await acquireLockfile(lockPath, "agent-flow delegated gate clear");
  if (!lock.ok) return err(lock.error);
  try {
    const state = await readState(statePath);
    if (!state.ok) return err(state.error);
    if (state.value.phase !== "user_plan_approval" || state.value.currentActor !== "user") {
      return err({
        code: "DELEGATION_GATE_MISMATCH",
        path: "$.phase",
        message: "Delegated auto-clear requires user_plan_approval user gate.",
      });
    }
    const transition = validateTransition("user_plan_approval", "task_classification");
    if (!transition.ok) return transition;
    const logDir = resolvePath(workspace, config.workspace.logDir);
    const transitionText = "user_plan_approval -> task_classification" as const;
    const digest = await appendDelegationDigest({
      logDir,
      autoPasses: [{
        gate: "user_plan_approval",
        phase: "user_plan_approval",
        transition: transitionText,
        verdictPath: input.verdictPath,
        runId: input.verdict.runId,
        status: input.verdict.status,
        blocking: input.verdict.blocking,
        major: input.verdict.major,
        minor: input.verdict.minor,
        iteration: input.verdict.iteration,
      }],
      finalStopReason: "Delegated user_plan_approval auto-cleared",
    });
    if (!digest.ok) return err(digest.error);
    const runLog = await appendRunLogEntry({
      logDir,
      entry: {
        timestamp: new Date().toISOString(),
        outcome: "delegated_auto_pass",
        gate: "user_plan_approval",
        transition: transitionText,
        verdictPath: input.verdictPath,
        verdict: input.verdict,
      },
    });
    if (!runLog.ok) return err(runLog.error);
    const updated = {
      ...state.value,
      phase: "task_classification" as const,
      status: "ready" as const,
      currentActor: "implementation" as const,
      nextActor: "implementation" as const,
      lastActor: "user" as const,
      lastAction: "Delegated auto-clear: user_plan_approval",
      updatedAt: new Date().toISOString(),
    };
    const written = await writeState(statePath, updated);
    if (!written.ok) return err(written.error);
    return ok("Delegated auto-clear: user_plan_approval -> task_classification");
  } finally {
    await releaseLockfile(lock.value);
  }
}

function resolvePath(workspace: string, path: string): string {
  return isAbsolute(path) ? path : join(workspace, path);
}
```

Ordering note: digest and run-log audit are intentionally written before `writeState()` so a digest/audit failure is fatal before delegated completion and before state advance. A rare `writeState()` failure after successful digest/audit write can leave an over-reporting audit entry for a non-advance; accept this fail-closed tradeoff for v1 rather than moving state first. `appendRunLogEntry({ logDir, entry })` matches the existing `src/logging/run-log.ts` signature and accepts this delegation entry shape as `Record<string, unknown>`.

- [ ] **Step 4: Run auto-clear test and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "clearDelegatedUserPlanApproval"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/commands/delegated-gate-clear.ts test/integration/run-until-user-gate.test.ts
git commit -m "Add delegated user plan approval clear"
```

### Task 8: Delegated Run-Until Integration

**Files:**
- Modify: `src/commands/run-until-user-gate.ts`
- Modify: `test/integration/run-until-user-gate.test.ts`
- Create: `test/fixtures/fake-agent-gate-delegation-plan.mjs`
- Create: `test/fixtures/fake-agent-gate-delegation-stale-verdict.mjs`

- [ ] **Step 1: Create fake delegated plan fixture**

Create `test/fixtures/fake-agent-gate-delegation-plan.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";
const phase = /^Phase: (.+)$/m.exec(prompt)?.[1] ?? "unknown";

const steps = {
  requirement_understanding: ["spec_creation", "requirement_understanding", "requirement_understanding.md"],
  spec_creation: ["spec_review", "spec", "spec.md"],
  spec_review: ["user_spec_review", "spec_review", "spec_review.md"],
  plan_creation: ["plan_review", "plan", "plan.md"],
  plan_review: ["user_plan_approval", "plan_review", "plan_review.md"],
  task_classification: ["implementation", "task_classification", "task_classification.md"],
  implementation: ["implementation_review", "implementation_notes", "implementation_notes.md"],
  implementation_review: ["testing", "implementation_review", "implementation_review.md"],
  testing: ["user_verification", "test_results", "test_results.md"],
};

const step = steps[phase];
if (step === undefined) {
  console.error(`Unsupported phase: ${phase}`);
  process.exit(2);
}

const [nextPhase, artifactName, artifactPath] = step;
await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(join(".agent", `invoked-${phase}`), "yes\n", "utf8");
await writeFile(join(".agent", "artifacts", artifactPath), `# ${artifactName}\n`, "utf8");
if (phase === "plan_review") {
  await writeFile(
    join(".agent", "artifacts", "plan_review_verdict.json"),
    JSON.stringify({
      runId,
      phase: "plan_review",
      status: "Approved",
      blocking: 0,
      major: 0,
      minor: 0,
      iteration: 1
    }, null, 2) + "\n",
    "utf8",
  );
}
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify({
    runId,
    nextPhase,
    artifacts: [artifactName],
    summary: `Advanced from ${phase}`
  }, null, 2) + "\n",
  "utf8",
);
```

Create `test/fixtures/fake-agent-gate-delegation-stale-verdict.mjs` as the same phase chain except the verdict written during `plan_review` deliberately uses a mismatched runId:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";
const phase = /^Phase: (.+)$/m.exec(prompt)?.[1] ?? "unknown";

const steps = {
  requirement_understanding: ["spec_creation", "requirement_understanding", "requirement_understanding.md"],
  spec_creation: ["spec_review", "spec", "spec.md"],
  spec_review: ["user_spec_review", "spec_review", "spec_review.md"],
  plan_creation: ["plan_review", "plan", "plan.md"],
  plan_review: ["user_plan_approval", "plan_review", "plan_review.md"],
};

const step = steps[phase];
if (step === undefined) {
  console.error(`Unsupported phase: ${phase}`);
  process.exit(2);
}

const [nextPhase, artifactName, artifactPath] = step;
await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(join(".agent", `invoked-${phase}`), "yes\n", "utf8");
await writeFile(join(".agent", "artifacts", artifactPath), `# ${artifactName}\n`, "utf8");
if (phase === "plan_review") {
  await writeFile(
    join(".agent", "artifacts", "plan_review_verdict.json"),
    JSON.stringify({
      runId: `${runId}-stale`,
      phase: "plan_review",
      status: "Approved",
      blocking: 0,
      major: 0,
      minor: 0,
      iteration: 1
    }, null, 2) + "\n",
    "utf8",
  );
}
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify({
    runId,
    nextPhase,
    artifacts: [artifactName],
    summary: `Advanced from ${phase}`
  }, null, 2) + "\n",
  "utf8",
);
```

- [ ] **Step 2: Write failing delegated integration tests**

Add tests:

```ts
test("run-until-user-gate --delegated auto-clears user_plan_approval only with same-run verdict", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-plan.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  const state = await readWorkflowState(workspace);
  state.phase = "plan_creation";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Delegated auto-clear: user_plan_approval -> task_classification/);
  assert.match(output, /Stopped at user gate: user_verification/);
  const finalState = await readWorkflowState(workspace);
  assert.equal(finalState.phase, "user_verification");
  assert.equal(await exists(join(workspace, ".agent", "logs", "delegation_digest.md")), true);
});

test("run-until-user-gate --delegated refuses when config delegation is disabled", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-plan.mjs");

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join("\n"), /delegation is disabled/i);
  assert.equal((await readWorkflowState(workspace)).phase, "requirement_understanding");
});

test("run-until-user-gate --delegated stops cleanly at user_plan_approval for stale verdict", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-stale-verdict.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  const state = await readWorkflowState(workspace);
  state.phase = "plan_creation";
  state.status = "ready";
  state.currentActor = "implementation";
  state.nextActor = "implementation";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Stopped at user gate: user_plan_approval/);
  assert.doesNotMatch(output, /Delegated auto-clear/);
  assert.equal((await readWorkflowState(workspace)).phase, "user_plan_approval");
  assert.equal(await exists(join(workspace, ".agent", "logs", "delegation_digest.md")), false);
});

test("run-until-user-gate --delegated started at user_plan_approval stops without prior-run verdict replay", async () => {
  const workspace = await setupWorkspace("fake-agent-gate-delegation-plan.mjs");
  const configPath = join(workspace, ".agent-flow.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  config.delegation = { enabled: true, delegatedGates: ["user_plan_approval"] };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  await writeFile(
    join(workspace, ".agent", "artifacts", "plan_review_verdict.json"),
    JSON.stringify({
      runId: "prior-run",
      phase: "plan_review",
      status: "Approved",
      blocking: 0,
      major: 0,
      minor: 0,
      iteration: 1
    }, null, 2) + "\n",
    "utf8",
  );
  const state = await readWorkflowState(workspace);
  state.phase = "user_plan_approval";
  state.status = "waiting_for_user";
  state.currentActor = "user";
  state.nextActor = "user";
  await writeWorkflowState(workspace, state);

  const result = await captureMain(["--workspace", workspace, "--delegated", "run-until-user-gate"]);

  assert.equal(result.exitCode, 0);
  const output = result.stdout.join("\n");
  assert.match(output, /Stopped at user gate: user_plan_approval/);
  assert.doesNotMatch(output, /Delegated auto-clear/);
  assert.equal((await exists(join(workspace, ".agent", "artifacts", "plan_review_verdict.json"))), false);
});
```

- [ ] **Step 3: Run delegated integration tests and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "delegated auto-clears|delegation is disabled|stale verdict|prior-run verdict"
```

Expected: FAIL because delegated run-until is not implemented.

- [ ] **Step 4: Implement delegated loop**

Add imports in `src/commands/run-until-user-gate.ts`:

```ts
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { validatePlanReviewVerdict } from "../artifacts/review-verdict.js";
import { clearDelegatedUserPlanApproval } from "./delegated-gate-clear.js";
import { nextCommand, nextStepCommand } from "./next.js";
import { canDelegateUserPlanApproval } from "../workflow/delegation-policy.js";
```

Use the existing local import layout if `run-until-user-gate.ts` already imports any of these modules. `rm` is required for stale-verdict deletion.

In `RunUntilUserGateOptions`, add:

```ts
delegated?: boolean;
```

At command start:

```ts
if (options.delegated === true && !config.delegation.enabled) {
  return err({
    code: "DELEGATION_DISABLED",
    path: "$.delegation.enabled",
    message: "Delegation is disabled; remove --delegated or enable delegation in config.",
  });
}
```

Before loop, remove stale verdict:

```ts
const verdictPath = resolvePath(workspace, join(config.workspace.artifactDir, "plan_review_verdict.json"));
if (options.delegated === true) {
  await rm(verdictPath, { force: true });
}
```

Track:

```ts
let lastPlanReviewRunId: string | null = null;
```

For non-stop steps, call `nextStepCommand()` instead of `nextCommand()` when delegated:

```ts
const nextResult = options.delegated === true
  ? await nextStepCommand({ workspace, configPath })
  : await nextCommand({ workspace, configPath });
```

When delegated result returns metadata:

```ts
if (nextResult.ok && options.delegated === true && typeof nextResult.value !== "string") {
  if (nextResult.value.phase === "plan_review") {
    lastPlanReviewRunId = nextResult.value.runId;
  }
  stepResults.push(nextResult.value.message);
}
```

Keep the public non-delegated path output-compatible: when `options.delegated !== true`, continue treating `nextCommand()` as `Result<string>`.

When stop decision is `user_plan_approval`, handle it explicitly before returning the normal user-gate stop:

```ts
if (options.delegated === true && stop.phase === "user_plan_approval") {
  const verdictResult = await readPlanReviewVerdict(verdictPath);
  if (!verdictResult.ok) {
    // Missing, invalid, stale, below-bar, or no same-run plan_review step:
    // this is a clean user gate stop, not an orchestration error.
    return ok(formatUserGateStop({
      phase: "user_plan_approval",
      delegated: true,
      reason: verdictResult.error.message,
      stepResults,
    }));
  }

  const policy = canDelegateUserPlanApproval({
    config,
    delegatedFlag: true,
    verdict: verdictResult.value,
    expectedRunId: lastPlanReviewRunId,
  });
  if (!policy.ok) {
    return ok(formatUserGateStop({
      phase: "user_plan_approval",
      delegated: true,
      reason: policy.reason,
      stepResults,
    }));
  }

  const cleared = await clearDelegatedUserPlanApproval({
    workspace,
    configPath,
    verdictPath: relativeArtifactPath(config.workspace.artifactDir, "plan_review_verdict.json"),
    verdict: verdictResult.value,
  });
  if (!cleared.ok) return cleared;

  stepResults.push(cleared.value);
  continue;
}
```

The helper names above can match existing local conventions, but the semantics must hold:

- `readPlanReviewVerdict()` reads `verdictPath`, parses JSON, and calls `validatePlanReviewVerdict()`.
- Missing file maps to a non-fatal policy failure for `user_plan_approval`.
- `canDelegateUserPlanApproval({ expectedRunId: lastPlanReviewRunId, ... })` is called with the exact `runId` returned by the same invocation's `plan_review` `nextStepCommand()`.
- `expectedRunId === null` fails closed. This covers starting a delegated run already at `user_plan_approval` with a prior-run verdict.
- Policy failure returns the existing clean user-gate stop summary with exit code 0, does not call `clearDelegatedUserPlanApproval()`, and does not write delegation digest.
- Policy success calls `clearDelegatedUserPlanApproval()` once, appends its message to `stepResults`, and continues the loop from `task_classification`.

- [ ] **Step 5: Run delegated integration tests and existing run-until tests**

Run:

```powershell
npm test -- --test-name-pattern "run-until-user-gate"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/commands/run-until-user-gate.ts test/integration/run-until-user-gate.test.ts test/fixtures/fake-agent-gate-delegation-plan.mjs test/fixtures/fake-agent-gate-delegation-stale-verdict.mjs
git commit -m "Integrate delegated run-until gate clear"
```

### Task 9: Status Digest Summary

**Files:**
- Modify: `src/commands/status.ts`
- Test: `test/integration/init-status.test.ts`

- [ ] **Step 1: Write failing status test**

Add to `test/integration/init-status.test.ts`:

```ts
test("status reports delegation digest pointer when present", async () => {
  const workspace = await tempWorkspace();
  await initCommand({ workspace });
  await mkdir(join(workspace, ".agent", "logs"), { recursive: true });
  await writeFile(
    join(workspace, ".agent", "logs", "delegation_digest_latest.md"),
    "Auto-passes: 1\n",
    "utf8",
  );

  const result = await statusCommand({ workspace });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.value, /Delegation digest: \.agent\/logs\/delegation_digest_latest\.md/);
    assert.match(result.value, /Delegated auto-passes: 1/);
  }
});
```

- [ ] **Step 2: Run status test and verify failure**

Run:

```powershell
npm test -- --test-name-pattern "delegation digest pointer"
```

Expected: FAIL because status does not inspect digest.

- [ ] **Step 3: Implement status digest summary**

In `statusCommand()`, after state read, compute:

```ts
const latestDigestPath = resolvePath(workspace, join(config.value.workspace.logDir, "delegation_digest_latest.md"));
const delegationDigest = await readDelegationDigestSummary(latestDigestPath, config.value.workspace.logDir);
return ok(formatStatus(state.value, delegationDigest));
```

Add helper:

```ts
async function readDelegationDigestSummary(
  latestDigestPath: string,
  logDir: string,
): Promise<{ pointer: string; autoPasses: number } | null> {
  if (!(await exists(latestDigestPath))) return null;
  const source = await readFile(latestDigestPath, "utf8");
  const match = /^Auto-passes: (\d+)$/m.exec(source);
  return {
    pointer: `${logDir}/delegation_digest_latest.md`,
    autoPasses: match === null ? 0 : Number.parseInt(match[1], 10),
  };
}
```

Update format output:

```ts
...(delegationDigest === null ? [] : [
  `Delegation digest: ${delegationDigest.pointer}`,
  `Delegated auto-passes: ${delegationDigest.autoPasses}`,
]),
```

- [ ] **Step 4: Run status test and verify pass**

Run:

```powershell
npm test -- --test-name-pattern "delegation digest pointer"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/commands/status.ts test/integration/init-status.test.ts
git commit -m "Show delegation digest in status"
```

### Task 10: Final Verification And Handoff

**Files:**
- Modify: `.agent/artifacts/test_results.md`
- Create: `.agent/artifacts/gate_delegation_implementation_notes.md`
- Modify: `.agent/handoff.md`

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run build
npm run typecheck
npm test
```

Expected:

- `npm run build`: exit 0.
- `npm run typecheck`: exit 0.
- `npm test`: exit 0, with the two existing symlink tests allowed to skip on this Windows environment.

- [ ] **Step 2: Record implementation notes**

Create `.agent/artifacts/gate_delegation_implementation_notes.md`:

```markdown
# Gate Delegation Implementation Notes

Date: 2026-06-19

## Summary

Implemented Gate Delegation v1 for `run-until-user-gate --delegated`.

## Scope

- Delegates only `user_plan_approval`.
- Uses `.agent/artifacts/plan_review_verdict.json`.
- Requires same-invocation `plan_review` step runId binding.
- Auto-clear is a validated non-agent transition to `task_classification`.
- Digest write failure is fatal before delegated completion.

## Verification

- `npm run build`: pass
- `npm run typecheck`: pass
- `npm test`: pass with existing platform skips if present
```

- [ ] **Step 3: Update test results**

Append to `.agent/artifacts/test_results.md`:

```markdown
## Gate Delegation Wave Verification

- `npm run build`
  - Result: pass
- `npm run typecheck`
  - Result: pass
- `npm test`
  - Result: pass with existing Windows symlink platform skips if present

Coverage added:

- agent-immutable `.agent-flow.json` guardrail defaults and hard-coded policy enforcement
- delegation config defaults and validation
- delegated CLI flag parsing
- plan review verdict validation and strict bar
- structured next step metadata
- v1 delegation policy
- validated non-agent auto-clear transition
- delegation digest writing
- delegated run-until integration
- status digest summary
```

- [ ] **Step 4: Update handoff for Claude implementation review**

Update `.agent/handoff.md`:

```markdown
## Current Phase

Gate-delegation implementation complete; ready for implementation review.

## Next Actor

Claude Code review session

## Current Task

Review Gate Delegation v1 implementation against `.agent/artifacts/gate_delegation_spec.md` and `.agent/artifacts/gate_delegation_plan.md`.
```

- [ ] **Step 5: Commit implementation artifacts**

Run:

```powershell
git add .agent/artifacts/test_results.md .agent/artifacts/gate_delegation_implementation_notes.md .agent/handoff.md
git commit -m "Document gate delegation verification"
```

- [ ] **Step 6: Push if user has approved push for this wave**

Run only if the user explicitly approves push:

```powershell
git push origin main
```

## Data Structure Changes

- Add `AgentFlowConfig["delegation"]`.
- Add standard artifact `plan_review_verdict`.
- Add `PlanReviewVerdict`.
- Add structured `NextStepResult`.
- Add delegation audit/digest record shape.

## API Changes

- `runUntilUserGateCommand(options)` accepts `delegated?: boolean`.
- `nextCommand(options)` keeps returning `Result<string>`.
- New `nextStepCommand(options)` returns `Result<NextStepResult>`.
- New `clearDelegatedUserPlanApproval(input)` performs non-agent transition.

## UI Changes

- CLI help lists `--delegated`.
- `status` displays latest delegation digest pointer and auto-pass count when present.

## Test Plan

- Unit tests for config, verdict validation, policy, digest rendering, parser/help.
- Integration tests for `nextStepCommand`, non-agent auto-clear, delegated run-until success, disabled delegation, stale verdict, and status digest.
- Integration tests for agent attempts to edit `.agent-flow.json` in non-delegated `next`; the same post-run guardrail path protects delegated `nextStepCommand()` because it reuses the `next` guardrail enforcement.
- Full `npm test` before handoff.

## Verification Commands

```powershell
npm run build
npm run typecheck
npm test
```

## User Verification Points

- Review whether v1 scope remains acceptable: `user_plan_approval` only.
- Confirm an agent cannot edit `.agent-flow.json` to grant itself delegation or remove protected paths.
- Review CLI wording for `--delegated` and status digest.
- Optionally run a disposable delegated workflow with fake agents before using real Codex/Claude agents.

## Rollback / Recovery Considerations

- Delegation is default OFF, so removing `--delegated` restores current behavior.
- If digest writing fails, the delegated run should fail before reporting completion.
- If a delegated auto-clear partially fails after state write, inspect `.agent/logs/runs.jsonl`, `.agent/logs/delegation_digest.md`, and `.agent/workflow_state.json`; the implementation should sequence digest/audit before state transition to avoid this.

## Risks And Edge Cases

- Stale verdict replay.
- JSON verdict contradicts Markdown; JSON is the trusted boundary by Spec.
- Config edit during delegated run.
- Config edit during non-delegated run; this uses the same hard-coded guardrail.
- Digest failure before/after lock release.
- Existing Windows symlink tests remain platform-dependent.
- Refactoring `nextCommand()` could regress CLI behavior if wrapper tests are weak.

## Non-Goals

- No `review_iteration` delegation.
- No `user_verification` delegation.
- No `spec_review` or `implementation_review` verdict emission.
- No configurable hard floor.
- No external validation library.
- No implementation before this Plan is reviewed and explicitly approved.

## Stop Condition

Stop after writing this Plan. Do not implement until the user explicitly approves this Plan.

## Plan Self-Review

- Spec coverage: all v1 Spec sections map to tasks above.
- Placeholder scan: no TBD/TODO placeholder steps are intentionally left.
- Type consistency: `PlanReviewVerdict`, `NextStepResult`, `plan_review_verdict`, `delegated`, and `clearDelegatedUserPlanApproval()` are named consistently across tasks.
