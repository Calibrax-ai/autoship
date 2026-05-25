import { z } from "zod";

/**
 * Per-project config for the autoship-runner. Each entry maps one Linear
 * project to a GitHub repo + remote-runner policy.
 *
 * Migrate-friendly shape: each entry mirrors what would later live in the
 * matching repo's `.autoship/standards.yaml` if/when we move to a green-field
 * design where each repo self-describes and the runner just discovers them.
 * Migration would be: split this file into N `.autoship/standards.yaml`
 * entries (one per repo) and replace the static array with GitHub-org repo
 * discovery. The data shape stays the same.
 *
 * Add a project: append an entry, push, redeploy.
 * Remove a project: delete its entry (or set `remoteRunner.enabled: false`
 * to keep the config but stop accepting webhooks for it).
 */

export const projectConfigSchema = z.object({
  linear: z.object({
    /** Human-readable Linear project name. Resolved to projectId at startup. */
    project: z.string().min(1),
    /** Optional pre-resolved Linear project UUID. Skips the API lookup if set. */
    projectId: z.string().min(1).optional(),
  }),
  repo: z.object({
    /** "owner/name" form, e.g. "Calibrax-ai/finance_backend_agent". */
    fullName: z.string().min(1),
    /** HTTPS clone URL. */
    cloneUrl: z.string().url(),
    /** Default branch the runner clones for autoship runs. */
    branch: z.string().min(1).default("main"),
  }),
  remoteRunner: z
    .object({
      /** If false, webhooks for this project are ignored. */
      enabled: z.boolean().default(true),
    })
    .default({ enabled: true }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export const projectsSchema = z.array(projectConfigSchema);

export const projects: ProjectConfig[] = projectsSchema.parse([
  {
    linear: { project: "Gridfin" },
    repo: {
      fullName: "Calibrax-ai/finance_backend_agent",
      cloneUrl: "https://github.com/Calibrax-ai/finance_backend_agent.git",
      branch: "main",
    },
    remoteRunner: { enabled: true },
  },
  {
    linear: { project: "Koomi Bot" },
    repo: {
      fullName: "Calibrax-ai/koomi-bot-next",
      cloneUrl: "https://github.com/Calibrax-ai/koomi-bot-next.git",
      branch: "main",
    },
    remoteRunner: { enabled: true },
  },
]);
