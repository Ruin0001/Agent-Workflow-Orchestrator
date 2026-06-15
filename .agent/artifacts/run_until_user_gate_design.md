# Run-Until-User-Gate Design

Date: 2026-06-16
Wave: `run-until-user-gate`
Status: Approved by user for design writing

## Goal

Add `agent-flow run-until-user-gate`, a bounded automation command that repeatedly executes the existing assisted `next` step until the workflow reaches a user-owned phase, reaches `done`, or encounters an error.

This wave must not clear, bypass, or delegate any user gate. It only reduces repeated manual invocation while preserving the MVP safety rule: user phases remain hard stops.

## Scope

In scope:

- Add a CLI command: `agent-flow run-until-user-gate`.
- Reuse the existing `nextCommand()` execution path for every phase step.
- Stop successfully when the canonical state reaches `currentActor === "user"`.
- Stop successfully when the canonical state reaches `status === "done"`.
- Stop on the first `nextCommand()` error and return that error with a run summary.
- Add a fixed internal step limit to prevent unexpected infinite loops.
- Introduce a small internal stop-decision boundary that can later evolve into a gate policy engine.

Out of scope:

- Delegating or auto-clearing any user gate.
- Adding config fields for delegated gates, hard floors, or review verdicts.
- Implementing `review_verdict.json`.
- Implementing gate delegation.
- Refactoring `nextCommand()` beyond what is required to call it safely.
- Addressing unrelated deferred minor issues from the MVP review unless they block this command.

## User-Visible Behavior

The command behaves like repeated, safe `agent-flow next` invocations.

Example success:

```text
Advanced to spec_creation
Advanced to spec_review
Stopped at user gate: user_spec_review
Steps run: 2
```

If the workflow is already at a user phase, the command exits successfully without invoking an agent:

```text
Stopped at user gate: user_spec_review
Steps run: 0
```

If the workflow is already done, it exits successfully:

```text
Workflow already done
Steps run: 0
```

If a phase step fails, the command stops immediately and returns the original failure:

```text
Stopped after 1 step because next failed: GUARDRAIL_PROTECTED_PATH
```

The output should follow existing CLI formatting conventions and must include the stop reason and step count.

## Architecture

Add:

- `src/commands/run-until-user-gate.ts`
- `src/workflow/run-stop.ts`

Update:

- `src/cli/args.ts`
- `src/cli/main.ts`
- `src/cli/output.ts`
- tests under `test/integration` and `test/unit`

`run-until-user-gate` should remain a wrapper around the existing safe unit of work. It should not duplicate proposal validation, guardrails, logging, lock handling, or state advancement logic from `nextCommand()`.

## Stop Decision Boundary

Introduce a small policy-shaped function, but do not introduce a full gate policy engine yet.

Suggested type shape:

```ts
type RunStopDecision =
  | {
      action: "stop";
      reason: "user_gate" | "done";
      phase: WorkflowPhase;
      actor: WorkflowActor;
      message: string;
    }
  | {
      action: "continue";
      phase: WorkflowPhase;
      actor: WorkflowActor;
    };
```

Current decision rules:

- If `state.status === "done"` or `state.currentActor === "none"`, stop with reason `done`.
- If `state.currentActor === "user"`, stop with reason `user_gate`.
- Otherwise continue.

This boundary is intentionally small. The near-term gate-delegation wave can extend it with delegated gate names, hard-floor decisions, review verdict evidence, and richer stop reasons without changing the command's outer loop.

## Execution Flow

1. Load config and canonical state using existing loaders.
2. Evaluate the current state with `evaluateRunStop()`.
3. If it should stop, return a zero-step summary.
4. Repeat up to a fixed internal max step count:
   - Call `nextCommand()` with the same workspace/config options.
   - If `nextCommand()` fails, return that failure with a run summary.
   - Append the successful step message to the command summary.
   - Re-read canonical state from disk.
   - Evaluate the state with `evaluateRunStop()`.
   - If it should stop, return the summary.
5. If max steps are exhausted, fail closed with a distinct error code such as `RUN_UNTIL_STEP_LIMIT`.

The loop must re-read state after every step. It must not trust in-memory assumptions about what `nextCommand()` did.

## Step Limit

Use an internal default limit, for example `20` steps.

Do not add a public config field in this wave. Keeping the product surface small fits the dependency-light, safety-first direction. A future automation config section can expose this limit together with delegation policy.

The step-limit error is fail-closed. It must not advance state by itself; it only stops further execution.

## Logging And Audit

Each individual phase step keeps using the existing run log written by `nextCommand()`. This preserves the reviewed audit format and avoids duplicate log semantics.

This wave must print an aggregate terminal summary and must not introduce a second persistent audit log. The future delegation wave can add an end-of-run digest once delegated gate decisions exist.

## Error Handling

The command should fail closed.

- Active user gate at start: success stop, no agent invocation.
- `done` at start: success stop, no agent invocation.
- `nextCommand()` failure: stop immediately and return that error.
- Missing or invalid state/config: return existing loader errors.
- Step limit reached: return `RUN_UNTIL_STEP_LIMIT`.

Because `nextCommand()` already owns lock acquisition, guardrails, proposal validation, and state advancement, this command should not acquire its own long-lived lock around the whole run. Holding a top-level lock would conflict with `nextCommand()`'s existing lock. Per-step locking is acceptable for this wave.

## Future Migration To Gate Policy Engine

The next planned direction is selective user-gate handling, but this wave must not implement it.

Design for fast migration by keeping these boundaries:

- `evaluateRunStop()` is the only place that decides stop vs continue from state.
- The command loop consumes a decision object, not ad hoc booleans.
- Stop reasons are explicit strings.
- No user-gate clearing behavior is embedded in the command loop.

When gate delegation arrives, it can replace or extend the stop-decision function with a real policy evaluator that considers:

- hard-floor gates
- delegable gates
- kept gates
- machine-readable review verdict artifacts
- audit evidence for auto-cleared gates

## Testing Plan

Unit tests:

- `evaluateRunStop()` stops on `currentActor === "user"`.
- `evaluateRunStop()` stops on `status === "done"` / actor `none`.
- `evaluateRunStop()` continues for implementation and review actors.

CLI/parser tests:

- `run-until-user-gate` parses as a command.
- usage output lists `run-until-user-gate`.
- `--workspace` and `--config` work with the new command through existing option handling.

Integration tests:

- Starting from an implementation-owned phase, the command runs repeated fake-agent steps and stops at the first user-owned phase.
- Starting at a user-owned phase stops immediately and does not invoke the agent.
- Starting at `done` stops immediately.
- A failing `nextCommand()` path stops the loop and preserves fail-closed state behavior.
- A controlled loop that never reaches a user phase hits the step limit and returns `RUN_UNTIL_STEP_LIMIT`.

Verification:

- `npm run build`
- `npm run typecheck`
- `npm test`

The two symlink tests may remain platform-skipped on this Windows environment unless a symlink-capable environment is used.

## Acceptance Criteria

- `agent-flow run-until-user-gate` exists and is shown in help.
- It never runs an agent when the current state is already user-owned or done.
- It uses existing `nextCommand()` behavior for every automated step.
- It stops at the first user-owned phase without clearing any gate.
- It returns a clear summary including stop reason and step count.
- It fails closed on `nextCommand()` error or step-limit exhaustion.
- It leaves a small stop-decision boundary ready for near-term gate policy expansion.
