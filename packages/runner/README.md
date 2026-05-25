# autoship-runner

Remote runner for Linear-triggered Autoship jobs.

This project is intentionally separate from the `autoship` CLI package. The CLI owns the controller contract; this runner owns webhook intake, durable task execution, repo checkout, and the remote invocation boundary.

## Flow

```text
Linear AgentSessionEvent or issue status webhook
  -> local webhook bridge verifies Linear signature
  -> unrelated events are acknowledged and ignored
  -> Trigger.dev task is enqueued with a strict issue payload
  -> task checks out the configured GitHub repo
  -> task runs autoship for one issue
  -> task reports status back to Linear when credentials are configured
```

## Setup

```bash
npm install
cp .env.example .env
npm run typecheck
```

Then fill in:

- `TRIGGER_PROJECT_REF`
- `TRIGGER_SECRET_KEY`
- `LINEAR_WEBHOOK_SECRET`
- `LINEAR_API_KEY` if you want Linear agent-session progress updates
- `AUTOSHIP_LINEAR_AUTO_STATE`, defaulting to `Run Agent`
- `AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE`, defaulting to `Breakdown Approved`
- `AUTOSHIP_LINEAR_BUILD_STATE`, optional supervised-mode compatibility, disabled by default

Per-project mapping (which Linear project routes to which GitHub repo) lives in [`src/projects.config.ts`](src/projects.config.ts), not env vars. To add a project: append an entry to that array, push, redeploy. The schema mirrors what would later live in each repo's `.autoship/standards.yaml` if/when we move to a green-field design where each repo self-describes — migration would be data move, not a rewrite.

When `LINEAR_API_KEY` is set, the runner resolves each registered project's Linear name → ID at startup and uses IDs for webhook matching. Optional `AUTOSHIP_LINEAR_AUTO_STATE_ID`, `AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID`, and `AUTOSHIP_LINEAR_BUILD_STATE_ID` env vars remain as escape hatches when name resolution is unavailable or ambiguous. Projects with `remoteRunner.enabled: false` are ignored.

Run the webhook bridge locally:

```bash
npm run dev
```

Run Trigger.dev locally in another terminal:

```bash
npm run dev:trigger
```

For the normal local test loop, use the Makefile instead:

```bash
make restart-all
```

That command starts the webhook server, Trigger.dev worker, and Cloudflare proxy, prints the Linear webhook URL to copy, then immediately tails the server/worker/proxy logs. Move one issue to `Run Agent` and watch for `Linear webhook received`, `Trigger.dev run accepted`, and `Autoship picked up <issue>`. For umbrella issues, review the `[Breakdown]` PR and move the parent to `Breakdown Approved` to create child issues. Press Ctrl-C to stop monitoring and kill all three local services.

## Webhook Endpoint

Configure Linear to send Agent Session and issue update events to:

```text
POST /webhooks/linear
```

The route responds quickly and enqueues background work. Linear expects webhook receivers to respond within a few seconds, so do not run Autoship directly inside the HTTP request.

The runner only accepts:

- Agent session creation for an issue, which becomes automatic groom/build.
- Issue status changes into `AUTOSHIP_LINEAR_AUTO_STATE`, which become automatic groom/build.
- Issue status changes into `AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE`, which create child issues from the approved breakdown.
- Issue status changes into `AUTOSHIP_LINEAR_BUILD_STATE`, when configured, which remain optional supervised build-only compatibility.

The issue must belong to one of the Linear projects registered in `src/projects.config.ts`. The runner resolves project names to IDs at startup when `LINEAR_API_KEY` is available, because webhook payloads may carry `projectId`/`stateId` without nested project or state names. This keeps workspace-wide webhook events from triggering Autoship for unrelated projects without making humans manage UUIDs.

All other Linear webhook events return `202 ignored`.

## Current Contract

The first task payload is intentionally small:

```json
{
  "trigger": "linear-agent-session",
  "phase": "auto",
  "eventId": "linear-event-id",
  "targetState": "Run Agent",
  "triggerReason": "agent-session",
  "issueId": "FRD-162",
  "agentSessionId": "session-id",
  "repo": {
    "fullName": "Calibrax-ai/autoship",
    "cloneUrl": "https://github.com/Calibrax-ai/autoship.git",
    "defaultBranch": "main"
  }
}
```

Use `Run Agent` as the explicit remote automation trigger. Keep `Todo` for human/local grooming prompts like "get all Todo issues assigned to me and start grooming"; it should not wake the remote runner. Use `Breakdown Approved` only after the `[Breakdown]` PR looks acceptable.

Autoship command mapping is intentionally strict:

- `phase: "auto"` maps to `autoship deliver <issue-id> --yes --unattended --auto`.
- `phase: "build"` maps to `autoship deliver <issue-id> --yes --unattended`.
- `phase: "groom"` maps to `autoship groom <issue-id> --yes`.
- `phase: "create-issues"` maps to `autoship create-issues <issue-id> --yes --unattended --auto`.

The mapped prompt also includes an `Autoship Runner Handoff` JSON block. The handoff tells the controller that the runner already verified the Linear signature, project/repo/state filters, and one-issue scope. The controller still decides whether to groom, open/update a draft PR, continue to build, create child issues from an approved breakdown, or park the issue in `Needs Attention`.

In `auto` mode, grooming/spec generation may proceed from the runner handoff even when the target repo does not have a full `.autoship/defaults.yaml` Linear block. Code changes require a configured or safely inferred validation command. If validation is missing or ambiguous, Autoship should stop after the spec/review handoff instead of building.

The runner uses `AUTOSHIP_PACKAGE` to bootstrap the Autoship harness when the checkout is missing `.claude/agents/autoship-controller.md`. Runtime execution then invokes Claude directly:

```text
claude --agent autoship-controller -p "<mapped prompt>" --output-format stream-json --verbose
```

When `LINEAR_API_KEY` is set and `AUTOSHIP_LINEAR_MCP_ENABLED=true`, the runner also writes a temporary Claude MCP config for Linear's remote MCP server and passes it with `--mcp-config --strict-mcp-config`. The config file is created with mode `0600` and contains the bearer token directly, so Claude does not depend on environment expansion inside MCP config. The rendered Claude command still does not include the secret. Because the controller agent has a tool allowlist, the runner temporarily adds `mcp__linear-server__*` while the spawned Claude process runs, then restores the agent file.

`--post` is appended to the mapped prompt only when `AUTOSHIP_POST_TO_LINEAR=true`. `AUTOSHIP_CLAUDE_OUTPUT_FORMAT` defaults to `stream-json`; the runner parses that stream and emits structured Trigger.dev logs for assistant messages, tool calls, tool results, and the final controller result. The task also creates custom Trigger.dev spans for Linear notifications, repository checkout, harness bootstrap, and controller execution, and updates run metadata with the current status.

Remote runs are keyed by repo, issue, phase, target state, webhook event marker, and webhook timestamp. Trigger.dev also receives a concurrency key of `<repo>:<issue-id>` and the task queue concurrency limit is `1`, so one issue cannot run two Autoship jobs at the same time.

## Important Caveat

This is a scaffold. It proves the remote shape, but it is not production-hardened yet. Before using it on real repositories, add GitHub App installation tokens, per-repo authorization, persistent run records, and stronger Linear Agent Session updates.
