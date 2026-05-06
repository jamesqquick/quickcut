import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../db";
import { videos } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { queueTranscriptForVideo } from "../../../lib/transcripts";

interface StreamWebhookPayload {
  uid: string;
  readyToStream: boolean;
  status: {
    state: string;
    errorReasonCode: string;
    errorReasonText: string;
  };
  duration: number;
  thumbnail: string;
  playback: {
    hls: string;
    dash: string;
  };
}

type SignatureFailureReason =
  | "missing_header"
  | "missing_secret"
  | "unparseable_header"
  | "signature_mismatch";

interface SignatureVerificationResult {
  valid: boolean;
  reason?: SignatureFailureReason;
  parsed: {
    hasTime: boolean;
    hasSig1: boolean;
  };
}

async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
): Promise<SignatureVerificationResult> {
  const empty = { hasTime: false, hasSig1: false };

  if (!signature) {
    return { valid: false, reason: "missing_header", parsed: empty };
  }
  if (!secret) {
    return { valid: false, reason: "missing_secret", parsed: empty };
  }

  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );

  const time = parts["time"];
  const receivedSig = parts["sig1"];
  const parsed = { hasTime: !!time, hasSig1: !!receivedSig };

  if (!time || !receivedSig) {
    return { valid: false, reason: "unparseable_header", parsed };
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${time}.${body}`),
  );

  const expectedSig = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const expectedBytes = encoder.encode(expectedSig);
  const receivedBytes = encoder.encode(receivedSig);

  // Compare against self when lengths differ to avoid leaking expected length
  // via early-return timing; per Cloudflare's reference verifier.
  const lengthsMatch = expectedBytes.byteLength === receivedBytes.byteLength;
  const signaturesMatch = lengthsMatch
    ? crypto.subtle.timingSafeEqual(expectedBytes, receivedBytes)
    : !crypto.subtle.timingSafeEqual(expectedBytes, expectedBytes);

  if (!signaturesMatch) {
    return { valid: false, reason: "signature_mismatch", parsed };
  }

  return { valid: true, parsed };
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get("Webhook-Signature");

  if (env.STREAM_WEBHOOK_SECRET) {
    const result = await verifyWebhookSignature(
      body,
      signature,
      env.STREAM_WEBHOOK_SECRET,
    );
    if (!result.valid) {
      console.error("Invalid webhook signature", {
        hasHeader: signature !== null,
        hasSecret: !!env.STREAM_WEBHOOK_SECRET,
        parsed: result.parsed,
        bodyLength: body.length,
        reason: result.reason,
      });
      return new Response("Invalid signature", { status: 403 });
    }
  }

  let payload: StreamWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const db = createDb(env.DB);

  const videoRecords = await db
    .select()
    .from(videos)
    .where(eq(videos.streamVideoId, payload.uid))
    .limit(1);

  if (videoRecords.length === 0) {
    console.warn(`No video found for Stream UID: ${payload.uid}`);
    return new Response("OK", { status: 200 });
  }

  const video = videoRecords[0];

  if (payload.readyToStream && payload.status.state === "ready") {
    const now = new Date().toISOString();
    await db
      .update(videos)
      .set({
        status: "ready",
        duration: payload.duration,
        thumbnailUrl: payload.thumbnail,
        streamPlaybackUrl: payload.playback.hls,
        updatedAt: now,
      })
      .where(eq(videos.id, video.id));

    await queueTranscriptForVideo(env, db, {
      ...video,
      status: "ready",
      duration: payload.duration,
      thumbnailUrl: payload.thumbnail,
      streamPlaybackUrl: payload.playback.hls,
      updatedAt: now,
    });
  } else if (payload.status.state === "error") {
    await db
      .update(videos)
      .set({
        status: "failed",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(videos.id, video.id));
  }

  return new Response("OK", { status: 200 });
};
