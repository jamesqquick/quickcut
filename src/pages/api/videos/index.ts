import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../db";
import { comments, spaceMembers } from "../../../db/schema";
import { count, eq, sql } from "drizzle-orm";
import {
  getVersionCountsByProjectId,
  listCurrentMergedVideos,
} from "../../../lib/projects";

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

  const memberRows = await db
    .select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, locals.user.id));
  const spaceIds = memberRows.map((r) => r.spaceId);

  if (spaceIds.length === 0) {
    return new Response(
      JSON.stringify({ videos: [], total: 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const { rows: userVideos, total } = await listCurrentMergedVideos(db, {
    spaceIds,
    folderId,
    limit,
    offset,
  });

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

  const versionCounts = await getVersionCountsByProjectId(
    db,
    userVideos.map((v) => v.projectId).filter((id): id is string => Boolean(id)),
  );

  const videosWithCounts = userVideos.map((v) => ({
    ...v,
    commentCount: commentCounts[v.id] || 0,
    versionCount: versionCounts[v.projectId ?? ""] || 1,
  }));

  return new Response(
    JSON.stringify({
      videos: videosWithCounts,
      total,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
