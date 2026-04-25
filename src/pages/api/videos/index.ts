import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../db";
import { videos, comments } from "../../../db/schema";
import { eq, desc, sql, count } from "drizzle-orm";

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const userVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.userId, locals.user.id))
    .orderBy(desc(videos.createdAt))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: count() })
    .from(videos)
    .where(eq(videos.userId, locals.user.id));

  // Get comment counts for each video
  const videoIds = userVideos.map((v) => v.id);
  let commentCounts: Record<string, number> = {};

  if (videoIds.length > 0) {
    const counts = await db
      .select({
        videoId: comments.videoId,
        count: count(),
      })
      .from(comments)
      .where(sql`${comments.videoId} IN (${sql.join(videoIds.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(comments.videoId);

    commentCounts = Object.fromEntries(counts.map((c) => [c.videoId, c.count]));
  }

  const videosWithCounts = userVideos.map((v) => ({
    ...v,
    commentCount: commentCounts[v.id] || 0,
  }));

  return new Response(
    JSON.stringify({
      videos: videosWithCounts,
      total: totalResult[0]?.count || 0,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
