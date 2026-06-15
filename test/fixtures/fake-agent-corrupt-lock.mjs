import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const prompt = await readStdin();
const runId = /runId "([^"]+)"/.exec(prompt)?.[1] ?? "";

await mkdir(join(".agent", "artifacts"), { recursive: true });
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

await writeFile(join(".agent", "agent-flow.lock"), "{ invalid lock json", "utf8");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
