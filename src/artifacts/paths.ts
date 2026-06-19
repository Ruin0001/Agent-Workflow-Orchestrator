import type { AgentFlowConfig } from "../config/schema.js";

export const STANDARD_ARTIFACT_NAMES = [
  "requirement_understanding",
  "spec",
  "spec_review",
  "spec_review_response",
  "plan",
  "plan_review",
  "plan_review_response",
  "task_classification",
  "implementation_notes",
  "implementation_review",
  "implementation_review_response",
  "test_results",
  "final_handoff",
  "allowed_change_manifest",
  "plan_review_verdict",
] as const;

export type StandardArtifactName = (typeof STANDARD_ARTIFACT_NAMES)[number];
export type ArtifactPaths = Record<StandardArtifactName, string>;

type StateArtifactOverrides = {
  artifacts?: Record<string, string>;
};

export function resolveArtifactPaths(
  config: AgentFlowConfig,
  state?: StateArtifactOverrides,
): ArtifactPaths {
  const artifactDir = config.workspace.artifactDir;
  const defaults: ArtifactPaths = {
    requirement_understanding: `${artifactDir}/requirement_understanding.md`,
    spec: `${artifactDir}/spec.md`,
    spec_review: `${artifactDir}/spec_review.md`,
    spec_review_response: `${artifactDir}/spec_review_response.md`,
    plan: `${artifactDir}/plan.md`,
    plan_review: `${artifactDir}/plan_review.md`,
    plan_review_response: `${artifactDir}/plan_review_response.md`,
    task_classification: `${artifactDir}/task_classification.md`,
    implementation_notes: `${artifactDir}/implementation_notes.md`,
    implementation_review: `${artifactDir}/implementation_review.md`,
    implementation_review_response: `${artifactDir}/implementation_review_response.md`,
    test_results: `${artifactDir}/test_results.md`,
    final_handoff: `${artifactDir}/final_handoff.md`,
    allowed_change_manifest: config.artifacts.allowedChangeManifest,
    plan_review_verdict: `${artifactDir}/plan_review_verdict.json`,
  };

  const paths = { ...defaults };
  for (const name of STANDARD_ARTIFACT_NAMES) {
    const override = state?.artifacts?.[name];
    if (override !== undefined) {
      paths[name] = override;
    }
  }

  return paths;
}
