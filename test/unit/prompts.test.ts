import * as assert from "node:assert/strict";
import { test } from "node:test";
import { resolveArtifactPaths } from "../../src/artifacts/paths.js";
import { applyConfigDefaults } from "../../src/config/defaults.js";
import { renderPrompt } from "../../src/prompts/render.js";
import { PROMPT_TEMPLATES } from "../../src/prompts/templates.js";
import { createInitialState } from "../../src/state/schema.js";

test("PROMPT_TEMPLATES includes concise templates for MVP phases", () => {
  assert.equal(typeof PROMPT_TEMPLATES.requirement_understanding, "string");
  assert.equal(typeof PROMPT_TEMPLATES.spec_creation, "string");
  assert.equal(typeof PROMPT_TEMPLATES.plan_creation, "string");
  assert.equal(typeof PROMPT_TEMPLATES.implementation, "string");
  assert.equal(typeof PROMPT_TEMPLATES.final_handoff, "string");
});

test("renderPrompt produces deterministic prompt text without reading files", () => {
  const config = applyConfigDefaults({
    version: 1,
    projectContext: {
      files: ["README.md"],
      sourceOfTruth: ["SPEC.md"],
      extraInstructions: ["Keep changes focused."],
    },
  });
  const state = {
    ...createInitialState(config),
    currentTask: {
      id: "T-6",
      title: "Artifact and logging modules",
      description: "Create Task 6 support modules.",
    },
  };

  const rendered = renderPrompt({
    state,
    config,
    artifactPaths: resolveArtifactPaths(config, state),
    role: "implementation",
    stopCondition: "Stop after producing the required artifact.",
    guardrails: ["Do not implement commands/next/agents/guards."],
  });

  const renderedAgain = renderPrompt({
    state,
    config,
    artifactPaths: resolveArtifactPaths(config, state),
    role: "implementation",
    stopCondition: "Stop after producing the required artifact.",
    guardrails: ["Do not implement commands/next/agents/guards."],
  });

  assert.equal(rendered, renderedAgain);
  assert.match(rendered, /Phase: requirement_understanding/);
  assert.match(rendered, /Role: implementation/);
  assert.match(rendered, /spec: \.agent\/artifacts\/spec\.md/);
  assert.match(rendered, /plan_review_verdict: \.agent\/artifacts\/plan_review_verdict\.json/);
  assert.match(rendered, /Stop after producing the required artifact\./);
  assert.match(rendered, /Do not implement commands\/next\/agents\/guards\./);
});
