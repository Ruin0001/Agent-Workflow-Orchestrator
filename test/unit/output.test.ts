import * as assert from "node:assert/strict";
import { test } from "node:test";
import { helpText } from "../../src/cli/output.js";

test("help lists run-until-user-gate command", () => {
  assert.match(helpText(), /run-until-user-gate/);
});
