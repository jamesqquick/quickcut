import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { videos } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { getVideoInfo } from "../../../../lib/stream";

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
    .select({
      status: videos.status,
      thumbnailUrl: videos.thumbnailUrl,
      duration: videos.duration,
      streamPlaybackUrl: videos.streamPlaybackUrl,
      streamVideoId: videos.streamVideoId,
      spaceId: videos.spaceId,
    })
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

  const statusRole = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!statusRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // When DB still says "processing", check Stream API for the real status.
  // Read-only: the webhook owns DB transitions, but this lets the client
  // see progress (especially in local dev where webhooks can't arrive).
  if (video.status === "processing" && video.streamVideoId) {
    try {
      const info = await getVideoInfo(
        env.STREAM_ACCOUNT_ID,
        env.STREAM_API_TOKEN,
        video.streamVideoId,
      );

      if (info.readyToStream && info.status.state === "ready") {
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
