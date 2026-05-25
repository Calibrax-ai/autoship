import type { AppConfig } from "./config.js";
import type { LinearWebhookConfig } from "./linear/resolve-filters.js";
import type { ProjectConfig } from "./projects.config.js";
import type { AutoshipRunPayload } from "./types.js";

export function makeTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    PORT: 8787,
    LINEAR_WEBHOOK_SECRET: "secret",
    LINEAR_API_KEY: "linear-key",
    AUTOSHIP_LINEAR_AUTO_STATE_ID: undefined,
    AUTOSHIP_LINEAR_AUTO_STATE: "Run Agent",
    AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID: undefined,
    AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE: "Breakdown Approved",
    AUTOSHIP_LINEAR_BUILD_STATE_ID: undefined,
    AUTOSHIP_LINEAR_BUILD_STATE: undefined,
    AUTOSHIP_REPOS_ROOT: "./runs/repos",
    AUTOSHIP_PACKAGE: "@cs-calibrax/autoship@latest",
    AUTOSHIP_GIT_AUTHOR_NAME: undefined,
    AUTOSHIP_GIT_AUTHOR_EMAIL: undefined,
    AUTOSHIP_CLAUDE_OUTPUT_FORMAT: "stream-json",
    AUTOSHIP_CLAUDE_VERBOSE: true,
    AUTOSHIP_CLAUDE_PERMISSION_MODE: "bypassPermissions",
    AUTOSHIP_CLAUDE_MAX_TURNS: 200,
    AUTOSHIP_LINEAR_MCP_ENABLED: true,
    AUTOSHIP_POST_TO_LINEAR: true,
    AUTOSHIP_LINEAR_POST_METADATA: true,
    AUTOSHIP_WAITPOINT_TIMEOUT_DAYS: 2,
    AUTOSHIP_SESSION_STORE_BUCKET: undefined,
    AUTOSHIP_SESSION_STORE_PREFIX: "claude-sessions/",
    AUTOSHIP_SESSION_STORE_ENDPOINT: undefined,
    AUTOSHIP_SESSION_STORE_REGION: "us-east-1",
    AUTOSHIP_SESSION_STORE_ACCESS_KEY_ID: undefined,
    AUTOSHIP_SESSION_STORE_SECRET_ACCESS_KEY: undefined,
    ...overrides,
  };
}

export function makeTestProject(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    linear: { project: "Autoship", projectId: undefined },
    repo: {
      fullName: "Calibrax-ai/autoship",
      cloneUrl: "https://github.com/Calibrax-ai/autoship.git",
      branch: "main",
    },
    remoteRunner: { enabled: true },
    ...overrides,
  };
}

export function makeWebhookConfig(
  overrides: Partial<LinearWebhookConfig> = {},
  projectOverrides: ProjectConfig[] = [makeTestProject()],
): LinearWebhookConfig {
  const projectsById = new Map<string, ProjectConfig>();
  for (const p of projectOverrides) {
    if (p.linear.projectId) projectsById.set(p.linear.projectId, p);
  }
  return {
    projects: projectOverrides,
    projectsById,
    AUTOSHIP_LINEAR_AUTO_STATE_ID: undefined,
    AUTOSHIP_LINEAR_AUTO_STATE: "Run Agent",
    AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID: undefined,
    AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE: "Breakdown Approved",
    AUTOSHIP_LINEAR_BUILD_STATE_ID: undefined,
    AUTOSHIP_LINEAR_BUILD_STATE: undefined,
    ...overrides,
  };
}

export function makeRunPayload(overrides: Partial<AutoshipRunPayload> = {}): AutoshipRunPayload {
  return {
    trigger: "manual",
    phase: "auto",
    eventId: "evt_123",
    targetState: "Run Agent",
    triggerReason: "manual",
    issueId: "FRD-162",
    repo: {
      fullName: "Calibrax-ai/autoship",
      cloneUrl: "https://github.com/Calibrax-ai/autoship.git",
      defaultBranch: "main",
    },
    linear: {
      eventId: "evt_123",
      action: "created",
      webhookType: "AgentSessionEvent",
      webhookTimestamp: 1_764_307_200_000,
      project: "Autoship",
    },
    ...overrides,
  };
}
