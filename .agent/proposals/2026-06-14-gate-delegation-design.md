# Design Proposal: Gate Delegation (Per-Project Autonomy Profile)

Status: Approved design, queued for a post-MVP implementation wave.
Author: Claude Code review/consultation session.
Date: 2026-06-14.
Relationship to current work: This is a FUTURE feature of `agent-flow`. It must NOT be implemented in the in-flight MVP (Plan Tasks 1-8) or the immediate next wave. It is queued to be handed to the implementation agent bundled with the Wave 1+2 implementation review.

## 1. Motivation

The user runs multiple agent-driven projects concurrently with different risk postures:

- Production-level projects: every user gate is checked carefully (no change).
- Internal "vibe-coding" pre-check projects: the user wants to intervene on the initial design/spec only, then let the two agents (implementation + review) reach consensus and proceed without stopping at every user gate — except for high-severity and mandatory-review gates.

The goal is a per-project, opt-in capability to delegate selected user gates to agent consensus, while preserving a hard, non-bypassable safety floor and full auditability. This directly serves the protocol's stated purpose: "controlled handoff, not uncontrolled autonomy."

## 2. Decided Requirements (from consultation)

1. Auto-pass bar is STRICT: a delegated gate auto-clears only when the review agent's verdict is `Approved` with zero Blocking and zero Major findings. Any shortfall stops for the user.
2. Gate classification has three tiers (Section 3).
3. Oversight model: every auto-pass is recorded in the audit log, and an end-of-run digest summarizes auto-cleared gates with evidence.
4. Default OFF. Production projects are unaffected. Only projects that opt in via config are delegated.

## 3. Gate Classification (the core model)

### 3.1 Hard floor — never delegable (compiled-in, not configurable)

Always stops for the user in every profile, regardless of config:

- destructive action approval
- always-protected path changes
- credential / production-data / external-service access approval
- approved-Plan deviation approval

Rationale: these are the high-severity gates the user explicitly wants to always check. They are enforced in code and cannot be added to the delegated set.

### 3.2 Kept — remains a user gate in the vibe profile

- `user_spec_review` (the user wants to intervene on initial design/spec)

### 3.3 Delegable — auto-clears at the strict bar when opted in

- `user_plan_approval`
- `user_verification`
- review iteration auto-convergence (spec / plan / implementation review loops resolved between agents without a user stop)

## 4. Configuration

A new `delegation` block in the per-project `.agent-flow.json`. Default disabled.

```json
{
  "delegation": {
    "enabled": false,
    "delegatedGates": ["user_plan_approval", "user_verification", "review_iteration"],
    "autoPassBar": "approved_no_blocking_no_major",
    "digestOnStop": true
  }
}
```

Rules:

- `enabled` defaults to `false`. Production projects leave it false.
- `delegatedGates` may contain only gates from the delegable set (Section 3.3). If any hard-floor or unknown gate name appears, config validation rejects it with a path-aware error. The hard floor is never expressible here.
- `autoPassBar` v1 supports only `approved_no_blocking_no_major` (the strict bar). The field exists for forward compatibility; other values are rejected in v1.
- `digestOnStop` defaults to `true`.

## 5. Consensus Evaluation — machine-readable review verdict

Auto-pass decisions must NOT be made by parsing Markdown review reports (rejected as non-deterministic and fragile, consistent with the earlier allowed-change-manifest decision that Markdown extraction is insufficient).

Instead, review phases emit a machine-readable verdict alongside the Markdown report, following the existing `next_state_proposal.json` pattern:

```json
{
  "phase": "plan_review",
  "status": "Approved",
  "blocking": 0,
  "major": 0,
  "minor": 2,
  "iteration": 1
}
```

- `status` must be one of the four standard approval statuses (`Approved`, `Approved with minor comments`, `Needs revision`, `Blocked`).
- The orchestrator validates this artifact (schema + enum) exactly as it validates `next_state_proposal.json`.
- The strict bar is satisfied iff `status == "Approved" && blocking == 0 && major == 0`.
- If the verdict artifact is missing, invalid, or below the bar, the gate does NOT auto-clear; the orchestrator stops for the user.

This makes the review report's structured verdict the single source of truth for delegation decisions.

## 6. Run Model and Command

- Behavior is policy-driven. The delegated run uses the existing `run-until-user-gate` execution loop, extended so its stopping set is computed from policy: it stops at hard-floor gates, kept gates (`user_spec_review`), any existing halt condition (Section 7), and any delegable gate whose verdict misses the strict bar. It auto-clears delegable gates that meet the bar.
- Double safety to prevent accidental autonomy: delegated progression requires BOTH `delegation.enabled: true` in config AND an explicit invocation flag, e.g. `agent-flow run-until-user-gate --delegated`. With the config enabled but the flag absent, the command behaves like the normal run-until-user-gate (stops at all user gates). With the flag present but config disabled, the command refuses and explains.
- Assisted `agent-flow next` is unaffected: it still runs exactly one phase. Delegation only applies to the multi-phase run loop.

## 7. Anti-Escalation Safety Invariants (non-negotiable)

1. Agents must never edit `.agent-flow.json`. The config file is a protected path; an agent cannot widen its own autonomy. Changing delegation settings is a user-only action.
2. The hard floor (Section 3.1) is compiled-in, never data-driven.
3. Delegation never weakens existing stop conditions. Any guardrail violation, protected-path change, unauthorized file change, non-zero agent exit, timeout, missing/invalid required artifact, invalid state proposal, exceeded iteration limit, or any finding of severity Major or above immediately halts the delegated run and reverts to a user gate.
4. `user_spec_review` and the hard floor always stop, even with delegation enabled.

## 8. Oversight — audit log and end-of-run digest

- Every auto-pass writes an audit record to the run log (`.agent/logs/runs.jsonl`) and the agent log, including: gate, phase, verdict evidence (`status`, `blocking`, `major`, `minor`, `iteration`), and timestamp.
- When a delegated run stops (at a hard-floor gate, a kept gate, `done`, or a halt), the orchestrator prints and appends a digest to `.agent/logs/delegation_digest.md` summarizing every gate auto-cleared during that run with its evidence.
- `agent-flow status` surfaces a pointer to the latest digest and the count of auto-passes since the last user interaction.

## 9. Sequencing and Dependencies

This is a post-MVP wave. Build order:

1. Current MVP (Plan Tasks 1-8) — in progress, do not disturb.
2. `run-until-user-gate` wave — currently deferred per the ratified Spec decisions; prerequisite for delegation.
3. Machine-readable review verdict (`review_verdict.json`) — can be introduced in the run-until-gate wave or this wave.
4. Gate delegation wave — this design.

The implementation plan (via the writing-plans flow) is deliberately NOT written yet, because it depends on the run-until-user-gate wave and the review-verdict artifact existing first.

## 10. Out of Scope (YAGNI)

- Named profiles (`--profile vibe` / `strict`) bundling mode + policy + bar. Per-project `.agent-flow.json` already separates postures; named profiles can be added later as sugar if multi-project switching becomes painful.
- Rollback / checkpoint reversal of auto-passed gates. The user chose digest-level oversight, not rollback. Git-commit checkpoints per auto-pass are deferred.
- Auto-progression on any non-`Approved` verdict.
- Configurable hard floor.

## 11. Open Items for the Implementation Wave

- Exact schema and storage path for `review_verdict.json` (align with `next_state_proposal.json` conventions).
- Whether the config file should be in `always_protected` or `protected_unless_explicitly_allowed`; recommendation: always-protected for the `delegation` block's integrity, or treat the whole config file as agent-immutable.
- Digest format details and retention.
- Interaction with the (future) Low-Risk Auto Mode from the design brief §10.4, if both end up implemented.

## 12. Handoff Intent

When the Wave 1+2 MVP implementation is complete and reviewed, this proposal is to be handed to the implementation agent together with the implementation review, as the basis for a future delegation wave (after run-until-user-gate). It is intentionally held out of the active MVP handoff chain until then.

(Note: this project is not yet a Git repository, so this document is saved but not committed.)
```
