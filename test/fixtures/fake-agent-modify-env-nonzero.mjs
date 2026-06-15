import { writeFile } from "node:fs/promises";

await writeFile(".env", "SECRET=changed\n", "utf8");
process.exitCode = 7;
