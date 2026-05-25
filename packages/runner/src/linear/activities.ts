import { callLinear } from "./graphql.js";

/**
 * Fetch an issue's project (id + name) by UUID. Used by the comment-webhook
 * dispatch path because Linear's Comment webhook payload includes a minimal
 * `data.issue` reference (id, identifier, url) but not the nested project
 * object — synchronous project-match against the configured project list
 * fails for valid comments on configured issues. This one extra API call
 * resolves the project so we can dispatch a correctly-shaped run payload.
 */
export async function getIssueProject({
  apiKey,
  issueUuid,
}: {
  apiKey: string;
  issueUuid: string;
}): Promise<{ id: string; name: string } | null> {
  const response = await callLinear<{ issue: { project: { id: string; name: string } | null } | null }>({
    apiKey,
    query: `
      query GetIssueProject($id: String!) {
        issue(id: $id) {
          project { id name }
        }
      }
    `,
    variables: { id: issueUuid },
  });
  return response.issue?.project ?? null;
}

type ActivityContent =
  | { type: "thought"; body: string }
  | { type: "action"; action: string; parameter: string; result?: string }
  | { type: "response"; body: string }
  | { type: "error"; body: string };

export async function createAgentActivity({
  apiKey,
  agentSessionId,
  content,
}: {
  apiKey: string | undefined;
  agentSessionId: string | undefined;
  content: ActivityContent;
}): Promise<void> {
  if (!apiKey || !agentSessionId) return;

  await callLinear({
    apiKey,
    query: `
      mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
        agentActivityCreate(input: $input) {
          success
        }
      }
    `,
    variables: {
      input: {
        agentSessionId,
        content,
      },
    },
  });
}

export async function createComment({
  apiKey,
  issueId,
  body,
}: {
  apiKey: string | undefined;
  issueId: string | undefined;
  body: string;
}): Promise<string | undefined> {
  if (!apiKey || !issueId) return undefined;

  const response = await callLinear<{ commentCreate: { success: boolean; comment: { id: string } | null } }>({
    apiKey,
    query: `
      mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
          }
        }
      }
    `,
    variables: {
      input: {
        issueId,
        body,
      },
    },
  });

  return response.commentCreate.comment?.id;
}

export async function updateComment({
  apiKey,
  commentId,
  body,
}: {
  apiKey: string | undefined;
  commentId: string | undefined;
  body: string;
}): Promise<void> {
  if (!apiKey || !commentId) return;

  await callLinear({
    apiKey,
    query: `
      mutation CommentUpdate($id: String!, $input: CommentUpdateInput!) {
        commentUpdate(id: $id, input: $input) {
          success
        }
      }
    `,
    variables: {
      id: commentId,
      input: { body },
    },
  });
}

export async function addAgentSessionUrl({
  apiKey,
  agentSessionId,
  label,
  url,
}: {
  apiKey: string | undefined;
  agentSessionId: string | undefined;
  label: string;
  url: string | undefined;
}): Promise<void> {
  if (!apiKey || !agentSessionId || !url) return;

  await callLinear({
    apiKey,
    query: `
      mutation AgentSessionUpdate($id: String!, $input: AgentSessionUpdateInput!) {
        agentSessionUpdate(id: $id, input: $input) {
          success
        }
      }
    `,
    variables: {
      id: agentSessionId,
      input: {
        addedExternalUrls: [{ label, url }],
      },
    },
  });
}
