import type { AppConfig } from "../config.js";
import { projects as configuredProjects, type ProjectConfig } from "../projects.config.js";
import { callLinear } from "./graphql.js";

export type LinearWebhookFilters = {
  /** Resolved Linear project map: project UUID -> ProjectConfig. */
  projectsById: Map<string, ProjectConfig>;
  /** All registered projects (with resolved projectId where possible). */
  projects: ProjectConfig[];
  AUTOSHIP_LINEAR_AUTO_STATE_ID?: string;
  AUTOSHIP_LINEAR_AUTO_STATE: string;
  AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID?: string;
  AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE: string;
  AUTOSHIP_LINEAR_BUILD_STATE_ID?: string;
  AUTOSHIP_LINEAR_BUILD_STATE?: string;
};

export type LinearWebhookConfig = LinearWebhookFilters;

type ProjectNode = {
  id: string;
  name: string;
};

type WorkflowStateNode = {
  id: string;
  name: string;
};

type ProjectsQueryResult = {
  projects: {
    nodes: ProjectNode[];
  };
};

type WorkflowStatesQueryResult = {
  workflowStates: {
    nodes: WorkflowStateNode[];
  };
};

export async function resolveLinearWebhookConfig(config: AppConfig): Promise<LinearWebhookConfig> {
  const shouldResolveBuildState = Boolean(config.AUTOSHIP_LINEAR_BUILD_STATE_ID || config.AUTOSHIP_LINEAR_BUILD_STATE);

  // Start with names-only fallback. If LINEAR_API_KEY is missing or any
  // resolution fails, this is what callers get; project filtering then falls
  // back to matching by name in parseLinearWebhook.
  const fallbackProjects: ProjectConfig[] = configuredProjects.filter((p) => p.remoteRunner.enabled);
  const fallback: LinearWebhookConfig = {
    projects: fallbackProjects,
    projectsById: new Map(),
    AUTOSHIP_LINEAR_AUTO_STATE_ID: config.AUTOSHIP_LINEAR_AUTO_STATE_ID,
    AUTOSHIP_LINEAR_AUTO_STATE: config.AUTOSHIP_LINEAR_AUTO_STATE,
    AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID: config.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID,
    AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE: config.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE,
    AUTOSHIP_LINEAR_BUILD_STATE_ID: config.AUTOSHIP_LINEAR_BUILD_STATE_ID,
    AUTOSHIP_LINEAR_BUILD_STATE: config.AUTOSHIP_LINEAR_BUILD_STATE,
  };

  if (!config.LINEAR_API_KEY) return fallback;

  try {
    const apiKey = config.LINEAR_API_KEY;

    // Resolve each project's projectId in parallel.
    const resolvedProjects = await Promise.all(
      fallbackProjects.map(async (p): Promise<ProjectConfig> => {
        if (p.linear.projectId) return p;
        try {
          const projectId = await resolveProjectIdByName({ apiKey, projectName: p.linear.project });
          return { ...p, linear: { ...p.linear, projectId } };
        } catch (err) {
          console.warn(
            `Linear project resolution failed for "${p.linear.project}": ${err instanceof Error ? err.message : String(err)}`,
          );
          return p;
        }
      }),
    );

    const projectsById = new Map<string, ProjectConfig>();
    for (const p of resolvedProjects) {
      if (p.linear.projectId) projectsById.set(p.linear.projectId, p);
    }

    return {
      ...fallback,
      projects: resolvedProjects,
      projectsById,
      AUTOSHIP_LINEAR_AUTO_STATE_ID:
        fallback.AUTOSHIP_LINEAR_AUTO_STATE_ID ??
        (await resolveWorkflowStateIdByName({ apiKey, stateName: fallback.AUTOSHIP_LINEAR_AUTO_STATE })),
      AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID:
        fallback.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE_ID ??
        (await resolveWorkflowStateIdByName({
          apiKey,
          stateName: fallback.AUTOSHIP_LINEAR_BREAKDOWN_APPROVED_STATE,
        })),
      AUTOSHIP_LINEAR_BUILD_STATE_ID:
        fallback.AUTOSHIP_LINEAR_BUILD_STATE_ID ??
        (shouldResolveBuildState
          ? await resolveWorkflowStateIdByName({ apiKey, stateName: fallback.AUTOSHIP_LINEAR_BUILD_STATE! })
          : undefined),
    };
  } catch (error) {
    console.warn(
      `Linear name-to-ID resolution failed; falling back to names from env. ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallback;
  }
}

async function resolveProjectIdByName({
  apiKey,
  projectName,
}: {
  apiKey: string;
  projectName: string;
}): Promise<string> {
  const result = await callLinear<ProjectsQueryResult>({
    apiKey,
    query: `
      query ResolveAutoshipProject($projectName: String!) {
        projects(filter: { name: { eq: $projectName } }, first: 2) {
          nodes {
            id
            name
          }
        }
      }
    `,
    variables: { projectName },
  });

  return expectSingleMatch({
    kind: "Linear project",
    name: projectName,
    nodes: result.projects.nodes,
  });
}

async function resolveWorkflowStateIdByName({
  apiKey,
  stateName,
}: {
  apiKey: string;
  stateName: string;
}): Promise<string | undefined> {
  const result = await callLinear<WorkflowStatesQueryResult>({
    apiKey,
    query: `
      query ResolveAutoshipWorkflowState($stateName: String!) {
        workflowStates(filter: { name: { eq: $stateName } }, first: 10) {
          nodes {
            id
            name
          }
        }
      }
    `,
    variables: { stateName },
  });

  const nodes = result.workflowStates.nodes;
  if (nodes.length === 0) {
    throw new Error(`Linear workflow state "${stateName}" was not found while resolving Autoship webhook filters.`);
  }
  if (nodes.length === 1) return nodes[0].id;

  // Multi-team workspaces have one workflow state per team with the same name.
  // That's normal once the runner serves more than one team. Skip ID resolution
  // and rely on name-based matching in matchesState (state names are the
  // cross-team contract per CONTRACTS.md Surface 1).
  console.warn(
    `Linear workflow state "${stateName}" exists in ${nodes.length} teams; ` +
      `skipping ID resolution and relying on name-based matching.`,
  );
  return undefined;
}

function expectSingleMatch({
  kind,
  name,
  nodes,
}: {
  kind: string;
  name: string;
  nodes: Array<{ id: string; name: string }>;
}): string {
  if (nodes.length === 1) return nodes[0].id;

  if (nodes.length === 0) {
    throw new Error(`${kind} "${name}" was not found while resolving Autoship webhook filters.`);
  }

  throw new Error(
    `${kind} "${name}" matched ${nodes.length} records. Use the explicit ID env var to disambiguate.`,
  );
}
