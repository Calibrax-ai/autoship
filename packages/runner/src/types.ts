import { z } from "zod";

export const autoshipPhaseSchema = z.enum(["auto", "groom", "build", "create-issues", "materialize"]);
export const autoshipTriggerReasonSchema = z.enum([
  "agent-session",
  "auto-state",
  "breakdown-approved-state",
  "build-state",
  "linear-comment-resume",
  "manual",
]);

export const autoshipRunPayloadSchema = z.object({
  trigger: z.enum(["linear-agent-session", "linear-state-change", "manual", "linear-comment"]),
  phase: autoshipPhaseSchema.default("auto"),
  eventId: z.string().min(1).optional(),
  targetState: z.string().min(1).optional(),
  triggerReason: autoshipTriggerReasonSchema.default("manual"),
  issueId: z.string().min(1),
  issueUuid: z.string().min(1).optional(),
  issueUrl: z.string().url().optional(),
  agentSessionId: z.string().min(1).optional(),
  promptContext: z.string().optional(),
  repo: z.object({
    fullName: z.string().min(1),
    cloneUrl: z.string().url(),
    defaultBranch: z.string().min(1).default("main"),
  }),
  linear: z
    .object({
      eventId: z.string().optional(),
      action: z.string().optional(),
      webhookType: z.string().optional(),
      webhookTimestamp: z.number().optional(),
      /** Linear project name (matched at parse time from projects.config). */
      project: z.string().optional(),
    })
    .optional(),
});

export type AutoshipRunPayload = z.infer<typeof autoshipRunPayloadSchema>;

// Payload passed through wait.completeToken from the webhook handler back
// into the parked task body. The parked task receives this from
// wait.forToken().unwrap() and uses it to synthesize the next claude prompt
// that includes the human reply.
export const humanReplyPayloadSchema = z.object({
  source: z.enum(["linear-comment", "linear-state-change", "manual"]),
  commentBody: z.string().optional(),
  commentAuthor: z.string().optional(),
  newState: z.string().optional(),
  // PR 3 will populate parsedOptions for checkbox-formatted answers.
  parsedOptions: z.record(z.string(), z.string()).optional(),
});

export type HumanReplyPayload = z.infer<typeof humanReplyPayloadSchema>;

export type ClaudeRunMetrics = {
  model?: string;
  sessionId?: string;
  claudeCodeVersion?: string;
  costUsd?: number;
  turns?: number;
  durationMs?: number;
  durationApiMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  isError?: boolean;
  subtype?: string;
};

export type AutoshipRunResult = {
  issueId: string;
  command: string;
  repoPath: string;
  exitCode: number;
  stdoutTail: string;
  stderrTail: string;
  status: "completed" | "failed";
  metrics?: ClaudeRunMetrics;
  /** Session id used for this run (either resumed or newly minted). */
  sessionId?: string;
  /**
   * Manifest.phase as observed in the cloned repo after the controller exited.
   * Used by the trigger task to decide whether to park (`needs_attention`) or
   * exit. Undefined if no manifest could be read post-run.
   */
  postRunPhase?: string;
  /** Original Manifest.phase before runner compatibility normalization. */
  postRunRawPhase?: string;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  outcome?: string;
  buildDeferredReason?: string;
  linearSkippedReason?: string;
  githubSkippedReason?: string;
  /**
   * Calibration outcome from a decomposition manifest. `pending` at first
   * write, filled retroactively (`clean | amended | rejected`) when slice
   * runs complete. Telemetry-only; does not drive routing.
   */
  calibrationOutcome?: string;
};
