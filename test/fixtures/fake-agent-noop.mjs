import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

await mkdir(".agent", { recursive: true });
await writeFile(join(".agent", "invoked"), "yes\n", "utf8");
