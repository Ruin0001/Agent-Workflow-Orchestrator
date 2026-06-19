import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";
const phase = /^Phase: (.+)$/m.exec(prompt)?.[1] ?? "unknown";

const steps = {
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
    JSON.stringify(
      {
        runId,
        phase: "plan_review",
        status: "Approved with minor comments",
        blocking: 0,
        major: 0,
        minor: 1,
        iteration: 0,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase,
      artifacts: [artifactName],
      summary: `Advanced from ${phase}`,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
