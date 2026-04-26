import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../db";
import { videos, comments } from "../../../db/schema";
import { and, eq, desc, sql, count, isNull } from "drizzle-orm";

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
  const folderId = url.searchParams.get("folderId");
  const where = folderId
    ? folderId === "root"
      ? and(eq(videos.userId, locals.user.id), isNull(videos.folderId), eq(videos.isCurrentVersion, true))
      : and(eq(videos.userId, locals.user.id), eq(videos.folderId, folderId), eq(videos.isCurrentVersion, true))
    : and(eq(videos.userId, locals.user.id), eq(videos.isCurrentVersion, true));

  const userVideos = await db
    .select()
    .from(videos)
    .where(where)
    .orderBy(desc(videos.createdAt))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: count() })
    .from(videos)
    .where(where);

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

  const versionGroupIds = userVideos.map((v) => v.versionGroupId || v.id);
  let versionCounts: Record<string, number> = {};

  if (versionGroupIds.length > 0) {
    const counts = await db
      .select({ versionGroupId: videos.versionGroupId, count: count() })
      .from(videos)
      .where(sql`${videos.versionGroupId} IN (${sql.join(versionGroupIds.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(videos.versionGroupId);

    versionCounts = Object.fromEntries(counts.map((c) => [c.versionGroupId || "", c.count]));
  }

  const videosWithCounts = userVideos.map((v) => ({
    ...v,
    commentCount: commentCounts[v.id] || 0,
    versionCount: versionCounts[v.versionGroupId || v.id] || 1,
  }));

  return new Response(
    JSON.stringify({
      videos: videosWithCounts,
      total: totalResult[0]?.count || 0,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
