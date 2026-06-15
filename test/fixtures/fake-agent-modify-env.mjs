import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

let prompt = "";
for await (const chunk of process.stdin) {
  prompt += chunk;
}
const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "missing-run-id";

await mkdir(join(".agent", "artifacts"), { recursive: true });
await writeFile(".env", "SECRET=changed\n", "utf8");
await writeFile(
  join(".agent", "artifacts", "requirement_understanding.md"),
  "# Requirement Understanding\n",
  "utf8",
);
await writeFile(
  join(".agent", "artifacts", "allowed_change_manifest.json"),
  JSON.stringify(
    {
      filesToInspect: [],
      filesToModify: [],
      filesToCreate: [".agent/artifacts/requirement_understanding.md"],
      forbiddenPaths: [],
      dependencyChanges: { allowed: false },
      migrationChanges: { allowed: false },
      destructiveActions: { allowed: false },
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
await writeFile(
  join(".agent", "next_state_proposal.json"),
  JSON.stringify(
    {
      runId,
      nextPhase: "spec_creation",
      artifacts: ["requirement_understanding"],
      summary: "Attempted env modification",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
