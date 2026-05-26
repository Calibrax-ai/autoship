---
title: "runner_handoff contract drift check"
---

**Status:** Decided against (audit archive) · **Date:** 2026-05-26 · **Outcome:** No implementation

> **Decision.** A CI drift check for the `runner_handoff` envelope was proposed, designed, and dropped after audit. The mechanical check (regex match between zod field names in runner TS and backtick-fielded mentions in the controller markdown) doesn't match the actual risk pattern on this surface. Documenting the audit so the next person doesn't redo it.

## Original framing

Surface 3 in `autoship-project/CONTRACTS.md` documents the `runner_handoff` JSON envelope as the contract between `autoship-runner` (emitter, TypeScript) and the `autoship-controller` agent prompt (consumer, markdown read by Claude). The hazard: schema drift on one side leaves the other side out of sync, controller behavior breaks silently.

Original proposal: CI script that asserts every zod field name in `packages/runner/src/types.ts` appears in `packages/core/.claude/agents/autoship-controller.md` (in backticks). ~50 lines, half-day effort, was framed as "lightweight protection."

## Why the mechanical check is wrong for this surface

Three findings during audit:

### 1. The zod schema is not the handoff

`packages/runner/src/types.ts` defines `autoshipRunPayloadSchema` — this is the **webhook-to-Trigger.dev** transport envelope, not what the controller actually sees. The handoff the controller receives is a **transformed projection** built in `buildControllerPrompt` (in `packages/runner/src/runner/autoship.ts`):

```js
const handoff = {
  source: "autoship-runner",
  intent: command,
  issueId, issueUrl, phase, trigger,
  triggerReason, targetState, eventId,
  agentSessionId, sessionId,
  repo: { fullName, defaultBranch },
  linear: { project, autoState, breakdownApprovedState, buildState, action, webhookType, webhookTimestamp },
  allowedOutcomes,
};
```

Some fields renamed; some restructured; some dropped (`issueUuid`, `promptContext` from the zod schema aren't in the handoff); some added (`source`, `intent`, `allowedOutcomes`, config-derived `linear.autoState` etc.). The original drift-check design would have checked the wrong field set.

### 2. The markdown describes the contract conceptually, not by literal field name

The controller markdown's "How I Receive Work" section says:

> "A trusted remote runner prompt includes an `Autoship Runner Handoff` JSON block with `source: \"autoship-runner\"`, one explicit `issueId`, repo identity, trigger reason/state, and allowed outcomes."

That single sentence describes the contract correctly using **concepts** (`repo identity`, `trigger reason/state`, `allowed outcomes`) rather than **literal field names** (`\`repo.fullName\``, `\`triggerReason\``, `\`allowedOutcomes\``). A regex match on literal field names would:

- **False-positive**: flag `repo` and `allowedOutcomes` as missing despite being conceptually documented.
- **Miss real risk**: a new field with new semantics could be added and pass the check if the field name happens to appear anywhere in the markdown.

### 3. Zero documented drift incidents

`autoship-project/CONTRACTS.md` documents the hazard as a *coordination risk*, not an observed bug. Git history on `packages/runner/src/types.ts` and `packages/core/.claude/agents/autoship-controller.md` shows updates have been coordinated correctly across both surfaces by the humans editing them. The mechanical check would be defending against a failure mode that hasn't happened.

## What the actual risk pattern is

The real drift hazard isn't "field name not in markdown" — it's **"field with new semantics added without prompt instructions on how to handle it"**. That's a PR-review concern, not a regex-able invariant. A reviewer reading a diff that adds a field to `buildControllerPrompt` should ask: "does the controller agent need new prose to handle this?" That judgment isn't automatable.

## Replacement criteria (when to revisit)

Reopen this if any of these occur:

1. **Observed drift incident** — a production run fails because the controller couldn't extract a field the runner emitted (or vice versa).
2. **Grid-crew kickoff** — a third consumer of the handoff contract. At that point, picking a real shared-format approach (JSON Schema, generated prose-from-zod) becomes worth the cost. See `docs/plans/2026-05-25-monorepo-consolidation.md` follow-up #1 for the original framing.
3. **Schema growth** — if the handoff doubles in field count, the cognitive load of keeping markdown in sync grows past PR-review viability.

Until then: the handoff prose in `autoship-controller.md` is the contract. Update it when you change `buildControllerPrompt`. PR review catches the rest.

## Process learning

Brainstorming proposed a half-day script. Audit revealed the script targets the wrong axis. Cost so far: ~30 min of audit. Saved cost: ~half day of building, ~ongoing maintenance, ~the false confidence of "drift is automated away."

The brainstorming skill's instruction to "explore project context first" is what surfaced this. Skipping that step would have shipped a wrong check.
