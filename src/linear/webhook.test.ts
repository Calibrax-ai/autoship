import assert from "node:assert/strict";
import {
  extractHumanReply,
  extractWebhookIssueId,
  parseLinearCommentResume,
  parseLinearWebhook,
} from "./webhook.js";
import { makeTestProject, makeWebhookConfig } from "../test-helpers.js";

const config = makeWebhookConfig();

const agentSessionPayload = parseLinearWebhook(
  {
    id: "evt_agent",
    type: "AgentSessionEvent",
    action: "created",
    webhookTimestamp: 1_764_307_200_000,
    agentSession: {
      id: "agent-session-1",
      promptContext: "Please work on this.",
      issue: {
        identifier: "FRD-162",
        url: "https://linear.app/acme/issue/FRD-162/test",
        project: {
          name: "Autoship",
        },
      },
    },
  },
  config,
);

assert.equal(agentSessionPayload?.phase, "auto");
assert.equal(agentSessionPayload?.triggerReason, "agent-session");
assert.equal(agentSessionPayload?.eventId, "evt_agent");
assert.equal(agentSessionPayload?.agentSessionId, "agent-session-1");
assert.equal(agentSessionPayload?.linear?.project, "Autoship");

const autoStatePayload = parseLinearWebhook(
  {
    webhookId: "evt_auto_state",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_001,
    updatedFrom: {
      stateId: "old-state-id",
    },
    data: {
      identifier: "FRD-163",
      project: {
        name: "Autoship",
      },
      state: {
        name: "Run Agent",
      },
    },
  },
  config,
);

assert.equal(autoStatePayload?.phase, "auto");
assert.equal(autoStatePayload?.triggerReason, "auto-state");
assert.equal(autoStatePayload?.targetState, "Run Agent");

const breakdownApprovedPayload = parseLinearWebhook(
  {
    webhookId: "evt_breakdown_approved_state",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_001,
    updatedFrom: {
      stateId: "old-state-id",
    },
    data: {
      identifier: "FRD-161",
      project: {
        name: "Autoship",
      },
      state: {
        name: "Breakdown Approved",
      },
    },
  },
  config,
);

assert.equal(breakdownApprovedPayload?.phase, "create-issues");
assert.equal(breakdownApprovedPayload?.triggerReason, "breakdown-approved-state");
assert.equal(breakdownApprovedPayload?.targetState, "Breakdown Approved");

const buildStatePayload = parseLinearWebhook(
  {
    webhookId: "evt_build_state",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_002,
    updatedFrom: {
      stateId: "old-state-id",
    },
    data: {
      issue: {
        identifier: "FRD-164",
        project: {
          name: "Autoship",
        },
        state: {
          name: "Spec Ready",
        },
      },
    },
  },
  makeWebhookConfig({ AUTOSHIP_LINEAR_BUILD_STATE: "Spec Ready" }),
);

assert.equal(buildStatePayload?.phase, "build");
assert.equal(buildStatePayload?.triggerReason, "build-state");
assert.equal(buildStatePayload?.targetState, "Spec Ready");

assert.equal(
  parseLinearWebhook(
    {
      webhookId: "evt_build_state_default_disabled",
      type: "Issue",
      action: "update",
      webhookTimestamp: 1_764_307_200_002,
      updatedFrom: {
        stateId: "old-state-id",
      },
      data: {
        issue: {
          identifier: "FRD-164",
          project: {
            name: "Autoship",
          },
          state: {
            name: "Spec Ready",
          },
        },
      },
    },
    config,
  ),
  null,
);

assert.equal(
  parseLinearWebhook(
    {
      webhookId: "evt_ignore_non_state_update",
      type: "Issue",
      action: "update",
      webhookTimestamp: 1_764_307_200_003,
      data: {
        identifier: "FRD-165",
        project: {
          name: "Autoship",
        },
        state: {
          name: "Run Agent",
        },
      },
    },
    config,
  ),
  null,
);

assert.equal(
  parseLinearWebhook(
    {
      webhookId: "evt_ignore",
      type: "Issue",
      action: "update",
      webhookTimestamp: 1_764_307_200_004,
      updatedFrom: {
        stateId: "old-state-id",
      },
      data: {
        identifier: "FRD-166",
        project: {
          name: "Autoship",
        },
        state: {
          name: "Todo",
        },
      },
    },
    config,
  ),
  null,
);

assert.equal(
  parseLinearWebhook(
    {
      webhookId: "evt_ignore_wrong_project",
      type: "Issue",
      action: "update",
      webhookTimestamp: 1_764_307_200_005,
      updatedFrom: {
        stateId: "old-state-id",
      },
      data: {
        identifier: "FRD-167",
        project: {
          name: "Other Project",
        },
        state: {
          name: "Run Agent",
        },
      },
    },
    config,
  ),
  null,
);

// Multi-project: webhook for a second registered project routes to its repo.
const multiProjectConfig = makeWebhookConfig({}, [
  makeTestProject(),
  makeTestProject({
    linear: { project: "Gridfin", projectId: undefined },
    repo: {
      fullName: "Calibrax-ai/finance_backend_agent",
      cloneUrl: "https://github.com/Calibrax-ai/finance_backend_agent.git",
      branch: "main",
    },
  }),
]);
const gridfinPayload = parseLinearWebhook(
  {
    webhookId: "evt_gridfin",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_100,
    updatedFrom: { stateId: "old-state-id" },
    data: {
      identifier: "GRD-1",
      project: { name: "Gridfin" },
      state: { name: "Run Agent" },
    },
  },
  multiProjectConfig,
);
assert.equal(gridfinPayload?.repo.fullName, "Calibrax-ai/finance_backend_agent");
assert.equal(gridfinPayload?.linear?.project, "Gridfin");

// Filter by projectId: when registered project has projectId set, match by ID.
const idFilterConfig = makeWebhookConfig(
  {
    AUTOSHIP_LINEAR_AUTO_STATE_ID: "auto-state-id",
    AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID: "breakdown-approved-state-id",
    AUTOSHIP_LINEAR_BUILD_STATE_ID: "build-state-id",
  },
  [makeTestProject({ linear: { project: "Autoship", projectId: "project-id" } })],
);

const idOnlyAutoPayload = parseLinearWebhook(
  {
    webhookId: "evt_id_only_auto",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_007,
    updatedFrom: {
      stateId: "old-state-id",
    },
    data: {
      identifier: "FRD-169",
      projectId: "project-id",
      stateId: "auto-state-id",
    },
  },
  idFilterConfig,
);

assert.equal(idOnlyAutoPayload?.phase, "auto");
assert.equal(idOnlyAutoPayload?.targetState, "auto-state-id");

const idOnlyBreakdownPayload = parseLinearWebhook(
  {
    webhookId: "evt_id_only_breakdown",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_007,
    updatedFrom: {
      stateId: "old-state-id",
    },
    data: {
      identifier: "FRD-161",
      projectId: "project-id",
      stateId: "breakdown-approved-state-id",
    },
  },
  idFilterConfig,
);

assert.equal(idOnlyBreakdownPayload?.phase, "create-issues");
assert.equal(idOnlyBreakdownPayload?.triggerReason, "breakdown-approved-state");
assert.equal(idOnlyBreakdownPayload?.targetState, "breakdown-approved-state-id");

assert.equal(
  parseLinearWebhook(
    {
      webhookId: "evt_id_only_wrong_project",
      type: "Issue",
      action: "update",
      webhookTimestamp: 1_764_307_200_008,
      updatedFrom: {
        stateId: "old-state-id",
      },
      data: {
        identifier: "FRD-170",
        projectId: "other-project-id",
        stateId: "auto-state-id",
      },
    },
    idFilterConfig,
  ),
  null,
);

const withUuidPayload = parseLinearWebhook(
  {
    webhookId: "evt_with_uuid",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_009,
    updatedFrom: {
      stateId: "old-state-id",
    },
    data: {
      id: "11111111-2222-3333-4444-555555555555",
      identifier: "FRD-171",
      project: {
        name: "Autoship",
      },
      state: {
        name: "Run Agent",
      },
    },
  },
  config,
);

assert.equal(withUuidPayload?.issueId, "FRD-171");
assert.equal(withUuidPayload?.issueUuid, "11111111-2222-3333-4444-555555555555");

const withoutUuidPayload = parseLinearWebhook(
  {
    webhookId: "evt_without_uuid",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_010,
    updatedFrom: {
      stateId: "old-state-id",
    },
    data: {
      identifier: "FRD-172",
      project: {
        name: "Autoship",
      },
      state: {
        name: "Run Agent",
      },
    },
  },
  config,
);

assert.equal(withoutUuidPayload?.issueId, "FRD-172");
assert.equal(withoutUuidPayload?.issueUuid, undefined);

// PR 2 (0.6.0) — extractWebhookIssueId + extractHumanReply
{
  // Issue id extraction from a Comment webhook
  const commentWebhook = {
    id: "evt_comment_1",
    type: "Comment",
    action: "create",
    webhookTimestamp: 1_764_307_200_000,
    data: {
      body: "do (A) — IA only",
      user: { name: "shyang" },
      issue: {
        identifier: "FRD-200",
        project: { name: "Autoship" },
      },
    },
  };
  assert.equal(extractWebhookIssueId(commentWebhook), "FRD-200");

  const commentReply = extractHumanReply(commentWebhook, config);
  assert.deepEqual(commentReply, {
    source: "linear-comment",
    commentBody: "do (A) — IA only",
    commentAuthor: "shyang",
  });

  // Issue id extraction from an Issue state-change webhook
  const stateWebhook = {
    id: "evt_state_1",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_000,
    data: {
      identifier: "FRD-201",
      project: { name: "Autoship" },
      state: { name: "Run Agent" },
    },
    updatedFrom: { stateId: "old-state" },
  };
  assert.equal(extractWebhookIssueId(stateWebhook), "FRD-201");
  const stateReply = extractHumanReply(stateWebhook, config);
  assert.deepEqual(stateReply, {
    source: "linear-state-change",
    newState: "Run Agent",
  });

  // Comment with empty body returns null reply
  const emptyComment = {
    id: "evt_comment_2",
    type: "Comment",
    action: "create",
    data: {
      body: "",
      issue: { identifier: "FRD-202", project: { name: "Autoship" } },
    },
  };
  assert.equal(extractHumanReply(emptyComment, config), null);

  // Issue update without state change returns null reply
  const issueNonStateUpdate = {
    id: "evt_issue_1",
    type: "Issue",
    action: "update",
    data: {
      identifier: "FRD-203",
      project: { name: "Autoship" },
    },
  };
  assert.equal(extractHumanReply(issueNonStateUpdate, config), null);

  // Unrelated webhook type returns null
  assert.equal(extractWebhookIssueId({ type: "Project", action: "create" }), null);
  assert.equal(extractHumanReply({ type: "Project", action: "create" }, config), null);

  // Bug B filter: state change to a non-trigger state (e.g. controller
  // halting to "Needs Attention") must NOT be treated as a human reply.
  // Without this filter the runner self-resumes its own parking and loops.
  const botStateChange = {
    id: "evt_state_bot",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_000,
    data: {
      identifier: "FRD-204",
      project: { name: "Autoship" },
      state: { name: "Needs Attention" },
    },
    updatedFrom: { stateId: "old-state" },
  };
  assert.equal(extractHumanReply(botStateChange, config), null);

  // Bug B filter: state changes to other trigger states still pass through.
  const breakdownStateChange = {
    id: "evt_state_breakdown",
    type: "Issue",
    action: "update",
    webhookTimestamp: 1_764_307_200_000,
    data: {
      identifier: "FRD-205",
      project: { name: "Autoship" },
      state: { name: "Breakdown Approved" },
    },
    updatedFrom: { stateId: "old-state" },
  };
  assert.deepEqual(extractHumanReply(breakdownStateChange, config), {
    source: "linear-state-change",
    newState: "Breakdown Approved",
  });

  // Bug B filter: comments the runner posts itself (🤖 Autoship prefix)
  // share the bot's Linear identity with humans, so prefix-match to skip.
  const botDispatchComment = {
    id: "evt_comment_bot",
    type: "Comment",
    action: "create",
    data: {
      body: "🤖 Autoship dispatched FRD-206 — phase: automatic groom/build\nRun: `run_abc`",
      user: { name: "shyang" },
      issue: { identifier: "FRD-206", project: { name: "Autoship" } },
    },
  };
  assert.equal(extractHumanReply(botDispatchComment, config), null);

  // Bug B filter: bot-prefix filter also applies to comment updates
  // (formatFinishedBody is mirrored via updateComment, not createComment).
  const botFinishedComment = {
    id: "evt_comment_bot_update",
    type: "Comment",
    action: "update",
    data: {
      body: "🤖 Autoship dispatched FRD-207 — phase: grooming\nRun: `run_xyz`\n\n✅ Finished in 5m 32s",
      user: { name: "shyang" },
      issue: { identifier: "FRD-207", project: { name: "Autoship" } },
    },
  };
  assert.equal(extractHumanReply(botFinishedComment, config), null);

  // Sanity: a genuine human comment that happens to mention 🤖 in the body
  // (but doesn't start with the prefix) still counts as a reply.
  const humanCommentMentioningBot = {
    id: "evt_comment_human",
    type: "Comment",
    action: "create",
    data: {
      body: "ok 🤖 do option (A)",
      user: { name: "shyang" },
      issue: { identifier: "FRD-208", project: { name: "Autoship" } },
    },
  };
  assert.deepEqual(extractHumanReply(humanCommentMentioningBot, config), {
    source: "linear-comment",
    commentBody: "ok 🤖 do option (A)",
    commentAuthor: "shyang",
  });
}

// parseLinearCommentResume — comment-driven fresh-run dispatch when the
// parked container is gone. The webhook handler calls this only after
// tryCompleteWaitpoint returns false on a non-bot human comment.
{
  const humanReply = {
    source: "linear-comment" as const,
    commentBody: "I have provisioned the runner image",
    commentAuthor: "shyang",
  };

  const commentWebhook = {
    id: "evt_comment_resume",
    type: "Comment",
    action: "create",
    webhookTimestamp: Date.now(),
    data: {
      body: "I have provisioned the runner image",
      user: { name: "shyang" },
      issue: {
        id: "issue-uuid-1",
        identifier: "KOO-66",
        url: "https://linear.app/calibrax/issue/KOO-66/...",
        project: { name: "Autoship" },
        state: { name: "Needs Attention" },
      },
    },
  };
  const payload = await parseLinearCommentResume(commentWebhook, config, humanReply, undefined);
  assert.ok(payload, "expected payload for human comment on configured project");
  assert.equal(payload?.trigger, "linear-comment");
  assert.equal(payload?.triggerReason, "linear-comment-resume");
  assert.equal(payload?.issueId, "KOO-66");
  assert.equal(payload?.issueUuid, "issue-uuid-1");
  assert.equal(payload?.repo.fullName, "Calibrax-ai/autoship");
  assert.equal(payload?.targetState, "Needs Attention");
  assert.match(payload?.promptContext ?? "", /\[Linear comment from shyang\]/);
  assert.match(payload?.promptContext ?? "", /provisioned the runner image/);

  // Wrong humanReply source — defensive guard for state-change replies that
  // landed here by mistake.
  assert.equal(
    await parseLinearCommentResume(
      commentWebhook,
      config,
      { source: "linear-state-change", newState: "Run Agent" },
      undefined,
    ),
    null,
    "state-change humanReply must not dispatch comment-resume",
  );

  // Wrong webhook type
  assert.equal(
    await parseLinearCommentResume(
      { ...commentWebhook, type: "Issue" },
      config,
      humanReply,
      undefined,
    ),
    null,
    "Issue webhook must not dispatch via comment-resume path",
  );

  // Wrong action (e.g. comment delete)
  assert.equal(
    await parseLinearCommentResume(
      { ...commentWebhook, action: "remove" },
      config,
      humanReply,
      undefined,
    ),
    null,
    "non-create/update comment action must not dispatch",
  );

  // Unmatched project — project filter must hold; we don't want comments on
  // arbitrary Linear projects spawning runs against the wrong repo.
  // Without an API key, the lookup fallback is skipped, so this stays null.
  const wrongProjectWebhook = {
    ...commentWebhook,
    data: {
      ...commentWebhook.data,
      issue: { ...commentWebhook.data.issue, project: { name: "NotConfigured" } },
    },
  };
  assert.equal(
    await parseLinearCommentResume(wrongProjectWebhook, config, humanReply, undefined),
    null,
    "unmatched project must not dispatch",
  );
}
