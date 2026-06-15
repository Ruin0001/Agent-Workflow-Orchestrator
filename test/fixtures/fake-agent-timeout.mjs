import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

await mkdir(".agent", { recursive: true });
await writeFile(join(".agent", "invoked"), "yes\n", "utf8");
await setTimeout(2_500);
