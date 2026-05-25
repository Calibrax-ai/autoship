import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { logger, metadata, task, wait } from "@trigger.dev/sdk";
import { readConfig } from "../config.js";
import type { AppConfig } from "../config.js";
import { createComment, updateComment } from "../linear/activities.js";
import { runAutoship } from "../runner/autoship.js";
import { ensureRepoCheckout } from "../runner/git.js";
import { autoshipRunPayloadSchema } from "../types.js";
import type { AutoshipRunPayload, AutoshipRunResult, ClaudeRunMetrics, HumanReplyPayload } from "../types.js";

/**
 * Tag every autoship waitpoint with this constant + the per-issue tag
 * `issue:<issueId>`. The webhook handler locates the active WAITING token
 * with `wait.listTokens({ tags: [`issue:${issueId}`, AUTOSHIP_WAITPOINT_TAG],
 * status: ["WAITING"] })` and completes it.
 *
 * We deliberately do *not* use an idempotency key here. Trigger.dev caches
 * completed waitpoints by idempotency key, so a stable key per issue caused
 * every park after the first resume to immediately re-resume from the
 * already-completed cached token — a busy loop with no actual waiting.
 * Per-issue concurrency (see buildRunConcurrencyKey) guarantees only one
 * autoship run is in-flight per issue at a time, so listing by tag yields
 * at most one WAITING token.
 */
export const AUTOSHIP_WAITPOINT_TAG = "autoship-waitpoint";

/**
 * Stage Claude Code credentials onto disk before any subprocess spawn.
 *
 * In Trigger.dev cloud workers, claude-code@2.1.x scrubs Anthropic auth env
 * vars (ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN) from the env it passes
 * to Bash-spawned subprocesses, as a credential-safety feature. The
 * controller (L1) auths fine via inherited process.env; worker dispatches
 * issued by the controller's Bash tool (L2 = `claude --agent <worker>`) see
 * a scrubbed env and fail with "Not logged in".
 *
 * A 0600 credentials.json at $HOME/.claude/.credentials.json is read by both
 * the controller and its worker subprocesses (they share HOME), and isn't on
 * any env-scrubbing path. Writing it from CLAUDE_CODE_OAUTH_TOKEN turns auth
 * into a filesystem concern instead of an env-passthrough concern.
 *
 * Skipped silently when CLAUDE_CODE_OAUTH_TOKEN isn't set — that's the
 * local-dev path on macOS where the Keychain item ("Claude Code-credentials")
 * already satisfies the CLI without our help.
 *
 * Shape mirrors what Claude Code writes itself after `/login` on macOS (the
 * Keychain item "Claude Code-credentials"). The minimal
 * `{ claudeAiOauth: { accessToken } }` form was tested empirically and the
 * CLI rejected it — credentials.json appears to require the surrounding
 * fields to be considered a valid credential. Refresh-related fields are
 * neutralized: setup-token OAuth values are long-lived and non-refreshable,
 * so refreshToken is empty and expiresAt is set far enough in the future
 * that the CLI won't trigger a (doomed) refresh attempt.
 */
async function stageClaudeCredentials(): Promise<void> {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // The effective auth mode given Claude Code's hardcoded precedence:
  //   ANTHROPIC_API_KEY > apiKeyHelper > CLAUDE_CODE_OAUTH_TOKEN > credentials.json
  // The API key always wins when present, even though we also stage
  // credentials.json for the OAuth path. Surfacing this as a span attribute
  // lets dashboards filter "which runs are on subscription vs. metered"
  // without log-trawling.
  const authMode = apiKey
    ? "api-key-metered"
    : oauthToken
      ? "oauth-subscription"
      : "fallthrough";

  if (!oauthToken) {
    logger.info("Claude credentials staging skipped", {
      reason: "CLAUDE_CODE_OAUTH_TOKEN unset",
      authMode,
    });
    return;
  }

  const claudeDir = path.join(homedir(), ".claude");
  await mkdir(claudeDir, { recursive: true });
  const credsPath = path.join(claudeDir, ".credentials.json");
  // ~10 years out. setup-token OAuth values don't actually expire on this
  // schedule, but Claude Code reads expiresAt to decide whether to attempt
  // a refresh — far-future keeps it from trying with the empty refreshToken.
  const expiresAt = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  const blob = JSON.stringify({
    claudeAiOauth: {
      accessToken: oauthToken,
      refreshToken: "",
      expiresAt,
      scopes: [
        "user:file_upload",
        "user:inference",
        "user:mcp_servers",
        "user:profile",
        "user:sessions:claude_code",
      ],
      subscriptionType: "max",
    },
  });
  await writeFile(credsPath, blob, { mode: 0o600 });
  // Belt and suspenders: some umasks override the open-time mode.
  await chmod(credsPath, 0o600);
  logger.info("Claude credentials staged", { credsPath, authMode });

  // Operator footgun: setting both env vars looks like "fallback" but the
  // API key wins silently — subscription quota is unused, billing flips to
  // metered without any signal. Warn loudly so it's caught at the next run
  // instead of at the next invoice.
  if (apiKey) {
    logger.warn(
      "Both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN are set — API key takes precedence per Claude Code auth chain. Subscription quota is NOT being used. Unset ANTHROPIC_API_KEY in Trigger.dev env to use the OAuth subscription.",
    );
  }
}

export const autoshipIssueRun = task({
  id: "autoship-issue-run",
  // Default small-1x (0.5 vCPU / 0.5GB) is too thin for Claude Code +
  // git + a customer repo's node_modules. small-2x (1GB) has been
  // empirically tested twice and OOM-kills on real workloads — most
  // recently run_cmp3urrg298gd0ilw7supigsk (KOO-70, 2026-05-13,
  // TASK_PROCESS_OOM_KILLED at 10m 30s). The controller Claude + worker
  // Claude processes + customer node_modules + checked-out branch +
  // Playwright Chromium do not fit. medium-1x (1 vCPU / 2GB) is the
  // confirmed floor for deliver/build. Do not lower this without first
  // making the in-container memory footprint actually smaller — the
  // experiment has been run.
  machine: "medium-1x",
  queue: {
    // Each Trigger.dev run gets its own machine, so filesystem races
    // (credentials staging, git working tree) aren't a concern. Bug B's
    // fix made the waitpoint resolver per-issue, so same-issue retry
    // loops can't happen. Concurrency 3 lets independent issues
    // progress in parallel while keeping Claude API request volume
    // bounded. Raise if queue waits hurt throughput; lower if Claude
    // rate-limits start biting.
    concurrencyLimit: 3,
  },
  retry: {
    maxAttempts: 1,
  },
  run: async (rawPayload: unknown, { ctx }) => {
    const config = readConfig();
    await stageClaudeCredentials();
    const payload = normalizeRunPayload(autoshipRunPayloadSchema.parse(rawPayload));
    const phaseDescription = describeAutoshipPhase(payload.phase);
    const runId = ctx.run.id;

    metadata
      .set("status", "picked-up")
      .set("issueId", payload.issueId)
      .set("phase", payload.phase)
      .set("repo", payload.repo.fullName)
      .set("triggerReason", payload.triggerReason);
    await metadata.flush();

    logger.info("Autoship picked up issue", {
      issueId: payload.issueId,
      phase: payload.phase,
      repo: payload.repo.fullName,
      triggerReason: payload.triggerReason,
      targetState: payload.targetState,
    });

    const dispatchCommentId = await logger.trace(
      "linear: post dispatch comment",
      async (span) => {
        span.setAttribute("autoship.issue_id", payload.issueId);
        if (!config.LINEAR_API_KEY) {
          span.setAttribute("linear.skipped", "missing_api_key");
          return undefined;
        }
        if (!payload.issueUuid) {
          span.setAttribute("linear.skipped", "missing_issue_uuid");
          return undefined;
        }
        try {
          const id = await createComment({
            apiKey: config.LINEAR_API_KEY,
            issueId: payload.issueUuid,
            body: formatDispatchBody({ payload, phaseDescription, runId }),
          });
          if (id) {
            span.setAttribute("linear.delivered", true);
            span.setAttribute("linear.comment_id", id);
          } else {
            span.setAttribute("linear.delivered", false);
            span.setAttribute("linear.skipped", "comment_id_missing_in_response");
          }
          return id;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          span.setAttribute("linear.delivered", false);
          span.setAttribute("error", true);
          span.setAttribute("error.message", message);
          logger.warn("Linear dispatch comment failed", { error: message });
          return undefined;
        }
      },
      { icon: "linear" },
    );

    metadata.set("status", "checking-out-repo");
    await metadata.flush();
    const repoPath = await logger.trace(
      "git: prepare repository checkout",
      async (span) => {
        span.setAttribute("git.repository", payload.repo.fullName);
        span.setAttribute("git.branch", payload.repo.defaultBranch);
        logger.info("Preparing repository checkout", {
          repo: payload.repo.fullName,
          defaultBranch: payload.repo.defaultBranch,
        });

        const checkoutPath = await ensureRepoCheckout({
          reposRoot: config.AUTOSHIP_REPOS_ROOT,
          payload,
        });

        span.setAttribute("git.checkout_path", checkoutPath);
        logger.info("Repository checkout ready", { repoPath: checkoutPath });
        return checkoutPath;
      },
      { icon: "git-branch" },
    );

    // Wait/resume loop: one Claude run per iteration. We park between
    // iterations whenever the controller halts with phase: needs_attention,
    // and resume the same Claude session when the human replies.
    let humanReply: HumanReplyPayload | undefined = undefined;
    let iteration = 0;
    let result: AutoshipRunResult;

    while (true) {
      iteration += 1;
      metadata.set("status", iteration === 1 ? "running-controller" : `running-controller-iter-${iteration}`);
      await metadata.flush();

      result = await logger.trace(
        iteration === 1 ? "autoship: run controller agent" : `autoship: run controller agent (iter ${iteration})`,
        async (span) => {
          span.setAttribute("autoship.issue_id", payload.issueId);
          span.setAttribute("autoship.phase", payload.phase);
          span.setAttribute("autoship.repo_path", repoPath);
          span.setAttribute("autoship.iteration", iteration);
          logger.info("Starting Autoship controller", {
            issueId: payload.issueId,
            phase: payload.phase,
            phaseDescription,
            iteration,
            resuming: humanReply !== undefined,
          });

          const autoshipResult = await runAutoship({
            config,
            payload,
            repoPath,
            humanReply,
          });

          span.setAttribute("autoship.exit_code", autoshipResult.exitCode);
          span.setAttribute("autoship.status", autoshipResult.status);
          if (autoshipResult.postRunPhase) span.setAttribute("autoship.post_run_phase", autoshipResult.postRunPhase);
          return autoshipResult;
        },
        { icon: "bot" },
      );

      // Decide whether to park.
      if (result.exitCode !== 0) break; // failed run — don't park
      if (result.postRunPhase !== "needs_attention") break; // terminal phase

      await updateLinearDispatchComment({
        config,
        payload,
        phaseDescription,
        runId,
        result,
        dispatchCommentId,
        traceName: "linear: update dispatch comment before waitpoint",
      });

      // Park: fresh waitpoint per iteration. Webhook handler will complete
      // it by looking up `tags: [issue:<id>, autoship-waitpoint]` + WAITING.
      // See AUTOSHIP_WAITPOINT_TAG above for why we cannot use an idempotency
      // key here.
      logger.info("Parking task at waitpoint", {
        issueId: payload.issueId,
        iteration,
        timeoutDays: config.AUTOSHIP_WAITPOINT_TIMEOUT_DAYS,
      });

      metadata.set("status", "waiting-for-human");
      await metadata.flush();

      const token = await wait.createToken({
        timeout: `${config.AUTOSHIP_WAITPOINT_TIMEOUT_DAYS}d`,
        tags: [`issue:${payload.issueId}`, AUTOSHIP_WAITPOINT_TAG],
      });

      metadata.set("waitpointTokenId", token.id);
      await metadata.flush();

      const tokenResult = await wait.forToken<HumanReplyPayload>(token);
      if (!tokenResult.ok) {
        logger.warn("Waitpoint timed out before human replied", {
          issueId: payload.issueId,
          waitpointTokenId: token.id,
        });
        // Fall through with the prior result; the post-run Linear comment
        // names this as a timeout-while-needs-attention.
        break;
      }

      humanReply = tokenResult.output;
      logger.info("Resumed from waitpoint", {
        issueId: payload.issueId,
        source: humanReply?.source,
      });
    }

    metadata.set("status", result.status).set("exitCode", result.exitCode);
    await metadata.flush();
    logger.info("Autoship finished", {
      issueId: result.issueId,
      status: result.status,
      exitCode: result.exitCode,
      command: result.command,
    });
    if (result.stderrTail) logger.error("Autoship stderr tail", { stderrTail: result.stderrTail });

    await updateLinearDispatchComment({
      config,
      payload,
      phaseDescription,
      runId,
      result,
      dispatchCommentId,
      traceName: "linear: update dispatch comment",
    });

    return result;
  },
});

async function updateLinearDispatchComment({
  config,
  payload,
  phaseDescription,
  runId,
  result,
  dispatchCommentId,
  traceName,
}: {
  config: AppConfig;
  payload: AutoshipRunPayload;
  phaseDescription: string;
  runId: string;
  result: AutoshipRunResult;
  dispatchCommentId: string | undefined;
  traceName: string;
}): Promise<void> {
  await logger.trace(
    traceName,
    async (span) => {
      span.setAttribute("autoship.issue_id", payload.issueId);
      span.setAttribute("autoship.status", result.status);
      if (result.postRunPhase) span.setAttribute("autoship.post_run_phase", result.postRunPhase);
      if (!config.LINEAR_API_KEY) {
        span.setAttribute("linear.skipped", "missing_api_key");
        return;
      }
      if (!dispatchCommentId) {
        span.setAttribute("linear.skipped", "no_dispatch_comment");
        return;
      }
      span.setAttribute("linear.comment_id", dispatchCommentId);
      try {
        await updateComment({
          apiKey: config.LINEAR_API_KEY,
          commentId: dispatchCommentId,
          body: formatFinishedBody({
            payload,
            phaseDescription,
            runId,
            result,
            includeMetrics: config.AUTOSHIP_LINEAR_POST_METADATA,
          }),
        });
        span.setAttribute("linear.delivered", true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        span.setAttribute("linear.delivered", false);
        span.setAttribute("error", true);
        span.setAttribute("error.message", message);
        logger.warn("Linear update comment failed", { error: message });
      }
    },
    { icon: "linear" },
  );
}

function normalizeRunPayload(payload: AutoshipRunPayload): AutoshipRunPayload {
  return payload.phase === "materialize" ? { ...payload, phase: "create-issues" } : payload;
}

function describeAutoshipPhase(
  phase: "auto" | "groom" | "build" | "create-issues" | "materialize",
): string {
  if (phase === "auto") return "automatic groom/build";
  if (phase === "groom") return "grooming";
  if (phase === "create-issues" || phase === "materialize") return "create child issues from approved breakdown";
  return "build";
}

/**
 * Trigger.dev injects TRIGGER_PROJECT_REF into the worker env (see the
 * generated Containerfile from `trigger deploy`). When present, link the
 * run id to its dashboard page so reviewers can jump from a Linear comment
 * straight to the trace tree, logs, and replay button. Falls back to a
 * plain code-formatted run id locally where the env var is absent.
 */
function formatRunReference(runId: string): string {
  const projectRef = process.env.TRIGGER_PROJECT_REF;
  if (!projectRef) return `\`${runId}\``;
  return `[\`${runId}\`](https://cloud.trigger.dev/projects/v3/${projectRef}/runs/${runId})`;
}

function formatDispatchBody({
  payload,
  phaseDescription,
  runId,
}: {
  payload: AutoshipRunPayload;
  phaseDescription: string;
  runId: string;
}): string {
  return `🤖 Autoship dispatched ${payload.issueId} — phase: ${phaseDescription}\nRun: ${formatRunReference(runId)}`;
}

function formatFinishedBody({
  payload,
  phaseDescription,
  runId,
  result,
  includeMetrics,
}: {
  payload: AutoshipRunPayload;
  phaseDescription: string;
  runId: string;
  result: AutoshipRunResult;
  includeMetrics: boolean;
}): string {
  const header = `🤖 Autoship dispatched ${payload.issueId} — phase: ${phaseDescription}\nRun: ${formatRunReference(runId)}`;
  const needsAttention = result.status === "completed" && result.postRunPhase === "needs_attention";
  const statusLine = result.status === "completed"
    ? needsAttention
      ? `⏸️ Needs attention${formatDuration(result.metrics?.durationMs)}`
      : `✅ Finished${formatDuration(result.metrics?.durationMs)}`
    : `❌ Failed (exit ${result.exitCode}${formatSubtype(result.metrics?.subtype)})`;
  const outcome = formatOutcomeDetail(result);

  if (!includeMetrics || !result.metrics) {
    return `${header}\n\n${statusLine}${outcome}`;
  }

  const detail = formatMetricsDetail(result.metrics);
  return `${header}\n\n${statusLine}${detail ? ` · ${detail}` : ""}${outcome}`;
}

function formatOutcomeDetail(result: AutoshipRunResult): string {
  const lines: string[] = [];
  const phase = result.postRunRawPhase && result.postRunRawPhase !== result.postRunPhase
    ? `${result.postRunPhase} (legacy ${result.postRunRawPhase})`
    : result.postRunPhase;

  if (phase) lines.push(`Manifest phase: \`${phase}\``);
  if (result.outcome) lines.push(`Outcome: \`${result.outcome}\``);
  if (result.branch) lines.push(`Branch: \`${result.branch}\``);
  if (result.prUrl) {
    lines.push(`PR: ${result.prUrl}`);
  } else if (result.githubSkippedReason) {
    lines.push(`PR: skipped — ${result.githubSkippedReason}`);
  }
  if (result.buildDeferredReason) lines.push(`Build deferred: ${result.buildDeferredReason}`);
  if (result.linearSkippedReason) lines.push(`Controller Linear mirror skipped: ${result.linearSkippedReason}`);

  return lines.length > 0 ? `\n\n${lines.join("\n")}` : "";
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "";
  const seconds = ms / 1000;
  if (seconds < 60) return ` in ${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return ` in ${minutes}m ${remainder}s`;
}

function formatSubtype(subtype: string | undefined): string {
  return subtype && subtype !== "success" ? `, ${subtype}` : "";
}

function formatMetricsDetail(metrics: ClaudeRunMetrics): string {
  const parts: string[] = [];
  if (metrics.model) parts.push(`\`${metrics.model}\``);
  if (metrics.turns !== undefined) parts.push(`${metrics.turns} ${metrics.turns === 1 ? "turn" : "turns"}`);
  const tokenLine = formatTokens(metrics);
  if (tokenLine) parts.push(tokenLine);
  if (metrics.costUsd !== undefined) parts.push(`$${metrics.costUsd.toFixed(2)}`);
  return parts.join(" · ");
}

function formatTokens(metrics: ClaudeRunMetrics): string | undefined {
  const input = metrics.inputTokens ?? 0;
  const output = metrics.outputTokens ?? 0;
  const cacheRead = metrics.cacheReadTokens ?? 0;
  const total = input + output + cacheRead;
  if (total === 0) return undefined;

  const totalLabel = formatTokenCount(total);
  if (cacheRead > 0 && total > 0) {
    const cacheRatio = Math.round((cacheRead / total) * 100);
    return `${totalLabel} tokens (cache ${cacheRatio}%)`;
  }
  return `${totalLabel} tokens`;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}
