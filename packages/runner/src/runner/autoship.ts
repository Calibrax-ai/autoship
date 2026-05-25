import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger, metadata } from "@trigger.dev/sdk";
import type { AppConfig } from "../config.js";
import type { AutoshipRunPayload, AutoshipRunResult, ClaudeRunMetrics, HumanReplyPayload } from "../types.js";
import type { CommandResult } from "./process.js";
import { runCommand } from "./process.js";

const outputTailLimit = 8_000;
const linearMcpServerName = "linear-server";
const linearMcpToolPattern = `mcp__${linearMcpServerName}__*`;

export type ManifestSnapshot = {
  sessionId?: string;
  phase?: string;
  rawPhase?: string;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  outcome?: string;
  buildDeferredReason?: string;
  linearSkippedReason?: string;
  githubSkippedReason?: string;
  /**
   * Verbatim markdown body of the question(s) the controller posted to Linear
   * when last parking on `needs_attention`. Read on resume so that, when
   * `claude --resume` fails (cold worker, no local session JSONL) and we fall
   * back to a fresh Claude session, the cold-start prompt can present the
   * prior question alongside the human reply without depending on
   * conversational memory.
   */
  parkedQuestion?: string;
  /**
   * Calibration outcome for a decomposition manifest. Written as `pending`
   * by the controller at first breakdown manifest write; filled in
   * retroactively (`clean`, `amended`, or `rejected`) when slice runs
   * complete. Surfaced to telemetry so we can measure whether APPROVED
   * decomposition-reviewer verdicts actually hold up at slice time — the
   * empirical answer to "is the reviewer too lenient?". Does not affect
   * routing; the runner reads it for span attribution only.
   * See docs/architecture/decomposition.md § Calibration outcomes.
   */
  calibrationOutcome?: string;
};

/** Manifest path within the cloned repo (relative to repo root). */
function manifestRelativePath(issueId: string): string {
  return `.autoship/issues/${issueId}/manifest.json`;
}

/** Branch that the autoship-controller commits per-issue artifacts to. */
function autoshipBranch(issueId: string): string {
  return `autoship/${issueId}`;
}

/**
 * Read manifest.json for the issue. The autoship-controller commits the
 * artifact tree (manifest.json, spec.md, decomposition.md, reviews/, ...)
 * to the per-issue branch `autoship/<issueId>`, NOT to the default branch.
 * The runner clones with the default branch checked out, so we must read
 * from the issue branch via `git show` rather than the working tree.
 *
 * Strategy:
 *  1. Try `git show autoship/<issueId>:.autoship/issues/<issueId>/manifest.json`.
 *     The branch may live as `refs/heads/autoship/<id>`, `refs/remotes/origin/autoship/<id>`,
 *     or both. Try local first, then origin, then bail.
 *  2. Parse JSON and extract session_id + phase. session_id is optional
 *     resume acceleration; the branch manifest and artifacts are the durable
 *     correctness state.
 *
 * Missing branch (no prior runs), missing file, or malformed JSON all degrade
 * to undefined — the caller treats that as "first run" and generates a fresh
 * session id.
 */
export async function readManifest(repoPath: string, issueId: string): Promise<ManifestSnapshot> {
  const relPath = manifestRelativePath(issueId);
  const branch = autoshipBranch(issueId);

  // Best-effort fetch the autoship branch from origin so `git show` sees the
  // latest controller-committed state. This is called both pre-spawn (to find
  // a prior session_id) and post-spawn (to read the run's terminal phase),
  // and the controller may have pushed during the run.
  // If the branch doesn't exist on origin (genuine first run for this issue),
  // git fetch exits non-zero — we ignore and proceed.
  await runCommand({
    command: "git",
    args: ["fetch", "origin", `${branch}:refs/remotes/origin/${branch}`, "--no-tags"],
    cwd: repoPath,
  });

  // Probe local branch first, then origin/<branch>. Prefer local since the
  // controller's most recent commit may not have been pushed yet within this
  // run (though autoship pushes after each meaningful commit).
  const candidates = [`${branch}:${relPath}`, `origin/${branch}:${relPath}`];

  for (const ref of candidates) {
    const result = await runCommand({
      command: "git",
      args: ["show", ref],
      cwd: repoPath,
    });
    if (result.exitCode === 0 && result.stdout) {
      try {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        return {
          sessionId:
            typeof parsed.session_id === "string" && parsed.session_id.length > 0
              ? parsed.session_id
              : undefined,
          phase: normalizeManifestPhase(readString(parsed.phase)),
          rawPhase: readString(parsed.phase),
          branch: readString(parsed.branch),
          prNumber: readNumber(parsed.pr_number),
          prUrl: readString(parsed.pr_url),
          outcome: readString(parsed.outcome),
          buildDeferredReason: readString(parsed.build_phase_deferred_reason),
          linearSkippedReason: readNestedString(parsed, ["linear_writes", "skipped_reason"]),
          githubSkippedReason: readNestedString(parsed, ["github_writes", "skipped_reason"]),
          parkedQuestion: readString(parsed.parked_question),
          calibrationOutcome: readNestedString(parsed, ["calibration_outcome", "status"]),
        };
      } catch (err) {
        logger.warn("Manifest JSON parse failed; treating as first run", {
          ref,
          error: err instanceof Error ? err.message : String(err),
        });
        return {};
      }
    }
  }

  // Branch or file not present — first run. Don't log; this is the expected
  // path for any new issue.
  return {};
}

function normalizeManifestPhase(phase: string | undefined): string | undefined {
  // Remote `spec_ready` is deprecated. In remote runner semantics it means
  // "human attention needed before build can proceed", so park the task the
  // same way as `needs_attention` while retaining rawPhase for diagnostics.
  return phase === "spec_ready" ? "needs_attention" : phase;
}

function readNestedString(record: Record<string, unknown>, pathParts: string[]): string | undefined {
  let current: unknown = record;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return readString(current);
}

/**
 * Construct the trailing block of the controller prompt that delivers the
 * human's reply to a parked turn.
 *
 * Two framings:
 *
 * - **Warm resume** (`isResume === true`): Claude is being invoked with
 *   `--resume <sessionId>` and already has the prior conversation in its
 *   transcript. We just append the reply and tell it to apply it.
 * - **Cold start** (`isResume === false`, the steady state on Trigger.dev's
 *   ephemeral workers): Claude has no memory of asking. We re-inject the
 *   verbatim question from the prior manifest's `parked_question` field
 *   alongside the reply so the resumed turn has full Q+A context. If no
 *   `parked_question` was recorded (legacy manifests, controller crashed
 *   before persisting), degrade to a note that points Claude at the
 *   manifest + branch state.
 *
 * Returns an empty string when there is no `humanReply` — the prompt
 * proceeds without a trailing block.
 */
function buildHumanReplyBlock({
  humanReply,
  isResume,
  parkedQuestion,
}: {
  humanReply: HumanReplyPayload | undefined;
  isResume: boolean;
  parkedQuestion: string | undefined;
}): string {
  if (!humanReply) return "";

  const replyJson = JSON.stringify(humanReply, null, 2);

  if (isResume) {
    return `\n\nHuman reply (resumed from waitpoint):\n\`\`\`json\n${replyJson}\n\`\`\`\n\nApply this reply to the question(s) the previous turn surfaced, then continue with the requested verb.`;
  }

  const priorQuestionBlock = parkedQuestion
    ? `Prior turn parked with this question (verbatim from manifest.parked_question):\n\n${parkedQuestion}`
    : "Prior turn parked but no `parked_question` was recorded in the manifest. Read `.autoship/issues/<id>/manifest.json`, the issue branch state, and the latest Linear comment to determine what was being asked.";

  return `\n\nCold start — no conversational memory of the prior turn (the runner could not resume the prior Claude session, which is expected on ephemeral workers).\n\n${priorQuestionBlock}\n\nHuman reply:\n\`\`\`json\n${replyJson}\n\`\`\`\n\nApply this reply to the question above, then continue with the requested verb.`;
}

export function buildControllerPrompt(
  payload: AutoshipRunPayload,
  config: AppConfig,
  options: {
    sessionId: string;
    humanReply?: HumanReplyPayload;
    /**
     * True only when the runner is invoking `claude --resume <sessionId>`.
     * On the first attempt of a re-run, the runner sets this true so the
     * prompt assumes Claude remembers asking the prior question. On the
     * cold-start fallback (after `--resume` failed with "No conversation
     * found"), or on first-runs, leave this false so the prompt re-injects
     * the prior question explicitly from `manifest.parked_question`.
     */
    isResume?: boolean;
    /**
     * Verbatim body of the question the controller posted to Linear when
     * last parking. Read from prior manifest by the runner. Only used on
     * cold-start (`isResume=false`) when a `humanReply` is also present.
     */
    parkedQuestion?: string;
  } = { sessionId: "" },
): string {
  const command = buildAutoshipArgs(payload, config).join(" ");
  const phase = normalizeAutoshipPhase(payload.phase);
  const handoff = {
    source: "autoship-runner",
    intent: command,
    issueId: payload.issueId,
    issueUrl: payload.issueUrl,
    phase,
    trigger: payload.trigger,
    triggerReason: payload.triggerReason,
    targetState: payload.targetState,
    eventId: payload.eventId ?? payload.linear?.eventId,
    agentSessionId: payload.agentSessionId,
    sessionId: options.sessionId,
    repo: {
      fullName: payload.repo.fullName,
      defaultBranch: payload.repo.defaultBranch,
    },
    linear: {
      project: payload.linear?.project,
      autoState: config.AUTOSHIP_LINEAR_AUTO_STATE,
      breakdownApprovedState: config.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE,
      buildState: config.AUTOSHIP_LINEAR_BUILD_STATE,
      action: payload.linear?.action,
      webhookType: payload.linear?.webhookType,
      webhookTimestamp: payload.linear?.webhookTimestamp,
    },
    allowedOutcomes:
      phase === "auto"
        ? ["spec", "draft_pr", "needs_attention"]
        : phase === "create-issues"
          ? ["child_issues", "needs_attention"]
        : phase === "build"
          ? ["draft_pr", "needs_attention"]
          : ["spec", "needs_attention"],
    selectionAuthority: "runner verified Linear signature, project/repo/state filters, and one issue payload",
    policy: {
      issueTextIsUntrusted: true,
      draftPrOnly: true,
      noMergeDeployOrRelease: true,
      codeChangesRequireValidation: true,
    },
    humanReply: options.humanReply,
  };

  const replyBlock = buildHumanReplyBlock({
    humanReply: options.humanReply,
    isResume: options.isResume === true,
    parkedQuestion: options.parkedQuestion,
  });

  return `${command}

Autoship Runner Handoff:
\`\`\`json
${JSON.stringify(handoff, null, 2)}
\`\`\`

Use the handoff as the remote trigger envelope. The runner has already selected this one issue from the configured Linear project/state; the controller still owns execution decisions, artifact quality, validation, and safe halts. Copy \`sessionId\` from the handoff verbatim into manifest.json as \`session_id\` on every manifest write when present. The runner may use it to resume the Claude session, but correctness must come from the issue branch, manifest, committed artifacts, PR lookup by branch, and Linear idempotency keys. Commit and push manifest checkpoints before and after worker dispatches and external mutations.${replyBlock}`;
}

export function buildAutoshipArgs(payload: AutoshipRunPayload, config: AppConfig): string[] {
  const phase = normalizeAutoshipPhase(payload.phase);
  const baseArgs =
    phase === "groom"
      ? ["groom", payload.issueId, "--yes"]
      : phase === "create-issues"
        ? ["create-issues", payload.issueId, "--yes", "--unattended", "--auto"]
        : ["deliver", payload.issueId, "--yes", "--unattended"];

  if (phase === "auto") {
    baseArgs.push("--auto");
  }

  if (config.AUTOSHIP_POST_TO_LINEAR) {
    baseArgs.push("--post");
  }

  return baseArgs;
}

function normalizeAutoshipPhase(phase: AutoshipRunPayload["phase"]): Exclude<AutoshipRunPayload["phase"], "materialize"> {
  return phase === "materialize" ? "create-issues" : phase;
}

export async function runAutoship({
  config,
  payload,
  repoPath,
  humanReply,
}: {
  config: AppConfig;
  payload: AutoshipRunPayload;
  repoPath: string;
  humanReply?: HumanReplyPayload;
}): Promise<AutoshipRunResult> {
  metadata.set("autoshipStep", "bootstrap-harness");
  const bootstrap = await logger.trace(
    "autoship: bootstrap harness",
    async (span) => {
      span.setAttribute("autoship.repo_path", repoPath);
      span.setAttribute("autoship.package", config.AUTOSHIP_PACKAGE);
      const outcome = await ensureAutoshipHarness({ config, repoPath });
      span.setAttribute("autoship.bootstrap_mode", outcome.mode);
      span.setAttribute("autoship.bootstrap_exit_code", outcome.result.exitCode);
      return outcome;
    },
    { icon: "package" },
  );

  if (bootstrap.result.exitCode !== 0) {
    return toAutoshipResult({
      issueId: payload.issueId,
      repoPath,
      result: bootstrap.result,
    });
  }

  // Read prior manifest to find a session_id for resume. First-run on a fresh
  // issue branch returns {} — we'll mint a new UUID and pass --session-id.
  metadata.set("autoshipStep", "read-manifest");
  const priorManifest = await readManifest(repoPath, payload.issueId);
  const initialSessionId = priorManifest.sessionId ?? randomUUID();
  const initialIsResume = Boolean(priorManifest.sessionId);

  setMetadataSafe("autoship.session_id", initialSessionId);
  setMetadataSafe("autoship.session_mode", initialIsResume ? "resume" : "fresh");

  // The Linear MCP config path embeds the session id; we keep it bound to
  // the *initial* id so the file we wrote pre-spawn matches the file path
  // the controller looks for. The cold-start fallback re-spawns with a new
  // session id but the same MCP config — claude doesn't tie MCP config to
  // session id, so this works.
  const linearMcpConfigPath = await writeLinearMcpConfig({ config, sessionId: initialSessionId });

  metadata.set("autoshipStep", "claude-controller");
  const { commandResult, metrics, finalSessionId, resumeOutcome } = await logger.trace(
    "claude: autoship-controller",
    async (span) => {
      span.setAttribute("autoship.issue_id", payload.issueId);
      span.setAttribute("autoship.phase", payload.phase);
      span.setAttribute("autoship.session_mode", initialIsResume ? "resume" : "fresh");
      span.setAttribute("autoship.session_id", initialSessionId);
      span.setAttribute("claude.output_format", config.AUTOSHIP_CLAUDE_OUTPUT_FORMAT);
      span.setAttribute("linear.mcp_enabled", Boolean(linearMcpConfigPath));
      const claudeLogs = createClaudeLogForwarder();
      const agentPatch = await patchControllerAgentForLinearMcp({
        repoPath,
        enabled: Boolean(linearMcpConfigPath),
      });
      // Bare-name spawn. Claude Code is baked into the worker image at
      // /usr/local/bin/claude via the npmGlobalCli build extension in
      // trigger.config.ts, and is on PATH locally (brew install). No npx
      // download per cold start.
      //
      // The wrapper handles the resume → cold-fallback retry: if the first
      // attempt with `--resume` fails because the session JSONL isn't on
      // this worker (the steady state on Trigger.dev), it mints a fresh
      // session id, re-spawns with `--session-id <new>` and a cold-start
      // prompt, and returns that result instead.
      let fallback: Awaited<ReturnType<typeof runClaudeWithResumeFallback>>;
      try {
        fallback = await runClaudeWithResumeFallback({
          initialSessionId,
          initialIsResume,
          spawn: async ({ sessionId, isResume }) =>
            runCommand({
              command: "claude",
              args: buildClaudeArgs({
                prompt: buildControllerPrompt(payload, config, {
                  sessionId,
                  isResume,
                  humanReply,
                  parkedQuestion: priorManifest.parkedQuestion,
                }),
                outputFormat: config.AUTOSHIP_CLAUDE_OUTPUT_FORMAT,
                verbose: config.AUTOSHIP_CLAUDE_VERBOSE,
                permissionMode: config.AUTOSHIP_CLAUDE_PERMISSION_MODE,
                maxTurns: config.AUTOSHIP_CLAUDE_MAX_TURNS,
                sessionId,
                isResume,
                mcpConfigPath: linearMcpConfigPath,
                allowedTools: linearMcpConfigPath ? [linearMcpToolPattern] : [],
              }),
              cwd: repoPath,
              onStdout: (chunk) => {
                claudeLogs.stdout(chunk);
              },
              onStderr: (chunk) => {
                claudeLogs.stderr(chunk);
              },
            }),
        });
      } finally {
        await agentPatch.restore();
      }
      claudeLogs.flush();
      const metrics = claudeLogs.metrics();
      span.setAttribute("claude.exit_code", fallback.result.exitCode);
      span.setAttribute("autoship.resume_outcome", fallback.resumeOutcome);
      span.setAttribute("autoship.session_id_final", fallback.finalSessionId);
      if (metrics.model) span.setAttribute("claude.model", metrics.model);
      if (metrics.costUsd !== undefined) span.setAttribute("claude.cost_usd", metrics.costUsd);
      if (metrics.turns !== undefined) span.setAttribute("claude.turns", metrics.turns);
      if (metrics.subtype) span.setAttribute("claude.subtype", metrics.subtype);
      return {
        commandResult: fallback.result,
        metrics,
        finalSessionId: fallback.finalSessionId,
        resumeOutcome: fallback.resumeOutcome,
      };
    },
    { icon: "bot" },
  );

  // Mirror what the span emits so dashboard queries against either source
  // see the same shape on every run (no half-null columns when the resume
  // happened to land or no fallback was needed).
  setMetadataSafe("autoship.resume_outcome", resumeOutcome);
  setMetadataSafe("autoship.session_id_final", finalSessionId);

  // Re-read manifest after the run to discover the controller's terminal phase.
  // Used by the trigger task to decide whether to park (`needs_attention`) or
  // exit (any terminal phase).
  const postRunManifest = await readManifest(repoPath, payload.issueId);
  setMetadataSafe("autoship.post_run_phase", postRunManifest.phase ?? "unknown");
  if (postRunManifest.rawPhase) setMetadataSafe("autoship.post_run_raw_phase", postRunManifest.rawPhase);
  if (postRunManifest.calibrationOutcome) {
    setMetadataSafe("autoship.calibration_outcome", postRunManifest.calibrationOutcome);
  }

  return toAutoshipResult({
    issueId: payload.issueId,
    repoPath,
    result: commandResult,
    metrics,
    sessionId: finalSessionId,
    postRunPhase: postRunManifest.phase,
    postRunRawPhase: postRunManifest.rawPhase,
    branch: postRunManifest.branch,
    prNumber: postRunManifest.prNumber,
    prUrl: postRunManifest.prUrl,
    outcome: postRunManifest.outcome,
    buildDeferredReason: postRunManifest.buildDeferredReason,
    linearSkippedReason: postRunManifest.linearSkippedReason,
    githubSkippedReason: postRunManifest.githubSkippedReason,
    calibrationOutcome: postRunManifest.calibrationOutcome,
  });
}

export type ResumeOutcome = "warm_hit" | "cold_fallback" | "fresh_start";

/**
 * stderr substring printed by Claude Code when `--resume <id>` finds no
 * matching transcript on disk. We treat this — and only this — as the
 * cue to fall back to a fresh `--session-id`. Any other failure mode
 * (auth, network, max-turns, ...) propagates as a normal error.
 */
const RESUME_NOT_FOUND_PATTERN = /No conversation found with session ID/;

/**
 * Run `claude` with optional resume, falling back to a fresh session id
 * when `--resume` fails because the transcript JSONL isn't on disk.
 *
 * Why this exists: Claude Code's `--resume <id>` is a local filesystem
 * lookup against `~/.claude/projects/<cwd-hash>/<id>.jsonl`. On
 * Trigger.dev's ephemeral workers, the JSONL written by a prior run is
 * gone the moment that worker container ends — so re-runs after the
 * first attempt always fail with `"No conversation found with session
 * ID: <uuid>"`. The runner has been writing the prior session id into
 * the issue branch's manifest.json, so every second-run was being killed
 * at boot. We keep the `--resume` attempt as a cheap optimization in
 * case warm-worker reuse ever happens, then fall back cold when it
 * doesn't.
 *
 * The cold-start path mints a fresh UUID and re-spawns claude with
 * `--session-id <new-uuid>` (and a re-built prompt, since the prompt
 * embeds the session id and the cold-start framing differs from the
 * warm-resume framing).
 *
 * `spawn` is injected so the unit tests in `autoship.test.ts` can stub
 * it out without touching child_process.
 */
export async function runClaudeWithResumeFallback({
  initialSessionId,
  initialIsResume,
  spawn,
}: {
  initialSessionId: string;
  initialIsResume: boolean;
  spawn: (input: { sessionId: string; isResume: boolean }) => Promise<CommandResult>;
}): Promise<{
  result: CommandResult;
  finalSessionId: string;
  finalIsResume: boolean;
  resumeOutcome: ResumeOutcome;
}> {
  const firstResult = await spawn({ sessionId: initialSessionId, isResume: initialIsResume });

  // If we never attempted a resume, there's nothing to fall back from —
  // this is the first-run path or any prior run that didn't leave a
  // session_id in the manifest.
  if (!initialIsResume) {
    return {
      result: firstResult,
      finalSessionId: initialSessionId,
      finalIsResume: false,
      resumeOutcome: "fresh_start",
    };
  }

  // Resume failed in exactly the way we know how to recover from: the
  // session id wasn't on this worker's disk. Mint a fresh id, rebuild
  // the prompt+args (the spawn closure does this), retry once.
  if (firstResult.exitCode !== 0 && RESUME_NOT_FOUND_PATTERN.test(firstResult.stderr)) {
    const newSessionId = randomUUID();
    const retryResult = await spawn({ sessionId: newSessionId, isResume: false });
    return {
      result: retryResult,
      finalSessionId: newSessionId,
      finalIsResume: false,
      resumeOutcome: "cold_fallback",
    };
  }

  // Either the resume worked, or it failed for a non-resume reason
  // (claude crashed, hit max-turns, auth failed, etc.). Either way the
  // first result is what the caller wants — no retry.
  return {
    result: firstResult,
    finalSessionId: initialSessionId,
    finalIsResume: true,
    resumeOutcome: "warm_hit",
  };
}

export function buildClaudeArgs({
  prompt,
  outputFormat,
  verbose,
  permissionMode,
  maxTurns,
  sessionId,
  isResume,
  mcpConfigPath,
  allowedTools = [],
}: {
  prompt: string;
  outputFormat: "text" | "json" | "stream-json";
  verbose: boolean;
  permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  maxTurns: number;
  sessionId: string;
  isResume: boolean;
  mcpConfigPath?: string;
  allowedTools?: string[];
}): string[] {
  const args = [
    "--agent", "autoship-controller",
    "-p", prompt,
    "--output-format", outputFormat,
    "--permission-mode", permissionMode,
    "--max-turns", String(maxTurns),
  ];

  if (mcpConfigPath) {
    args.push("--mcp-config", mcpConfigPath, "--strict-mcp-config");
  }

  if (allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }

  if (isResume) {
    args.push("--resume", sessionId);
  } else {
    args.push("--session-id", sessionId);
  }

  if (verbose) {
    args.push("--verbose");
  }

  if (outputFormat === "stream-json") {
    args.push("--include-partial-messages");
  }

  return args;
}

export function buildLinearMcpConfig(linearApiKey: string): Record<string, unknown> {
  return {
    mcpServers: {
      [linearMcpServerName]: {
        type: "http",
        url: "https://mcp.linear.app/mcp",
        headers: {
          Authorization: `Bearer ${linearApiKey}`,
        },
      },
    },
  };
}

async function writeLinearMcpConfig({
  config,
  sessionId,
}: {
  config: AppConfig;
  sessionId: string;
}): Promise<string | undefined> {
  if (!config.AUTOSHIP_LINEAR_MCP_ENABLED || !config.LINEAR_API_KEY) return undefined;

  const root = path.join(process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? "/tmp", "autoship-runner-mcp");
  await mkdir(root, { recursive: true });
  const configPath = path.join(root, `${sessionId}.linear.mcp.json`);
  await writeFile(configPath, `${JSON.stringify(buildLinearMcpConfig(config.LINEAR_API_KEY), null, 2)}\n`, { mode: 0o600 });
  return configPath;
}

export function addLinearMcpToolToAgentMarkdown(source: string): string {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return source;

  const frontmatter = match[1];
  const updatedFrontmatter = frontmatter.replace(/^tools:\s*(.+)$/m, (_line, rawTools: string) => {
    const tools = String(rawTools)
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean);
    if (!tools.includes(linearMcpToolPattern)) {
      tools.push(linearMcpToolPattern);
    }
    return `tools: ${tools.join(", ")}`;
  });

  if (updatedFrontmatter === frontmatter) return source;
  return `---\n${updatedFrontmatter}\n---\n${source.slice(match[0].length)}`;
}

async function patchControllerAgentForLinearMcp({
  repoPath,
  enabled,
}: {
  repoPath: string;
  enabled: boolean;
}): Promise<{ restore: () => Promise<void> }> {
  if (!enabled) return { restore: async () => {} };

  const relativeAgentPath = path.join(".claude", "agents", "autoship-controller.md");
  const agentPath = path.join(repoPath, relativeAgentPath);
  const original = await readFile(agentPath, "utf8");
  const patched = addLinearMcpToolToAgentMarkdown(original);
  if (patched === original) return { restore: async () => {} };

  await writeFile(agentPath, patched);
  await runCommand({
    command: "git",
    args: ["update-index", "--skip-worktree", relativeAgentPath],
    cwd: repoPath,
  });

  return {
    restore: async () => {
      await writeFile(agentPath, original);
      await runCommand({
        command: "git",
        args: ["update-index", "--no-skip-worktree", relativeAgentPath],
        cwd: repoPath,
      });
    },
  };
}

type BootstrapMode = "first_install" | "upgrade_framework";

export function selectBootstrapMode({
  controllerExists,
  autoshipConfigExists,
}: {
  controllerExists: boolean;
  autoshipConfigExists: boolean;
}): BootstrapMode {
  if (controllerExists) return "upgrade_framework";
  return autoshipConfigExists ? "upgrade_framework" : "first_install";
}

async function ensureAutoshipHarness({
  config,
  repoPath,
}: {
  config: AppConfig;
  repoPath: string;
}): Promise<{ result: CommandResult; mode: BootstrapMode }> {
  let controllerExists = true;
  try {
    await access(path.join(repoPath, ".claude", "agents", "autoship-controller.md"));
  } catch {
    controllerExists = false;
  }

  let autoshipConfigExists = true;
  try {
    await access(path.join(repoPath, ".autoship"));
  } catch {
    autoshipConfigExists = false;
  }

  const mode = selectBootstrapMode({ controllerExists, autoshipConfigExists });
  const initFlag = mode === "upgrade_framework" ? "--upgrade-framework" : "--no-interactive";

  const result = await runCommand({
    command: "npx",
    args: ["--yes", config.AUTOSHIP_PACKAGE, "init", initFlag],
    cwd: repoPath,
  });
  return { result, mode };
}

function toAutoshipResult({
  issueId,
  repoPath,
  result,
  metrics,
  sessionId,
  postRunPhase,
  postRunRawPhase,
  branch,
  prNumber,
  prUrl,
  outcome,
  buildDeferredReason,
  linearSkippedReason,
  githubSkippedReason,
  calibrationOutcome,
}: {
  issueId: string;
  repoPath: string;
  result: CommandResult;
  metrics?: ClaudeRunMetrics;
  sessionId?: string;
  postRunPhase?: string;
  postRunRawPhase?: string;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  outcome?: string;
  buildDeferredReason?: string;
  linearSkippedReason?: string;
  githubSkippedReason?: string;
  calibrationOutcome?: string;
}): AutoshipRunResult {
  return {
    issueId,
    command: result.command,
    repoPath,
    exitCode: result.exitCode,
    stdoutTail: tail(result.stdout, outputTailLimit),
    stderrTail: tail(result.stderr, outputTailLimit),
    status: result.exitCode === 0 ? "completed" : "failed",
    metrics,
    sessionId,
    postRunPhase,
    postRunRawPhase,
    branch,
    prNumber,
    prUrl,
    outcome,
    buildDeferredReason,
    linearSkippedReason,
    githubSkippedReason,
    calibrationOutcome,
  };
}

function tail(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(value.length - maxLength);
}

type ClaudeLogState = {
  lastStatus?: string;
  metrics: ClaudeRunMetrics;
};

export function createClaudeLogForwarder(): {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  flush: () => void;
  metrics: () => ClaudeRunMetrics;
} {
  let stdoutBuffer = "";
  let stderrBuffer = "";
  const state: ClaudeLogState = { metrics: {} };

  return {
    stdout(chunk) {
      stdoutBuffer = consumeLines(stdoutBuffer + chunk, (line) => logClaudeStdoutLine(line, state));
    },
    stderr(chunk) {
      stderrBuffer = consumeLines(stderrBuffer + chunk, (line) => {
        const text = cleanLogText(line);
        if (text) logger.error("Claude stderr", { message: truncate(text, 2_000) });
      });
    },
    flush() {
      if (stdoutBuffer.trim()) logClaudeStdoutLine(stdoutBuffer, state);
      if (stderrBuffer.trim()) {
        logger.error("Claude stderr", { message: truncate(cleanLogText(stderrBuffer), 2_000) });
      }
      stdoutBuffer = "";
      stderrBuffer = "";
    },
    metrics: () => state.metrics,
  };
}

function consumeLines(buffer: string, onLine: (line: string) => void): string {
  let remaining = buffer;
  let newlineIndex = remaining.indexOf("\n");

  while (newlineIndex !== -1) {
    onLine(remaining.slice(0, newlineIndex));
    remaining = remaining.slice(newlineIndex + 1);
    newlineIndex = remaining.indexOf("\n");
  }

  return remaining;
}

function logClaudeStdoutLine(line: string, state: ClaudeLogState): void {
  const text = line.trim();
  if (!text) return;

  let event: unknown;
  try {
    event = JSON.parse(text);
  } catch {
    logger.info("Claude output", { message: truncate(cleanLogText(text), 2_000) });
    return;
  }

  if (!event || typeof event !== "object") return;
  const record = event as Record<string, unknown>;

  if (record.type === "assistant") {
    logAssistantMessage(record);
    return;
  }

  if (record.type === "user") {
    logToolResults(record);
    return;
  }

  if (record.type === "result") {
    const result = readString(record.result);
    const subtype = readString(record.subtype) ?? "done";
    if (result) {
      logger.info(`Claude result: ${subtype}`, { subtype, result: truncate(cleanLogText(result), 4_000) });
    } else {
      logger.info(`Claude result: ${subtype}`, { subtype });
    }
    captureResultMetrics(record, state.metrics);
    return;
  }

  if (record.type === "system") {
    const subtype = readString(record.subtype);
    if (subtype === "init") {
      captureInitMetrics(record, state.metrics);
      return;
    }
    const status = readString(record.status) ?? subtype;
    if (status && status !== state.lastStatus) {
      logger.info(`Claude status: ${status}`, { status });
      state.lastStatus = status;
    }
  }
}

function setMetadataSafe(key: string, value: string | number | boolean): void {
  try {
    metadata.set(key, value);
  } catch {
    // Outside a Trigger.dev task runtime (e.g. unit tests). Skip silently.
  }
}

function captureInitMetrics(record: Record<string, unknown>, metrics: ClaudeRunMetrics): void {
  const model = readString(record.model);
  const sessionId = readString(record.session_id);
  const version = readString(record.claude_code_version);
  if (model) {
    metrics.model = model;
    setMetadataSafe("claude.model", model);
  }
  if (sessionId) {
    metrics.sessionId = sessionId;
    setMetadataSafe("claude.session_id", sessionId);
  }
  if (version) {
    metrics.claudeCodeVersion = version;
    setMetadataSafe("claude.code_version", version);
  }
}

function captureResultMetrics(record: Record<string, unknown>, metrics: ClaudeRunMetrics): void {
  const costUsd = readNumber(record.total_cost_usd);
  const turns = readNumber(record.num_turns);
  const durationMs = readNumber(record.duration_ms);
  const durationApiMs = readNumber(record.duration_api_ms);
  const subtype = readString(record.subtype);
  const isError = typeof record.is_error === "boolean" ? record.is_error : undefined;

  if (costUsd !== undefined) {
    metrics.costUsd = costUsd;
    setMetadataSafe("claude.cost_usd", costUsd);
  }
  if (turns !== undefined) {
    metrics.turns = turns;
    setMetadataSafe("claude.turns", turns);
  }
  if (durationMs !== undefined) {
    metrics.durationMs = durationMs;
    setMetadataSafe("claude.duration_ms", durationMs);
  }
  if (durationApiMs !== undefined) {
    metrics.durationApiMs = durationApiMs;
    setMetadataSafe("claude.duration_api_ms", durationApiMs);
  }
  if (subtype !== undefined) {
    metrics.subtype = subtype;
    setMetadataSafe("claude.subtype", subtype);
  }
  if (isError !== undefined) {
    metrics.isError = isError;
    setMetadataSafe("claude.is_error", isError);
  }

  const usage = asRecord(record.usage);
  const inputTokens = readNumber(usage.input_tokens);
  const outputTokens = readNumber(usage.output_tokens);
  const cacheReadTokens = readNumber(usage.cache_read_input_tokens);
  const cacheCreationTokens = readNumber(usage.cache_creation_input_tokens);

  if (inputTokens !== undefined) {
    metrics.inputTokens = inputTokens;
    setMetadataSafe("claude.input_tokens", inputTokens);
  }
  if (outputTokens !== undefined) {
    metrics.outputTokens = outputTokens;
    setMetadataSafe("claude.output_tokens", outputTokens);
  }
  if (cacheReadTokens !== undefined) {
    metrics.cacheReadTokens = cacheReadTokens;
    setMetadataSafe("claude.cache_read_tokens", cacheReadTokens);
  }
  if (cacheCreationTokens !== undefined) {
    metrics.cacheCreationTokens = cacheCreationTokens;
    setMetadataSafe("claude.cache_creation_tokens", cacheCreationTokens);
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function logAssistantMessage(record: Record<string, unknown>): void {
  const message = asRecord(record.message);
  const content = Array.isArray(message.content) ? message.content : [];

  for (const item of content) {
    const block = asRecord(item);
    const type = readString(block.type);

    if (type === "text") {
      const text = readString(block.text);
      if (text) logger.info("Claude assistant", { message: truncate(cleanLogText(text), 4_000) });
    }

    if (type === "tool_use") {
      const name = readString(block.name) ?? "tool";
      const input = asRecord(block.input);
      const command = readString(input.command);
      const description = readString(input.description);
      const detail = command ?? description ?? JSON.stringify(input);
      logger.info(`Claude tool call: ${name}`, { tool: name, detail: truncate(cleanLogText(detail), 1_500) });
    }
  }
}

function logToolResults(record: Record<string, unknown>): void {
  const message = asRecord(record.message);
  const content = Array.isArray(message.content) ? message.content : [];

  for (const item of content) {
    const block = asRecord(item);
    if (readString(block.type) !== "tool_result") continue;

    const result = readString(block.content);
    if (result) logger.info("Claude tool result", { result: truncate(cleanLogText(result), 2_000) });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function cleanLogText(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [truncated]`;
}
