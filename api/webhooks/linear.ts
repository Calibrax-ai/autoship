import type { IncomingMessage, ServerResponse } from "node:http";
import { readConfig } from "../../src/config.js";
import { handleLinearWebhook } from "../../src/handlers/webhook.js";
import { resolveLinearWebhookConfig } from "../../src/linear/resolve-filters.js";

const appConfig = readConfig();
const linearWebhookConfigPromise = resolveLinearWebhookConfig(appConfig);

// Vercel: disable automatic body parsing so we can compute HMAC over raw bytes.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.writeHead(405).end("method not allowed");
      return;
    }

    const linearWebhookConfig = await linearWebhookConfigPromise;
    const rawBody = await readRawBody(req);
    const signatureHeader = req.headers["linear-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    const result = await handleLinearWebhook({
      rawBody,
      signatureHeader: signature,
      config: appConfig,
      linearWebhookConfig,
    });

    const headers: Record<string, string> = {};
    if (result.contentType) headers["Content-Type"] = result.contentType;
    res.writeHead(result.status, headers).end(result.body);
  } catch (error) {
    console.error(error);
    res.writeHead(500).end("internal error");
  }
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}
