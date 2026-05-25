const linearGraphqlUrl = "https://api.linear.app/graphql";

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

export async function callLinear<T>({
  apiKey,
  query,
  variables,
}: {
  apiKey: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(linearGraphqlUrl, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(`Linear GraphQL request failed (${response.status}): ${responseBody}`);
  }

  const parsed = JSON.parse(responseBody) as GraphqlResponse<T>;

  if (parsed.errors?.length) {
    const messages = parsed.errors.map((error) => error.message).join("; ");
    throw new Error(`Linear GraphQL request failed: ${messages}`);
  }

  if (!parsed.data) {
    throw new Error("Linear GraphQL request returned no data.");
  }

  return parsed.data;
}
