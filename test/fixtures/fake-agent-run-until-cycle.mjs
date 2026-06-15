import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

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
  },
  spec_creation: {
    nextPhase: "spec_review",
    artifactName: "spec",
    artifactPath: "spec.md",
  },
  spec_review: {
    nextPhase: "spec_review_response",
    artifactName: "spec_review",
    artifactPath: "spec_review.md",
  },
  spec_review_response: {
    nextPhase: "spec_review",
    artifactName: "spec_review_response",
    artifactPath: "spec_review_response.md",
  },
};

const step = steps[phase];
if (step === undefined) {
  console.error(`Unsupported phase: ${phase}`);
  process.exit(2);
}

await mkdir(join(".agent", "artifacts"), { recursive: true });
await appendFile(join(".agent", "cycle-invocations.log"), `${phase}\n`, "utf8");
await writeFile(join(".agent", `invoked-${phase}-${randomUUID()}`), "yes\n", "utf8");
await writeFile(join(".agent", "artifacts", step.artifactPath), `# ${step.artifactName}\n`, "utf8");
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase: step.nextPhase,
      artifacts: [step.artifactName],
      summary: `Cycled from ${phase}`,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
