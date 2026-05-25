import { createServer } from "node:http";
import { readConfig } from "./config.js";
import { handleLinearWebhook } from "./handlers/webhook.js";
import { resolveLinearWebhookConfig } from "./linear/resolve-filters.js";

const config = readConfig();
const linearWebhookConfig = await resolveLinearWebhookConfig(config);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      response
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method !== "POST" || request.url !== "/webhooks/linear") {
      response.writeHead(404).end("not found");
      return;
    }

    const rawBody = await readRawBody(request);
    const signatureHeader = request.headers["linear-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    const result = await handleLinearWebhook({
      rawBody,
      signatureHeader: signature,
      config,
      linearWebhookConfig,
    });

    const headers: Record<string, string> = {};
    if (result.contentType) headers["Content-Type"] = result.contentType;
    response.writeHead(result.status, headers).end(result.body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end("internal error");
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.PORT} is already in use. Stop the existing runner or set PORT to another value.`,
    );
    process.exit(1);
  }

  throw error;
});

server.listen(config.PORT, () => {
  console.log(`autoship-runner listening on http://localhost:${config.PORT}`);
});

function readRawBody(request: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
