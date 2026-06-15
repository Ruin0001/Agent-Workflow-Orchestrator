import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";
const phase = /^Phase: (.+)$/m.exec(prompt)?.[1] ?? "unknown";

const steps = {
  requirement_understanding: {
    nextPhase: "spec_creation",
    artifactName: "requirement_understanding",
    artifactPath: "requirement_understanding.md",
    content: "# Requirement Understanding\n",
    summary: "Wrote requirement understanding",
  },
  spec_creation: {
    nextPhase: "spec_review",
    artifactName: "spec",
    artifactPath: "spec.md",
    content: "# Spec\n",
    summary: "Wrote spec",
  },
  spec_review: {
    nextPhase: "user_spec_review",
    artifactName: "spec_review",
    artifactPath: "spec_review.md",
    content: "# Spec Review\n\nApproved.\n",
    summary: "Reviewed spec",
  },
  spec_review_response: {
    nextPhase: "spec_review",
    artifactName: "spec_review_response",
    artifactPath: "spec_review_response.md",
    content: "# Spec Review Response\n",
    summary: "Responded to spec review",
  },
};

const step = steps[phase];
if (step === undefined) {
  console.error(`Unsupported phase: ${phase}`);
  process.exit(2);
}

await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(join(".agent", `invoked-${phase}`), "yes\n", "utf8");
await writeFile(join(".agent", "artifacts", step.artifactPath), step.content, "utf8");
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase: step.nextPhase,
      artifacts: [step.artifactName],
      summary: step.summary,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
