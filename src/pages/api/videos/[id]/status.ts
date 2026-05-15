import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { videos } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { verifySpaceAccess } from "../../../../lib/spaces";

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
