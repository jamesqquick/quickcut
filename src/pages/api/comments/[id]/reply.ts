import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { comments, videos } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { broadcastNewComment } from "../../../../lib/broadcast";
import { verifySpaceAccess } from "../../../../lib/spaces";

export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: parentId } = params;
  if (!parentId) {
    return new Response(JSON.stringify({ error: "Parent comment ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { text } = body;

  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "Reply text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Verify parent comment exists
  const parent = await db
    .select()
    .from(comments)
    .where(eq(comments.id, parentId))
    .limit(1);

  if (parent.length === 0) {
    return new Response(JSON.stringify({ error: "Parent comment not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify user is a member of the video's space
  const videoRow = await db
    .select({ spaceId: videos.spaceId })
    .from(videos)
    .where(eq(videos.id, parent[0].videoId))
    .limit(1);
  if (videoRow.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const replyRole = await verifySpaceAccess(db, locals.user.id, videoRow[0].spaceId);
  if (!replyRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const commentId = crypto.randomUUID();
  // Replies don't carry urgency; default to "suggestion" so the column stays
  // populated without surfacing in the UI.
  const newReply = {
    id: commentId,
    videoId: parent[0].videoId,
    authorType: "user" as const,
    authorUserId: locals.user.id,
    authorDisplayName: locals.user.displayName,
    timestamp: null,
    text: text.trim(),
    parentId,
    isResolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolvedReason: null,
    annotation: null,
    urgency: "suggestion" as const,
    phase: parent[0].phase,
    textRange: null,
  };

  await db.insert(comments).values(newReply);

  const responseComment = {
    ...newReply,
    createdAt: new Date().toISOString(),
    displayName: locals.user.displayName,
    reactions: [],
  };

  await broadcastNewComment(env, parent[0].videoId, responseComment);

  return new Response(JSON.stringify({ comment: responseComment }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
