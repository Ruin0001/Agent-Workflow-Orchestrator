import * as assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { redactSecrets, redactStringFields } from "../../src/logging/redact.js";
import { appendRunLogEntry } from "../../src/logging/run-log.js";

async function tempWorkspace(): Promise<string> {
  const path = join(tmpdir(), `agent-flow-redact-${Date.now()}-${Math.random()}`);
  await mkdir(path, { recursive: true });
  return path;
}

test("redactSecrets keeps secret labels readable while replacing sensitive values", () => {
  const input = [
    "OPENAI_API_KEY=sk-test",
    "ANTHROPIC_API_KEY=secret",
    "GITHUB_TOKEN=ghp_example",
    "Authorization: Bearer abc123",
    "-----BEGIN PRIVATE KEY-----",
    "private material",
    "-----END PRIVATE KEY-----",
  ].join("\n");

  const output = redactSecrets(input);

  assert.match(output, /OPENAI_API_KEY=\[REDACTED\]/);
  assert.match(output, /ANTHROPIC_API_KEY=\[REDACTED\]/);
  assert.match(output, /GITHUB_TOKEN=\[REDACTED\]/);
  assert.match(output, /Authorization: Bearer \[REDACTED\]/);
  assert.match(output, /-----BEGIN \[REDACTED\]-----/);
  assert.match(output, /-----END \[REDACTED\]-----/);
  assert.doesNotMatch(output, /sk-test|secret|ghp_example|abc123|private material/);
});

test("redactSecrets redacts quoted secret assignments", () => {
  const output = redactSecrets(
    [
      'OPENAI_API_KEY="sk-real"',
      "ANTHROPIC_API_KEY='anthropic-real'",
      "GITHUB_TOKEN=`ghp_real`",
    ].join("\n"),
  );

  assert.match(output, /OPENAI_API_KEY=\[REDACTED\]/);
  assert.match(output, /ANTHROPIC_API_KEY=\[REDACTED\]/);
  assert.match(output, /GITHUB_TOKEN=\[REDACTED\]/);
  assert.doesNotMatch(output, /sk-real|anthropic-real|ghp_real/);
});

test("redactSecrets redacts spec-mandated token secret and password assignment families", () => {
  const input = [
    "GH_TOKEN=gh_token_value",
    "NPM_TOKEN=npm_token_value",
    "AWS_SESSION_TOKEN=aws_session_value",
    "DATABASE_SECRET=database_secret_value",
    "DB_PASSWORD=db_password_value",
    "CUSTOM_PASSWORD='custom_password_value'",
  ].join("\n");

  const output = redactSecrets(input);

  assert.match(output, /GH_TOKEN=\[REDACTED\]/);
  assert.match(output, /NPM_TOKEN=\[REDACTED\]/);
  assert.match(output, /AWS_SESSION_TOKEN=\[REDACTED\]/);
  assert.match(output, /DATABASE_SECRET=\[REDACTED\]/);
  assert.match(output, /DB_PASSWORD=\[REDACTED\]/);
  assert.match(output, /CUSTOM_PASSWORD=\[REDACTED\]/);
  assert.doesNotMatch(
    output,
    /gh_token_value|npm_token_value|aws_session_value|database_secret_value|db_password_value|custom_password_value/,
  );
});

test("redactStringFields recursively redacts string fields without changing non-strings", () => {
  const entry = {
    phase: "implementation",
    prompt: "OPENAI_API_KEY=sk-test",
    nested: {
      stderr: "Authorization: Bearer abc123",
      exitCode: 1,
      changed: true,
    },
  };

  assert.deepEqual(redactStringFields(entry), {
    phase: "implementation",
    prompt: "OPENAI_API_KEY=[REDACTED]",
    nested: {
      stderr: "Authorization: Bearer [REDACTED]",
      exitCode: 1,
      changed: true,
    },
  });
});

test("redactStringFields redacts values identified by sensitive keys", () => {
  const entry = {
    env: {
      OPENAI_API_KEY: "sk-real",
      ANTHROPIC_API_KEY: "anthropic-real",
      GITHUB_TOKEN: "ghp_real",
      GH_TOKEN: "gh_real",
      NPM_TOKEN: "npm_real",
      SERVICE_SECRET: "secret_real",
      DB_PASSWORD: "password_real",
    },
    headers: {
      Authorization: "Bearer real-token",
    },
  };

  assert.deepEqual(redactStringFields(entry), {
    env: {
      OPENAI_API_KEY: "[REDACTED]",
      ANTHROPIC_API_KEY: "[REDACTED]",
      GITHUB_TOKEN: "[REDACTED]",
      GH_TOKEN: "[REDACTED]",
      NPM_TOKEN: "[REDACTED]",
      SERVICE_SECRET: "[REDACTED]",
      DB_PASSWORD: "[REDACTED]",
    },
    headers: {
      Authorization: "Bearer [REDACTED]",
    },
  });
});

test("redactStringFields preserves non-plain object JSON serialization", () => {
  const now = new Date("2026-06-14T00:00:00.000Z");

  assert.deepEqual(redactStringFields({ now }), { now });
  assert.equal(JSON.stringify(redactStringFields({ now })), '{"now":"2026-06-14T00:00:00.000Z"}');
});

test("appendRunLogEntry creates runs.jsonl and writes redacted JSON entries", async () => {
  const workspace = await tempWorkspace();
  const result = await appendRunLogEntry({
    logDir: join(workspace, ".agent", "logs"),
    entry: {
      timestamp: "2026-06-14T00:00:00.000Z",
      phase: "implementation",
      actor: "implementation",
      stdout: "GITHUB_TOKEN=ghp_example",
    },
  });

  assert.equal(result.ok, true);
  const content = await readFile(join(workspace, ".agent", "logs", "runs.jsonl"), "utf8");
  const parsed = JSON.parse(content.trim()) as { stdout: string };
  assert.equal(parsed.stdout, "GITHUB_TOKEN=[REDACTED]");
});

test("appendRunLogEntry redacts structured secrets produced during JSON serialization", async () => {
  const workspace = await tempWorkspace();
  const result = await appendRunLogEntry({
    logDir: join(workspace, ".agent", "logs"),
    entry: {
      generated: {
        toJSON: () => ({
          env: { OPENAI_API_KEY: "sk-real" },
          headers: { Authorization: "Bearer real-token" },
          message: "GITHUB_TOKEN=ghp_real",
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  const content = await readFile(join(workspace, ".agent", "logs", "runs.jsonl"), "utf8");
  const parsed = JSON.parse(content.trim()) as {
    generated: {
      env: { OPENAI_API_KEY: string };
      headers: { Authorization: string };
      message: string;
    };
  };
  assert.equal(parsed.generated.env.OPENAI_API_KEY, "[REDACTED]");
  assert.equal(parsed.generated.headers.Authorization, "Bearer [REDACTED]");
  assert.equal(parsed.generated.message, "GITHUB_TOKEN=[REDACTED]");
  assert.doesNotMatch(content, /sk-real|real-token|ghp_real/);
});

test("appendRunLogEntry reports serialization failures distinctly from filesystem errors", async () => {
  const workspace = await tempWorkspace();
  const result = await appendRunLogEntry({
    logDir: join(workspace, ".agent", "logs"),
    entry: {
      value: BigInt(1),
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.equal(result.error.path, "$.entry");
    assert.match(result.error.message, /serializable/i);
  }
});
