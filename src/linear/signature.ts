import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyLinearSignature({
  rawBody,
  signatureHeader,
  secret,
}: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
}): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, "hex");

  if (received.length !== expected.length) return false;

  return timingSafeEqual(received, expected);
}

export function isFreshLinearWebhook(timestamp: unknown, now = Date.now()): boolean {
  if (typeof timestamp !== "number") return false;

  return Math.abs(now - timestamp) <= 60_000;
}
