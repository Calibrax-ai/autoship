import assert from "node:assert/strict";
import {
  buildRunConcurrencyKey,
  buildRunIdempotencyKey,
  buildRunTags,
  buildTriggerOptions,
} from "./server-options.js";
import { makeRunPayload } from "./test-helpers.js";

const payload = makeRunPayload({
  eventId: "evt_linear",
  phase: "auto",
  issueId: "FRD-162",
  targetState: "Run Agent",
});

assert.equal(
  buildRunIdempotencyKey(payload),
  "linear:Calibrax-ai/autoship:FRD-162:auto:Run Agent:evt_linear:1764307200000",
);
assert.equal(buildRunConcurrencyKey(payload), "Calibrax-ai/autoship:FRD-162");
assert.deepEqual(buildRunTags(payload), [
  "issue:FRD-162",
  "repo:Calibrax-ai/autoship",
  "phase:auto",
]);

assert.deepEqual(buildTriggerOptions(payload), {
  idempotencyKey: "linear:Calibrax-ai/autoship:FRD-162:auto:Run Agent:evt_linear:1764307200000",
  idempotencyKeyTTL: "1h",
  concurrencyKey: "Calibrax-ai/autoship:FRD-162",
  tags: ["issue:FRD-162", "repo:Calibrax-ai/autoship", "phase:auto"],
});

assert.equal(
  buildRunIdempotencyKey(
    makeRunPayload({
      eventId: undefined,
      linear: {
        action: "update",
        webhookType: "Issue",
        webhookTimestamp: 1_764_307_200_004,
      },
    }),
  ),
  "linear:Calibrax-ai/autoship:FRD-162:auto:Run Agent:no-event:1764307200004",
);

const createIssuesPayload = makeRunPayload({
  eventId: "evt_breakdown",
  phase: "create-issues",
  targetState: "Breakdown Approved",
  triggerReason: "breakdown-approved-state",
});

assert.equal(
  buildRunIdempotencyKey(createIssuesPayload),
  "linear:Calibrax-ai/autoship:FRD-162:create-issues:Breakdown Approved:evt_breakdown:1764307200000",
);
assert.deepEqual(buildRunTags(createIssuesPayload), [
  "issue:FRD-162",
  "repo:Calibrax-ai/autoship",
  "phase:create-issues",
]);
