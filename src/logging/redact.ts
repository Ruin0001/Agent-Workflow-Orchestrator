const REDACTED = "[REDACTED]";

const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD)|OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN)\s*=\s*(?:(["'`])[\s\S]*?\2|[^\s"'`]+)/gi;
const AUTHORIZATION_BEARER_PATTERN = /\b(Authorization:\s*Bearer\s+)([^\s]+)/gi;
const PRIVATE_KEY_BLOCK_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const SECRET_KEY_PATTERN =
  /^([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD)|OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN)$/i;
const AUTHORIZATION_KEY_PATTERN = /^authorization$/i;

export function redactSecrets(input: string): string {
  return input
    .replace(
      PRIVATE_KEY_BLOCK_PATTERN,
      `-----BEGIN ${REDACTED}-----\n${REDACTED}\n-----END ${REDACTED}-----`,
    )
    .replace(SECRET_ASSIGNMENT_PATTERN, `$1=${REDACTED}`)
    .replace(AUTHORIZATION_BEARER_PATTERN, `$1${REDACTED}`);
}

export function redactStringFields<T>(input: T, key?: string): T {
  if (key !== undefined && isSensitiveKey(key)) {
    return redactSensitiveValue(input, key) as T;
  }

  if (typeof input === "string") {
    return redactSecrets(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((value) => redactStringFields(value)) as T;
  }

  if (isPlainObject(input)) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = redactStringFields(value, key);
    }
    return output as T;
  }

  return input;
}

function redactSensitiveValue(input: unknown, key: string): unknown {
  if (typeof input === "string" && AUTHORIZATION_KEY_PATTERN.test(key)) {
    return input.replace(/^Bearer\s+.+$/i, `Bearer ${REDACTED}`);
  }
  return REDACTED;
}

function isSensitiveKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key) || AUTHORIZATION_KEY_PATTERN.test(key);
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}
