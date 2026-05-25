import assert from "node:assert/strict";
import {
  addLinearMcpToolToAgentMarkdown,
  buildAutoshipArgs,
  buildClaudeArgs,
  buildControllerPrompt,
  buildLinearMcpConfig,
  selectBootstrapMode,
  createClaudeLogForwarder,
  runClaudeWithResumeFallback,
} from "./autoship.js";
import type { CommandResult } from "./process.js";
import { makeRunPayload, makeTestConfig } from "../test-helpers.js";

const config = makeTestConfig({ AUTOSHIP_POST_TO_LINEAR: true });

assert.deepEqual(buildAutoshipArgs(makeRunPayload({ phase: "auto" }), config), [
  "deliver",
  "FRD-162",
  "--yes",
  "--unattended",
  "--auto",
  "--post",
]);

assert.deepEqual(buildAutoshipArgs(makeRunPayload({ phase: "build" }), config), [
  "deliver",
  "FRD-162",
  "--yes",
  "--unattended",
  "--post",
]);

assert.deepEqual(buildAutoshipArgs(makeRunPayload({ phase: "groom" }), config), [
  "groom",
  "FRD-162",
  "--yes",
  "--post",
]);

assert.deepEqual(buildAutoshipArgs(makeRunPayload({ phase: "create-issues" }), config), [
  "create-issues",
  "FRD-162",
  "--yes",
  "--unattended",
  "--auto",
  "--post",
]);

assert.equal(selectBootstrapMode({ controllerExists: true, autoshipConfigExists: true }), "upgrade_framework");
assert.equal(selectBootstrapMode({ controllerExists: true, autoshipConfigExists: false }), "upgrade_framework");
assert.equal(selectBootstrapMode({ controllerExists: false, autoshipConfigExists: true }), "upgrade_framework");
assert.equal(selectBootstrapMode({ controllerExists: false, autoshipConfigExists: false }), "first_install");

assert.deepEqual(
  buildClaudeArgs({
    prompt: "deliver FRD-162 --yes",
    outputFormat: "stream-json",
    verbose: true,
    permissionMode: "bypassPermissions",
    maxTurns: 200,
    sessionId: "11111111-2222-3333-4444-555555555555",
    isResume: false,
    mcpConfigPath: "/tmp/autoship-runner-mcp/session.linear.mcp.json",
    allowedTools: ["mcp__linear-server__*"],
  }),
  [
    "--agent",
    "autoship-controller",
    "-p",
    "deliver FRD-162 --yes",
    "--output-format",
    "stream-json",
    "--permission-mode",
    "bypassPermissions",
    "--max-turns",
    "200",
    "--mcp-config",
    "/tmp/autoship-runner-mcp/session.linear.mcp.json",
    "--strict-mcp-config",
    "--allowedTools",
    "mcp__linear-server__*",
    "--session-id",
    "11111111-2222-3333-4444-555555555555",
    "--verbose",
    "--include-partial-messages",
  ],
);

assert.deepEqual(buildLinearMcpConfig("linear-key"), {
  mcpServers: {
    "linear-server": {
      type: "http",
      url: "https://mcp.linear.app/mcp",
      headers: {
        Authorization: "Bearer linear-key",
      },
    },
  },
});

assert.equal(
  addLinearMcpToolToAgentMarkdown(`---
name: autoship-controller
tools: Read, Glob, Grep, Bash, Write
---

Body
`),
  `---
name: autoship-controller
tools: Read, Glob, Grep, Bash, Write, mcp__linear-server__*
---

Body
`,
);

assert.equal(
  addLinearMcpToolToAgentMarkdown(`---
name: autoship-controller
tools: Read, mcp__linear-server__*
---

Body
`),
  `---
name: autoship-controller
tools: Read, mcp__linear-server__*
---

Body
`,
);

assert.deepEqual(
  buildAutoshipArgs(makeRunPayload({ phase: "auto" }), makeTestConfig({ AUTOSHIP_POST_TO_LINEAR: false })),
  ["deliver", "FRD-162", "--yes", "--unattended", "--auto"],
);

assert.deepEqual(
  buildAutoshipArgs(makeRunPayload({ phase: "create-issues" }), makeTestConfig({ AUTOSHIP_POST_TO_LINEAR: false })),
  ["create-issues", "FRD-162", "--yes", "--unattended", "--auto"],
);

const autoPrompt = buildControllerPrompt(makeRunPayload({ phase: "auto" }), config);

assert.match(autoPrompt, /^deliver FRD-162 --yes --unattended --auto --post/);
assert.match(autoPrompt, /Autoship Runner Handoff:/);
assert.match(autoPrompt, /"source": "autoship-runner"/);
assert.match(autoPrompt, /"targetState": "Run Agent"/);
assert.match(autoPrompt, /"selectionAuthority": "runner verified Linear signature, project\/repo\/state filters, and one issue payload"/);
assert.match(autoPrompt, /"codeChangesRequireValidation": true/);

const groomPrompt = buildControllerPrompt(makeRunPayload({ phase: "groom" }), config);

assert.match(groomPrompt, /^groom FRD-162 --yes --post/);
assert.match(groomPrompt, /"allowedOutcomes": \[\n    "spec",\n    "needs_attention"\n  \]/);

const createIssuesPrompt = buildControllerPrompt(
  makeRunPayload({ phase: "create-issues", targetState: "Breakdown Approved", triggerReason: "breakdown-approved-state" }),
  config,
);

assert.match(createIssuesPrompt, /^create-issues FRD-162 --yes --unattended --auto --post/);
assert.match(createIssuesPrompt, /"phase": "create-issues"/);
assert.match(createIssuesPrompt, /"breakdownApprovedState": "Breakdown Approved"/);
assert.match(createIssuesPrompt, /"allowedOutcomes": \[\n    "child_issues",\n    "needs_attention"\n  \]/);

assert.deepEqual(buildAutoshipArgs(makeRunPayload({ phase: "materialize" }), config), [
  "create-issues",
  "FRD-162",
  "--yes",
  "--unattended",
  "--auto",
  "--post",
]);

const legacyMaterializePrompt = buildControllerPrompt(
  makeRunPayload({ phase: "materialize", targetState: "Breakdown Approved", triggerReason: "breakdown-approved-state" }),
  config,
);

assert.match(legacyMaterializePrompt, /^create-issues FRD-162 --yes --unattended --auto --post/);
assert.match(legacyMaterializePrompt, /"phase": "create-issues"/);
assert.doesNotMatch(legacyMaterializePrompt, /"phase": "materialize"/);

// Stream-json metric extraction
const forwarder = createClaudeLogForwarder();
const initEvent = JSON.stringify({
  type: "system",
  subtype: "init",
  model: "claude-opus-4-7[1m]",
  session_id: "11111111-2222-3333-4444-555555555555",
  claude_code_version: "2.1.122",
});
const resultEvent = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  total_cost_usd: 0.249,
  num_turns: 12,
  duration_ms: 510_000,
  duration_api_ms: 320_000,
  usage: {
    input_tokens: 6,
    output_tokens: 1234,
    cache_read_input_tokens: 50_000,
    cache_creation_input_tokens: 10_000,
  },
});
forwarder.stdout(`${initEvent}\n${resultEvent}\n`);
forwarder.flush();
const metrics = forwarder.metrics();
assert.equal(metrics.model, "claude-opus-4-7[1m]");
assert.equal(metrics.sessionId, "11111111-2222-3333-4444-555555555555");
assert.equal(metrics.claudeCodeVersion, "2.1.122");
assert.equal(metrics.costUsd, 0.249);
assert.equal(metrics.turns, 12);
assert.equal(metrics.durationMs, 510_000);
assert.equal(metrics.durationApiMs, 320_000);
assert.equal(metrics.inputTokens, 6);
assert.equal(metrics.outputTokens, 1234);
assert.equal(metrics.cacheReadTokens, 50_000);
assert.equal(metrics.cacheCreationTokens, 10_000);
assert.equal(metrics.subtype, "success");
assert.equal(metrics.isError, false);

// Missing usage block / partial result event still works without crash
const partialForwarder = createClaudeLogForwarder();
partialForwarder.stdout(`${JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true })}\n`);
partialForwarder.flush();
const partial = partialForwarder.metrics();
assert.equal(partial.subtype, "error_max_turns");
assert.equal(partial.isError, true);
assert.equal(partial.costUsd, undefined);
assert.equal(partial.turns, undefined);
assert.equal(partial.inputTokens, undefined);

// PR 2 (0.6.0) — session resume + waitpoint integration
{
  // sessionId threads into the Runner Handoff JSON as an optional resume accelerator.
  const promptWithSession = buildControllerPrompt(
    makeRunPayload({ phase: "auto" }),
    config,
    { sessionId: "abc-123-def" },
  );
  assert.match(promptWithSession, /"sessionId": "abc-123-def"/);
  assert.match(promptWithSession, /Copy `sessionId` from the handoff verbatim into manifest\.json/);
  assert.match(promptWithSession, /correctness must come from the issue branch, manifest, committed artifacts/);
  assert.match(promptWithSession, /Commit and push manifest checkpoints before and after worker dispatches/);

  // humanReply block appears only when provided
  const promptWithoutReply = buildControllerPrompt(
    makeRunPayload({ phase: "auto" }),
    config,
    { sessionId: "uuid" },
  );
  assert.doesNotMatch(promptWithoutReply, /Human reply \(resumed from waitpoint\)/);
  assert.doesNotMatch(promptWithoutReply, /Cold start/);

  // Warm-resume reply (isResume=true): keep the original "resumed from waitpoint"
  // framing — Claude is being invoked with --resume <sessionId> and already
  // remembers asking the prior question.
  const warmResumePrompt = buildControllerPrompt(
    makeRunPayload({ phase: "auto" }),
    config,
    {
      sessionId: "uuid",
      isResume: true,
      humanReply: {
        source: "linear-comment",
        commentBody: "do (A)",
        commentAuthor: "shyang",
      },
    },
  );
  assert.match(warmResumePrompt, /Human reply \(resumed from waitpoint\)/);
  assert.match(warmResumePrompt, /"commentBody": "do \(A\)"/);
  assert.match(warmResumePrompt, /"commentAuthor": "shyang"/);
  assert.doesNotMatch(warmResumePrompt, /Cold start/);
}

// 0.6.1 — cold-start prompt reframing for resume-fallback
//
// When --resume fails (the steady state on Trigger.dev's ephemeral workers)
// the runner spawns again with a fresh --session-id and the cold-start
// framing. The cold-start prompt re-injects the prior question from
// `manifest.parked_question` so the resumed turn doesn't depend on Claude's
// (now absent) conversational memory.
{
  const coldWithQuestion = buildControllerPrompt(
    makeRunPayload({ phase: "auto" }),
    config,
    {
      sessionId: "fresh-uuid",
      isResume: false,
      parkedQuestion: "Should we use Postgres or SQLite for the audit log?",
      humanReply: {
        source: "linear-comment",
        commentBody: "Postgres, with Neon",
        commentAuthor: "shyang",
      },
    },
  );
  assert.match(coldWithQuestion, /Cold start — no conversational memory/);
  assert.match(coldWithQuestion, /Prior turn parked with this question/);
  assert.match(coldWithQuestion, /Should we use Postgres or SQLite for the audit log\?/);
  assert.match(coldWithQuestion, /"commentBody": "Postgres, with Neon"/);
  assert.match(coldWithQuestion, /Apply this reply to the question above/);
  // Critical: the prompt must NOT claim conversational continuity that
  // doesn't exist on a fresh worker.
  assert.doesNotMatch(coldWithQuestion, /resumed from waitpoint/);

  // Cold-start with humanReply but no parked_question — degrade gracefully
  // and tell Claude where to look (manifest + branch).
  const coldWithoutQuestion = buildControllerPrompt(
    makeRunPayload({ phase: "auto" }),
    config,
    {
      sessionId: "fresh-uuid",
      isResume: false,
      humanReply: {
        source: "linear-comment",
        commentBody: "yes do that",
        commentAuthor: "shyang",
      },
    },
  );
  assert.match(coldWithoutQuestion, /Cold start — no conversational memory/);
  assert.match(coldWithoutQuestion, /no `parked_question` was recorded/);
  assert.match(coldWithoutQuestion, /Read `\.autoship\/issues\/<id>\/manifest\.json`/);
  assert.match(coldWithoutQuestion, /"commentBody": "yes do that"/);
  assert.doesNotMatch(coldWithoutQuestion, /resumed from waitpoint/);
}

// 0.6.1 — runClaudeWithResumeFallback wrapper
//
// Detects "No conversation found with session ID" specifically and retries
// once with a fresh session id. Other failures pass through unchanged.
{
  const ok = (overrides: Partial<CommandResult> = {}): CommandResult => ({
    command: "claude --resume <id>",
    exitCode: 0,
    stdout: "",
    stderr: "",
    ...overrides,
  });

  const notFoundFailure = (): CommandResult => ({
    command: "claude --resume <id>",
    exitCode: 1,
    stdout: "",
    stderr: "No conversation found with session ID: 8f1b357f-db5a-41ba-8454-5560d1d2e91d\n",
  });

  // Case 1: initialIsResume=true, first attempt succeeds → warm_hit, no retry
  {
    const calls: Array<{ sessionId: string; isResume: boolean }> = [];
    const result = await runClaudeWithResumeFallback({
      initialSessionId: "session-A",
      initialIsResume: true,
      spawn: async (input) => {
        calls.push(input);
        return ok();
      },
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { sessionId: "session-A", isResume: true });
    assert.equal(result.resumeOutcome, "warm_hit");
    assert.equal(result.finalSessionId, "session-A");
    assert.equal(result.finalIsResume, true);
  }

  // Case 2: initialIsResume=true, first fails with "No conversation found" → retry with fresh id, succeeds → cold_fallback
  {
    const calls: Array<{ sessionId: string; isResume: boolean }> = [];
    const result = await runClaudeWithResumeFallback({
      initialSessionId: "session-A",
      initialIsResume: true,
      spawn: async (input) => {
        calls.push(input);
        return calls.length === 1 ? notFoundFailure() : ok();
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.sessionId, "session-A");
    assert.equal(calls[0]?.isResume, true);
    // Second call: brand new session id, isResume forced to false.
    assert.notEqual(calls[1]?.sessionId, "session-A");
    assert.equal(calls[1]?.isResume, false);
    assert.equal(result.resumeOutcome, "cold_fallback");
    assert.equal(result.finalSessionId, calls[1]?.sessionId);
    assert.equal(result.finalIsResume, false);
    assert.equal(result.result.exitCode, 0);
  }

  // Case 3: initialIsResume=true, first fails with non-resume error → no retry, propagate
  {
    const calls: Array<{ sessionId: string; isResume: boolean }> = [];
    const result = await runClaudeWithResumeFallback({
      initialSessionId: "session-A",
      initialIsResume: true,
      spawn: async (input) => {
        calls.push(input);
        return {
          command: "claude --resume <id>",
          exitCode: 1,
          stdout: "",
          stderr: "Error: max turns exceeded\n",
        };
      },
    });
    assert.equal(calls.length, 1, "non-resume failures must not trigger retry");
    assert.equal(result.resumeOutcome, "warm_hit");
    assert.equal(result.finalSessionId, "session-A");
    assert.equal(result.finalIsResume, true);
    assert.equal(result.result.exitCode, 1);
  }

  // Case 4: initialIsResume=false (first run on a fresh issue) → fresh_start, no retry semantics
  {
    const calls: Array<{ sessionId: string; isResume: boolean }> = [];
    const result = await runClaudeWithResumeFallback({
      initialSessionId: "fresh-uuid",
      initialIsResume: false,
      spawn: async (input) => {
        calls.push(input);
        return ok();
      },
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { sessionId: "fresh-uuid", isResume: false });
    assert.equal(result.resumeOutcome, "fresh_start");
    assert.equal(result.finalSessionId, "fresh-uuid");
    assert.equal(result.finalIsResume, false);
  }
}
