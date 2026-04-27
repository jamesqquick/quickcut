import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { videos } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { getVideoInfo } from "../../../../lib/stream";
import { queueTranscriptForVideo } from "../../../../lib/transcripts";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const result = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (result.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const video = result[0];

  // If still processing and we have a Stream video ID, check Stream API directly
  // This handles the case where the webhook can't reach us (e.g. local dev)
  if (video.status === "processing" && video.streamVideoId) {
    try {
      const info = await getVideoInfo(
        env.STREAM_ACCOUNT_ID,
        env.STREAM_API_TOKEN,
        video.streamVideoId,
      );

      if (info.readyToStream && info.status.state === "ready") {
        const now = new Date().toISOString();
        // Update DB with the real data from Stream
        await db
          .update(videos)
          .set({
            status: "ready",
            duration: info.duration,
            thumbnailUrl: info.thumbnail,
            streamPlaybackUrl: info.playback.hls,
            updatedAt: now,
          })
          .where(eq(videos.id, id));

        await queueTranscriptForVideo(env, db, {
          ...video,
          status: "ready",
          duration: info.duration,
          thumbnailUrl: info.thumbnail,
          streamPlaybackUrl: info.playback.hls,
          updatedAt: now,
        });

        return new Response(
          JSON.stringify({
            status: "ready",
            thumbnailUrl: info.thumbnail,
            duration: info.duration,
            streamPlaybackUrl: info.playback.hls,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (info.status.state === "error") {
        await db
          .update(videos)
          .set({
            status: "failed",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(videos.id, id));

        return new Response(
          JSON.stringify({
            status: "failed",
            thumbnailUrl: null,
            duration: null,
            streamPlaybackUrl: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (e) {
      // Stream API check failed — fall through and return DB status
      console.error("Stream API status check failed:", e);
    }
  }

  return new Response(
    JSON.stringify({
      status: video.status,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      streamPlaybackUrl: video.streamPlaybackUrl,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
