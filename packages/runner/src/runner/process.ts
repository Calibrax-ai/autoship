import { spawn } from "node:child_process";

export type CommandResult = {
  command: string;
  exitCode: number;
  /** Last ~maxOutputBytes of stdout (rolling tail). Older bytes are dropped to keep memory bounded on long stream-json runs. */
  stdout: string;
  /** Last ~maxOutputBytes of stderr (rolling tail). */
  stderr: string;
};

/**
 * Approximate cap per stream. Buffers are trimmed from the front when total
 * accumulated bytes exceed this threshold. ~1MB tail is enough to capture
 * an actionable error message without OOMing on long Claude Code sessions
 * that emit megabytes of stream-json over hours of work.
 */
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

/**
 * Rolling-tail buffer. Pushes append; total bytes are tracked; when over the
 * cap, oldest chunks are dropped until back under. Keeps at least the most
 * recent chunk even if it alone exceeds the cap (better than slicing — most
 * chunks are small JSON lines anyway).
 */
class RollingBuffer {
  private chunks: Buffer[] = [];
  private bytes = 0;
  constructor(private readonly maxBytes: number) {}

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      if (dropped) this.bytes -= dropped.length;
    }
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

export async function runCommand({
  command,
  args,
  cwd,
  env,
  onStdout,
  onStderr,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
}: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  maxOutputBytes?: number;
}): Promise<CommandResult> {
  const renderedCommand = [command, ...args].join(" ");

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = new RollingBuffer(maxOutputBytes);
    const stderr = new RollingBuffer(maxOutputBytes);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
      onStdout?.(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      onStderr?.(chunk.toString("utf8"));
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        command: renderedCommand,
        exitCode: exitCode ?? 1,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}
