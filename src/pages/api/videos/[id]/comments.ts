import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { comments, users, videos } from "../../../../db/schema";
import { eq, asc, gt, and, inArray } from "drizzle-orm";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { addReactionSummaries } from "../../../../lib/comments";

// GET-only endpoint for the comments polling fallback. Mutations live in
// `actions.comment.*` (src/actions/index.ts).
export const GET: APIRoute = async ({ params, locals, url }) => {
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

  // Verify user can access this video's space
  const videoRow = await db
    .select({ spaceId: videos.spaceId })
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);
  if (videoRow.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const commentRole = await verifySpaceAccess(db, locals.user.id, videoRow[0].spaceId);
  if (!commentRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const since = url.searchParams.get("since");

  let conditions = eq(comments.videoId, id);
  if (since) {
    conditions = and(conditions, gt(comments.createdAt, since))!;
  }

  const allComments = await db
    .select()
    .from(comments)
    .where(conditions)
    .orderBy(asc(comments.timestamp), asc(comments.createdAt));

  // Resolve display names
  const userIds = [
    ...new Set(
      allComments.filter((c) => c.authorUserId).map((c) => c.authorUserId!),
    ),
  ];
  let userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const usersResult = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, userIds));
    userMap = Object.fromEntries(usersResult.map((u) => [u.id, u.name]));
  }

  const commentsWithNames = await addReactionSummaries(
    db,
    allComments.map((c) => ({
      ...c,
      annotation: c.annotation ? JSON.parse(c.annotation) : null,
      textRange: c.textRange ? JSON.parse(c.textRange) : null,
      name:
        c.authorType === "user" && c.authorUserId
          ? userMap[c.authorUserId] || "Unknown"
          : c.authorDisplayName || "Anonymous",
    })),
    {
      userId: locals.user.id,
      name: locals.user.name,
    },
  );

  return new Response(JSON.stringify({ comments: commentsWithNames }), {
    headers: { "Content-Type": "application/json" },
  });
};
