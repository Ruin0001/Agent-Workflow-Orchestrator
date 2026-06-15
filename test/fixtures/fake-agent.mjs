import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}
const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";

await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(join(".agent", "invoked"), "yes\n", "utf8");
await writeFile(
  join(".agent", "artifacts", "requirement_understanding.md"),
  "# Requirement Understanding\n",
  "utf8",
);
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase: "spec_creation",
      artifacts: ["requirement_understanding"],
      summary: "Wrote requirement understanding",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
