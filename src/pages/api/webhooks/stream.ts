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

async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;

  try {
    // Cloudflare Stream webhook signatures use a time-based HMAC
    // For simplicity in MVP, we'll verify the secret matches
    // In production, implement full signature verification
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    const parts = signature.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const sigPart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !sigPart) return false;

    const timestamp = timestampPart.slice(2);
    const expectedSig = sigPart.slice(3);

    const signedPayload = `${timestamp}.${body}`;
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload),
    );

    const computedSig = [...new Uint8Array(mac)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === expectedSig;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get("webhook-signature");

  // Verify webhook signature if secret is configured
  if (env.STREAM_WEBHOOK_SECRET) {
    const valid = await verifyWebhookSignature(
      body,
      signature,
      env.STREAM_WEBHOOK_SECRET,
    );
    if (!valid) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }
  }

  let payload: StreamWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const db = createDb(env.DB);

  // Find video by Stream video ID
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
