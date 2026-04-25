import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { comments, users, videos } from "../../../../db/schema";
import { eq, asc, gt, and } from "drizzle-orm";

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
      .select({ id: users.id, displayName: users.displayName })
      .from(users);
    userMap = Object.fromEntries(usersResult.map((u) => [u.id, u.displayName]));
  }

  const commentsWithNames = allComments.map((c) => ({
    ...c,
    displayName:
      c.authorType === "user" && c.authorUserId
        ? userMap[c.authorUserId] || "Unknown"
        : c.authorDisplayName || "Anonymous",
  }));

  return new Response(JSON.stringify({ comments: commentsWithNames }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ params, locals, request }) => {
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

  const body = await request.json();
  const { text, timestamp } = body;

  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "Comment text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Verify video exists
  const video = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);
  if (video.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const commentId = crypto.randomUUID();
  const newComment = {
    id: commentId,
    videoId: id,
    authorType: "user" as const,
    authorUserId: locals.user.id,
    authorDisplayName: locals.user.displayName,
    timestamp: timestamp != null ? Number(timestamp) : null,
    text: text.trim(),
    parentId: null,
    isResolved: false,
    resolvedBy: null,
    resolvedAt: null,
  };

  await db.insert(comments).values(newComment);

  return new Response(
    JSON.stringify({
      comment: {
        ...newComment,
        createdAt: new Date().toISOString(),
        displayName: locals.user.displayName,
      },
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
};
