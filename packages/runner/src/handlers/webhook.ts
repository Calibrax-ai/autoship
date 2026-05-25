import { runs, tasks, wait } from "@trigger.dev/sdk";
import type { AppConfig } from "../config.js";
import { createAgentActivity } from "../linear/activities.js";
import type { LinearWebhookConfig } from "../linear/resolve-filters.js";
import { isFreshLinearWebhook, verifyLinearSignature } from "../linear/signature.js";
import {
  extractHumanReply,
  extractWebhookIssueId,
  parseLinearCommentResume,
  parseLinearWebhook,
} from "../linear/webhook.js";
import { buildRunIdempotencyKey, buildTriggerOptions } from "../server-options.js";
import { AUTOSHIP_WAITPOINT_TAG } from "../trigger/autoship-run.js";
import type { autoshipIssueRun } from "../trigger/autoship-run.js";
import type { HumanReplyPayload } from "../types.js";

export type WebhookResponse = {
  status: number;
  body: string;
  contentType?: string;
};

/**
 * Runtime-agnostic Linear webhook handler. Called by both the Cloud Run
 * Node server (src/server.ts) and the Vercel API route (api/webhooks/linear.ts).
 */
export async function handleLinearWebhook({
  rawBody,
  signatureHeader,
  config,
  linearWebhookConfig,
}: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  config: AppConfig;
  linearWebhookConfig: LinearWebhookConfig;
}): Promise<WebhookResponse> {
  const verified = verifyLinearSignature({
    rawBody,
    signatureHeader,
    secret: config.LINEAR_WEBHOOK_SECRET,
  });
  if (!verified) return text(401, "invalid signature");

  const webhookPayload = JSON.parse(rawBody.toString("utf8")) as unknown;
  const webhookSummary = summarizeWebhook(webhookPayload);
  console.log(`Linear webhook received: ${webhookSummary}`);

  // Path 1: human reply that completes an active waitpoint.
  const issueId = extractWebhookIssueId(webhookPayload);
  const humanReply = issueId ? extractHumanReply(webhookPayload, linearWebhookConfig) : null;
  if (issueId && humanReply) {
    // Only complete the waitpoint if there's a live WAITING run that owns
    // it. Without this guard, an orphan WAITING token from a dead run gets
    // "completed" via the API but no container actually wakes — and Path 1
    // would return true, swallowing the comment. Gate on run state so
    // genuinely-parked runs wake (Path 1) and dead-run orphans fall
    // through to Path 1.5 for a fresh dispatch.
    const hasWaiting = await hasWaitingRunForIssue(issueId);
    if (hasWaiting) {
      const completed = await tryCompleteWaitpoint(issueId, humanReply);
      if (completed) {
        return json(202, { ok: true, completed: "waitpoint", issueId });
      }
    }

    // Path 1.5: human comment but no parked container — dispatch a fresh
    // run carrying the comment as promptContext. Closes the UX gap where
    // a comment lands after the container has died (controller crash,
    // waitpoint timeout, normal completion) and otherwise vanishes
    // silently. The controller reconciles from the branch's manifest.
    const resumePayload = await parseLinearCommentResume(
      webhookPayload,
      linearWebhookConfig,
      humanReply,
      config.LINEAR_API_KEY,
    );
    if (resumePayload && isFreshLinearWebhook(resumePayload.linear?.webhookTimestamp)) {
      const handle = await tasks.trigger<typeof autoshipIssueRun>(
        "autoship-issue-run",
        resumePayload,
        buildTriggerOptions(resumePayload),
      );
      console.log(
        `Trigger.dev run accepted (comment-resume): issue=${resumePayload.issueId} run=${handle.id} idempotencyKey=${buildRunIdempotencyKey(resumePayload)}`,
      );
      await createAgentActivity({
        apiKey: config.LINEAR_API_KEY,
        agentSessionId: resumePayload.agentSessionId,
        content: {
          type: "thought",
          body: `Autoship accepted ${resumePayload.issueId} (comment-resume). Trigger.dev run: ${handle.id}`,
        },
      });
      return json(202, { ok: true, runId: handle.id, source: "comment-resume", issueId });
    }
  }

  // Path 2: new task trigger.
  const runPayload = parseLinearWebhook(webhookPayload, linearWebhookConfig);
  if (!runPayload) {
    console.log(
      `Linear webhook ignored: ${webhookSummary} debug=${diagnoseIgnoredWebhook(webhookPayload)}`,
    );
    return text(202, "ignored");
  }
  if (!isFreshLinearWebhook(runPayload.linear?.webhookTimestamp)) {
    return text(401, "stale webhook");
  }

  const handle = await tasks.trigger<typeof autoshipIssueRun>(
    "autoship-issue-run",
    runPayload,
    buildTriggerOptions(runPayload),
  );
  console.log(
    `Trigger.dev run accepted: issue=${runPayload.issueId} phase=${runPayload.phase} run=${handle.id} idempotencyKey=${buildRunIdempotencyKey(runPayload)}`,
  );

  await createAgentActivity({
    apiKey: config.LINEAR_API_KEY,
    agentSessionId: runPayload.agentSessionId,
    content: {
      type: "thought",
      body: `Autoship accepted ${runPayload.issueId} (${runPayload.phase}). Trigger.dev run: ${handle.id}`,
    },
  });

  return json(202, { ok: true, runId: handle.id });
}

/**
 * Detect a currently-parked autoship-issue-run for this issue. Trigger.dev
 * reports a run as `WAITING` while it's blocked on `wait.forToken()`. If
 * no such run exists, any WAITING waitpoint tagged for this issue is an
 * orphan (its parent died before resolving the token), and completing it
 * via the API would silently swallow the comment without waking anything.
 * In that case we fall through to Path 1.5 for a fresh dispatch.
 */
async function hasWaitingRunForIssue(issueId: string): Promise<boolean> {
  try {
    for await (const run of runs.list({
      tag: [`issue:${issueId}`],
      status: ["WAITING"],
      limit: 1,
    })) {
      void run;
      return true;
    }
  } catch (err) {
    // If we can't determine state, prefer the safer behavior: assume there
    // IS a waiting run so the existing Path 1 logic runs. Worst case the
    // orphan-waitpoint bug recurs for this comment; best case nothing
    // changes.
    console.warn(
      `hasWaitingRunForIssue: list failed for issue=${issueId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return true;
  }
  return false;
}

async function tryCompleteWaitpoint(issueId: string, reply: HumanReplyPayload): Promise<boolean> {
  // Find the live waitpoint for this issue by tag. Each park creates a fresh
  // token (no idempotency key — see autoship-run.ts AUTOSHIP_WAITPOINT_TAG
  // for why), and per-issue concurrency guarantees ≤1 WAITING token at a
  // time. If more than one matches (e.g. a stale token from a crashed run),
  // we complete each in turn until one succeeds.
  const tags = [`issue:${issueId}`, AUTOSHIP_WAITPOINT_TAG];
  try {
    for await (const token of wait.listTokens({ tags, status: ["WAITING"] })) {
      await wait.completeToken(token, reply);
      console.log(
        `Waitpoint completed: issue=${issueId} tokenId=${token.id} source=${reply.source}`,
      );
      return true;
    }
  } catch (err) {
    console.warn(
      `Waitpoint completion attempt failed: issue=${issueId} tags=${tags.join(",")} error=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return false;
}

/**
 * Probe a payload that parseLinearWebhook rejected and report which gate it
 * failed: missing project match, missing updatedFrom (so isIssueStateChangeEvent
 * is false), or state name mismatch. Helps diagnose webhook shape drift between
 * what Linear sends today and what the parser expects.
 */
function diagnoseIgnoredWebhook(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "non-object-payload";
  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const issue = data.issue && typeof data.issue === "object" ? (data.issue as Record<string, unknown>) : data;

  const topUpdatedFrom = record.updatedFrom && typeof record.updatedFrom === "object"
    ? Object.keys(record.updatedFrom as Record<string, unknown>)
    : null;
  const dataUpdatedFrom = data.updatedFrom && typeof data.updatedFrom === "object"
    ? Object.keys(data.updatedFrom as Record<string, unknown>)
    : null;
  const issueUpdatedFrom = issue.updatedFrom && typeof issue.updatedFrom === "object"
    ? Object.keys(issue.updatedFrom as Record<string, unknown>)
    : null;

  return [
    `topLevelKeys=${Object.keys(record).join(",")}`,
    `dataKeys=${Object.keys(data).join(",")}`,
    `topUpdatedFrom=${topUpdatedFrom ? `[${topUpdatedFrom.join(",")}]` : "missing"}`,
    `dataUpdatedFrom=${dataUpdatedFrom ? `[${dataUpdatedFrom.join(",")}]` : "missing"}`,
    `issueUpdatedFrom=${issueUpdatedFrom ? `[${issueUpdatedFrom.join(",")}]` : "missing"}`,
  ].join(" ");
}

function summarizeWebhook(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "invalid-payload";

  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const issue = data.issue && typeof data.issue === "object" ? (data.issue as Record<string, unknown>) : data;
  const identifier = typeof issue.identifier === "string" ? issue.identifier : undefined;
  const state = issue.state && typeof issue.state === "object" ? (issue.state as Record<string, unknown>) : {};
  const project = issue.project && typeof issue.project === "object" ? (issue.project as Record<string, unknown>) : {};

  return [
    `type=${String(record.type ?? "unknown")}`,
    `action=${String(record.action ?? "unknown")}`,
    identifier ? `issue=${identifier}` : undefined,
    typeof data.projectId === "string" ? `projectId=${data.projectId}` : undefined,
    typeof project.name === "string" ? `project=${project.name}` : undefined,
    typeof data.stateId === "string" ? `stateId=${data.stateId}` : undefined,
    typeof state.name === "string" ? `state=${state.name}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function json(status: number, body: object): WebhookResponse {
  return { status, body: JSON.stringify(body), contentType: "application/json" };
}

function text(status: number, body: string): WebhookResponse {
  return { status, body };
}
