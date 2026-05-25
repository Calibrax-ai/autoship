import { z } from "zod";
import type { ProjectConfig } from "../projects.config.js";
import type { AutoshipRunPayload, HumanReplyPayload } from "../types.js";
import { getIssueProject } from "./activities.js";
import type { LinearWebhookConfig } from "./resolve-filters.js";

const linearWebhookSchema = z
  .object({
    action: z.string(),
    type: z.string(),
    webhookTimestamp: z.number().optional(),
    data: z.unknown().optional(),
    agentSession: z.unknown().optional(),
  })
  .passthrough();

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getEventId(payload: JsonObject): string | undefined {
  return readString(payload.webhookId) ?? readString(payload.id);
}

function getAgentSession(payload: JsonObject): JsonObject {
  const data = asObject(payload.data);
  return asObject(payload.agentSession ?? data.agentSession);
}

function getIssue(agentSession: JsonObject, payload: JsonObject): JsonObject {
  const data = asObject(payload.data);
  return asObject(agentSession.issue ?? data.issue ?? data);
}

function getIssueId(issue: JsonObject): string | undefined {
  return readString(issue.identifier) ?? readString(issue.id);
}

function getIssueUuid(issue: JsonObject): string | undefined {
  return readString(issue.id);
}

function getIssueUrl(issue: JsonObject): string | undefined {
  return readString(issue.url);
}

function getProjectId(issue: JsonObject, payload: JsonObject): string | undefined {
  const data = asObject(payload.data);
  const project = asObject(issue.project ?? data.project);

  return readString(project.id) ?? readString(issue.projectId) ?? readString(data.projectId);
}

function getProjectName(issue: JsonObject, payload: JsonObject): string | undefined {
  const data = asObject(payload.data);
  const project = asObject(issue.project ?? data.project);

  return readString(project.name) ?? readString(issue.projectName) ?? readString(data.projectName);
}

function getStateId(issue: JsonObject, payload: JsonObject): string | undefined {
  const data = asObject(payload.data);
  const state = asObject(issue.state ?? data.state);

  return readString(state.id) ?? readString(issue.stateId) ?? readString(data.stateId);
}

function getStateName(issue: JsonObject, payload: JsonObject): string | undefined {
  const data = asObject(payload.data);
  const state = asObject(issue.state ?? data.state);

  return readString(state.name) ?? readString(issue.stateName) ?? readString(data.stateName);
}

function hasStateChange(payload: JsonObject): boolean {
  const updatedFrom = asObject(payload.updatedFrom);
  const updatedFromState = asObject(updatedFrom.state);

  return Boolean(
    readString(updatedFrom.stateId) ?? readString(updatedFrom.stateName) ?? readString(updatedFromState.name),
  );
}

function getPromptContext(agentSession: JsonObject, payload: JsonObject): string | undefined {
  return readString(agentSession.promptContext) ?? readString(payload.promptContext);
}

function isAgentSessionEvent(parsed: z.infer<typeof linearWebhookSchema>, agentSession: JsonObject): boolean {
  return parsed.type === "AgentSessionEvent" && parsed.action === "created" && Boolean(readString(agentSession.id));
}

function isIssueStateChangeEvent(parsed: z.infer<typeof linearWebhookSchema>, payload: JsonObject): boolean {
  return parsed.type === "Issue" && parsed.action === "update" && hasStateChange(payload);
}

/**
 * Find the matching ProjectConfig for an incoming webhook event.
 * Prefers projectId match; falls back to project name (case the resolver
 * couldn't fill in the projectId). Returns null if no project matches.
 */
function matchProject(
  issue: JsonObject,
  payload: JsonObject,
  config: LinearWebhookConfig,
): ProjectConfig | null {
  const projectId = getProjectId(issue, payload);
  if (projectId) {
    const byId = config.projectsById.get(projectId);
    if (byId) return byId;
  }

  const projectName = getProjectName(issue, payload);
  if (projectName) {
    const byName = config.projects.find((p) => p.linear.project === projectName);
    if (byName) return byName;
  }

  return null;
}

function matchesState({
  stateId,
  stateName,
  expectedId,
  expectedName,
}: {
  stateId: string | undefined;
  stateName: string | undefined;
  expectedId: string | undefined;
  expectedName: string | undefined;
}): boolean {
  // Either match wins. ID match catches the "state was renamed" case for the
  // team whose UUID was resolved at startup. Name match handles the multi-team
  // case where each Linear team has its own UUID for the same state name —
  // names are the cross-team contract (see CONTRACTS.md Surface 1).
  if (expectedId && stateId === expectedId) return true;
  if (expectedName && stateName === expectedName) return true;
  return false;
}

/**
 * Extract the Linear issue identifier (e.g. "FRD-161") from any webhook
 * payload that's about an issue or a comment on an issue. Used to look up
 * an active autoship waitpoint by deterministic id.
 */
export function extractWebhookIssueId(rawJson: unknown): string | null {
  let parsed: z.infer<typeof linearWebhookSchema>;
  try {
    parsed = linearWebhookSchema.parse(rawJson);
  } catch {
    return null;
  }
  const payload = parsed as JsonObject;
  const data = asObject(payload.data);

  if (parsed.type === "Comment") {
    const issue = asObject(data.issue);
    return getIssueId(issue) ?? null;
  }

  const agentSession = getAgentSession(payload);
  const issue = getIssue(agentSession, payload);
  return getIssueId(issue) ?? null;
}

/**
 * Prefix of comments the runner posts itself (formatDispatchBody +
 * formatFinishedBody in src/trigger/autoship-run.ts). These show up in the
 * webhook stream like any other comment, and the bot writes through the
 * configured LINEAR_API_KEY user — the same identity a human reply would
 * carry, so author-based filtering can't distinguish them. Prefix-matching
 * the body does. Keep this string in sync with the producer if it ever
 * changes (rare; the 🤖 emoji + brand prefix is a stable surface).
 */
const RUNNER_BOT_COMMENT_PREFIX = "🤖 Autoship ";

/**
 * Detect events that should be treated as a human reply to a parked
 * autoship task: a Linear comment, or a state change on an issue that
 * already has an active waitpoint. Returns the structured reply payload
 * the parked task receives via wait.forToken().
 *
 * Filters out bot-initiated events that would otherwise resolve the
 * waitpoint instantly and produce a retry loop:
 *   - Comments whose body starts with the runner's bot prefix.
 *   - State changes that don't land on a configured trigger state
 *     (Run Agent, Breakdown Approved, optional Build). The autoship
 *     controller halts by transitioning Linear to "Needs Attention";
 *     that transition fires a webhook with the bot's own LINEAR_API_KEY
 *     identity and would otherwise complete the waitpoint immediately.
 *     Only transitions back into a trigger state count as "the human
 *     pushed retry."
 */
export function extractHumanReply(
  rawJson: unknown,
  config: LinearWebhookConfig,
): HumanReplyPayload | null {
  let parsed: z.infer<typeof linearWebhookSchema>;
  try {
    parsed = linearWebhookSchema.parse(rawJson);
  } catch {
    return null;
  }
  const payload = parsed as JsonObject;
  const data = asObject(payload.data);

  if (parsed.type === "Comment" && (parsed.action === "create" || parsed.action === "update")) {
    const body = readString(data.body);
    if (!body) return null;
    if (body.startsWith(RUNNER_BOT_COMMENT_PREFIX)) return null;
    const user = asObject(data.user);
    const author = readString(user.name) ?? readString(user.displayName) ?? readString(user.email);
    return {
      source: "linear-comment",
      commentBody: body,
      commentAuthor: author,
    };
  }

  if (parsed.type === "Issue" && parsed.action === "update" && hasStateChange(payload)) {
    const issue = getIssue(getAgentSession(payload), payload);
    const stateName = getStateName(issue, payload);
    const stateId = getStateId(issue, payload);
    if (!stateName) return null;
    const isTriggerState =
      matchesState({
        stateId,
        stateName,
        expectedId: config.AUTOSHIP_LINEAR_AUTO_STATE_ID,
        expectedName: config.AUTOSHIP_LINEAR_AUTO_STATE,
      }) ||
      matchesState({
        stateId,
        stateName,
        expectedId: config.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID,
        expectedName: config.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE,
      }) ||
      matchesState({
        stateId,
        stateName,
        expectedId: config.AUTOSHIP_LINEAR_BUILD_STATE_ID,
        expectedName: config.AUTOSHIP_LINEAR_BUILD_STATE,
      });
    if (!isTriggerState) return null;
    return {
      source: "linear-state-change",
      newState: stateName,
    };
  }

  return null;
}

/**
 * Build a fresh autoship-issue-run payload for a Linear *comment* event when
 * no parked container exists for the issue.
 *
 * Background: the webhook handler resolves comments via two paths.
 *   Path 1 — `tryCompleteWaitpoint`: complete an active WAITING token, waking
 *            the parked container. Works only while a container is alive.
 *   Path 2 — `parseLinearWebhook`: dispatch a fresh run on a state-change
 *            into a configured trigger state. Doesn't fire on comments.
 *
 * If the parked container has died (controller crash, waitpoint timeout, or
 * the run completed normally then the user came back later), a comment lands
 * with nothing to receive it — Path 1 returns false, Path 2 returns null,
 * webhook returns 202 ignored. From the user's POV, "I commented and nothing
 * happened" — the leaky implementation detail of container-state surfacing
 * into product UX.
 *
 * This parser closes the gap: any non-bot human comment on a configured-
 * project issue dispatches a fresh `autoship-issue-run` carrying the comment
 * body as `promptContext`. The controller reads `manifest.json` from the
 * existing branch (if any), reconciles, and acts on the new human signal —
 * or no-ops cheaply if the issue is in a state where the comment isn't
 * actionable (Done, Cancelled, etc.). We deliberately don't filter by issue
 * state here: the controller already has Linear MCP and knows its own
 * lifecycle. Pushing that decision down avoids state-name config drift and
 * matches the user's mental model ("comment = autoship reacts").
 *
 * Bot-authored comments (the runner's own dispatch/finish announcements) are
 * filtered upstream by `extractHumanReply`, which the webhook handler calls
 * first; this parser only sees genuine human input.
 */
export async function parseLinearCommentResume(
  rawJson: unknown,
  config: LinearWebhookConfig,
  humanReply: HumanReplyPayload,
  linearApiKey: string | undefined,
): Promise<AutoshipRunPayload | null> {
  if (humanReply.source !== "linear-comment") return null;
  let parsed: z.infer<typeof linearWebhookSchema>;
  try {
    parsed = linearWebhookSchema.parse(rawJson);
  } catch {
    return null;
  }
  if (parsed.type !== "Comment") return null;
  if (parsed.action !== "create" && parsed.action !== "update") return null;

  const payload = parsed as JsonObject;
  const data = asObject(payload.data);
  const issue = asObject(data.issue);

  const issueId = getIssueId(issue);
  if (!issueId) return null;

  // Sync match first using anything the webhook payload provided.
  let project: ProjectConfig | null = matchProject(issue, payload, config);

  // Linear's Comment webhook embeds only a minimal `data.issue` reference
  // (id, identifier, url) without the nested project. Fall back to one
  // GraphQL lookup so legitimate comments on configured-project issues
  // don't silently drop out.
  if (!project) {
    const issueUuid = getIssueUuid(issue);
    if (issueUuid && linearApiKey) {
      try {
        const resolved = await getIssueProject({ apiKey: linearApiKey, issueUuid });
        if (resolved) {
          if (resolved.id) {
            project = config.projectsById.get(resolved.id) ?? project;
          }
          if (!project && resolved.name) {
            project = config.projects.find((p) => p.linear.project === resolved.name) ?? project;
          }
        }
      } catch (err) {
        console.warn(
          `parseLinearCommentResume: Linear API project lookup failed for issue=${issueId} issueUuid=${issueUuid}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  if (!project) {
    console.log(
      `parseLinearCommentResume: project not resolvable for issue=${issueId}; skipping dispatch`,
    );
    return null;
  }

  const eventId = getEventId(payload);
  const stateName = getStateName(issue, payload);
  const author = humanReply.commentAuthor ?? "unknown";
  const body = humanReply.commentBody ?? "";

  return {
    trigger: "linear-comment",
    phase: "auto",
    eventId,
    targetState: stateName,
    triggerReason: "linear-comment-resume",
    issueId,
    issueUuid: getIssueUuid(issue),
    issueUrl: getIssueUrl(issue),
    agentSessionId: undefined,
    promptContext: `[Linear comment from ${author}]\n\n${body}`,
    repo: {
      fullName: project.repo.fullName,
      cloneUrl: project.repo.cloneUrl,
      defaultBranch: project.repo.branch,
    },
    linear: {
      eventId,
      action: parsed.action,
      webhookType: parsed.type,
      webhookTimestamp: parsed.webhookTimestamp,
      project: project.linear.project,
    },
  };
}

export function parseLinearWebhook(rawJson: unknown, config: LinearWebhookConfig): AutoshipRunPayload | null {
  const parsed = linearWebhookSchema.parse(rawJson);
  const payload = parsed as JsonObject;
  const agentSession = getAgentSession(payload);
  const issue = getIssue(agentSession, payload);
  const issueId = getIssueId(issue);
  const targetStateId = getStateId(issue, payload);
  const targetState = getStateName(issue, payload);

  if (!issueId) return null;
  const project = matchProject(issue, payload, config);
  if (!project) return null;

  let phase: AutoshipRunPayload["phase"];
  let triggerReason: AutoshipRunPayload["triggerReason"];

  if (isAgentSessionEvent(parsed, agentSession)) {
    phase = "auto";
    triggerReason = "agent-session";
  } else if (
    isIssueStateChangeEvent(parsed, payload) &&
    matchesState({
      stateId: targetStateId,
      stateName: targetState,
      expectedId: config.AUTOSHIP_LINEAR_AUTO_STATE_ID,
      expectedName: config.AUTOSHIP_LINEAR_AUTO_STATE,
    })
  ) {
    phase = "auto";
    triggerReason = "auto-state";
  } else if (
    isIssueStateChangeEvent(parsed, payload) &&
    matchesState({
      stateId: targetStateId,
      stateName: targetState,
      expectedId: config.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID,
      expectedName: config.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE,
    })
  ) {
    phase = "create-issues";
    triggerReason = "breakdown-approved-state";
  } else if (
    isIssueStateChangeEvent(parsed, payload) &&
    matchesState({
      stateId: targetStateId,
      stateName: targetState,
      expectedId: config.AUTOSHIP_LINEAR_BUILD_STATE_ID,
      expectedName: config.AUTOSHIP_LINEAR_BUILD_STATE,
    })
  ) {
    phase = "build";
    triggerReason = "build-state";
  } else {
    return null;
  }

  const eventId = getEventId(payload);

  return {
    trigger: parsed.type === "AgentSessionEvent" ? "linear-agent-session" : "linear-state-change",
    phase,
    eventId,
    targetState: targetState ?? targetStateId,
    triggerReason,
    issueId,
    issueUuid: getIssueUuid(issue),
    issueUrl: getIssueUrl(issue),
    agentSessionId: readString(agentSession.id),
    promptContext: getPromptContext(agentSession, payload),
    repo: {
      fullName: project.repo.fullName,
      cloneUrl: project.repo.cloneUrl,
      defaultBranch: project.repo.branch,
    },
    linear: {
      eventId,
      action: parsed.action,
      webhookType: parsed.type,
      webhookTimestamp: parsed.webhookTimestamp,
      project: project.linear.project,
    },
  };
}
