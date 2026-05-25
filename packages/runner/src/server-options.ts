import type { TriggerOptions } from "@trigger.dev/sdk";
import type { AutoshipRunPayload } from "./types.js";

export function buildRunIdempotencyKey(payload: AutoshipRunPayload): string {
  const eventId = payload.eventId ?? payload.linear?.eventId;
  const timestamp = payload.linear?.webhookTimestamp ?? "no-timestamp";
  const targetState = payload.targetState ?? "no-state";
  const eventPart = eventId ?? "no-event";

  return `linear:${payload.repo.fullName}:${payload.issueId}:${payload.phase}:${targetState}:${eventPart}:${timestamp}`;
}

export function buildRunConcurrencyKey(payload: AutoshipRunPayload): string {
  return `${payload.repo.fullName}:${payload.issueId}`;
}

export function buildRunTags(payload: AutoshipRunPayload): string[] {
  return [`issue:${payload.issueId}`, `repo:${payload.repo.fullName}`, `phase:${payload.phase}`];
}

export function buildTriggerOptions(payload: AutoshipRunPayload): TriggerOptions {
  return {
    idempotencyKey: buildRunIdempotencyKey(payload),
    idempotencyKeyTTL: "1h",
    concurrencyKey: buildRunConcurrencyKey(payload),
    tags: buildRunTags(payload),
  };
}
