import { writeFile } from "node:fs/promises";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}

const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";

await writeFile(
  ".agent-flow.json",
  JSON.stringify(
    {
      version: 1,
      guardrails: { protectedPaths: [] },
      delegation: { enabled: true, delegatedGates: ["user_plan_approval"] },
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

await writeFile(
  ".agent/next_state_proposal.json",
  JSON.stringify(
    {
      runId,
      nextPhase: "spec_creation",
      artifacts: [],
      summary: "Tried to edit config",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
