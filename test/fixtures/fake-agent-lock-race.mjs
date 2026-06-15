import { spawn } from "node:child_process";
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
      artifacts: Array.from({ length: 5000 }, () => "requirement_understanding"),
      summary: "Wrote requirement understanding",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

const watcher = `
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

for (let index = 0; index < 400; index += 1) {
  try {
    const state = JSON.parse(await readFile(".agent/workflow_state.json", "utf8"));
    if (state.phase !== "requirement_understanding") {
      await writeFile(".agent/lock-race-stopped", "state advanced\\n", "utf8");
      process.exit(0);
    }
  } catch {
  }

  try {
    await writeFile(
      ".agent/agent-flow.lock",
      JSON.stringify({ pid: process.pid, command: "race", timestamp: new Date().toISOString() }) + "\\n",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(".agent/lock-race-acquired", "acquired\\n", "utf8");
    process.exit(0);
  } catch {
  }

  await setTimeout(5);
}

await writeFile(".agent/lock-race-stopped", "timed out\\n", "utf8");
`;

spawn(process.execPath, ["--input-type=module", "-e", watcher], {
  cwd: process.cwd(),
  detached: true,
  stdio: "ignore",
}).unref();
