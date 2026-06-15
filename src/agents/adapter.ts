export type AgentRunRequest = {
  role: "implementation" | "review";
  command: string;
  args: string[];
  cwd: string;
  input: string;
  timeoutMs: number;
};

export type AgentRunResult = {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
};
