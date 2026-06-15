import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
      runId: "stale-run-id",
      nextPhase: "spec_creation",
      artifacts: ["requirement_understanding"],
      summary: "Wrote a proposal with the wrong run id",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
