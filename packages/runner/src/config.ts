import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  LINEAR_WEBHOOK_SECRET: z.string().min(1),
  LINEAR_API_KEY: z.string().optional(),
  // Per-project repo + Linear project mapping moved to src/projects.config.ts.
  // Add/remove entries there instead of setting AUTOSHIP_DEFAULT_REPO_* /
  // AUTOSHIP_LINEAR_PROJECT_NAME env vars.
  AUTOSHIP_LINEAR_AUTO_STATE_ID: z.string().min(1).optional(),
  AUTOSHIP_LINEAR_AUTO_STATE: z.string().min(1).default("Run Agent"),
  AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID: z.string().min(1).optional(),
  AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE: z.string().min(1).default("Breakdown Approved"),
  AUTOSHIP_LINEAR_BUILD_STATE_ID: z.string().min(1).optional(),
  AUTOSHIP_LINEAR_BUILD_STATE: z.string().min(1).optional(),
  AUTOSHIP_REPOS_ROOT: z.string().min(1).default("./runs/repos"),
  AUTOSHIP_PACKAGE: z.string().min(1).default("@cs-calibrax/autoship@latest"),
  AUTOSHIP_GIT_AUTHOR_NAME: z.string().min(1).optional(),
  AUTOSHIP_GIT_AUTHOR_EMAIL: z.string().email().optional(),
  AUTOSHIP_CLAUDE_OUTPUT_FORMAT: z.enum(["text", "json", "stream-json"]).default("stream-json"),
  AUTOSHIP_CLAUDE_VERBOSE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // Claude Code permission mode for headless runs. bypassPermissions is the
  // right call inside an isolated trigger.dev microVM with a repo-scoped
  // GH_TOKEN — there's no host state to corrupt and no persistence between
  // runs. Tighten to acceptEdits or default for higher-trust scenarios.
  AUTOSHIP_CLAUDE_PERMISSION_MODE: z
    .enum(["default", "acceptEdits", "bypassPermissions", "plan"])
    .default("bypassPermissions"),
  // Hard ceiling on agent turns (think → tool calls → think loops) to bound
  // runaway sessions. Hit-and-stop instead of churning until maxDuration
  // (2h) elapses. 200 covers complex multi-file refactors and feature
  // builds; bug fixes and audits typically use a fraction of this.
  AUTOSHIP_CLAUDE_MAX_TURNS: z.coerce.number().int().positive().default(200),
  AUTOSHIP_LINEAR_MCP_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  AUTOSHIP_POST_TO_LINEAR: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  AUTOSHIP_LINEAR_POST_METADATA: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  // Session resume + waitpoint (PR 2 / 0.6.0)
  AUTOSHIP_WAITPOINT_TIMEOUT_DAYS: z.coerce.number().int().positive().default(2),

  // Optional: Supabase Storage (S3-compatible) for mirroring claude session
  // JSONL transcripts across container teardowns. If unset, the runner skips
  // mirroring and resume gracefully degrades to cold-start on long parks.
  AUTOSHIP_SESSION_STORE_BUCKET: z.string().min(1).optional(),
  AUTOSHIP_SESSION_STORE_PREFIX: z.string().min(1).default("claude-sessions/"),
  AUTOSHIP_SESSION_STORE_ENDPOINT: z.string().url().optional(),
  AUTOSHIP_SESSION_STORE_REGION: z.string().min(1).default("us-east-1"),
  AUTOSHIP_SESSION_STORE_ACCESS_KEY_ID: z.string().min(1).optional(),
  AUTOSHIP_SESSION_STORE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function readConfig(): AppConfig {
  return envSchema.parse(process.env);
}
