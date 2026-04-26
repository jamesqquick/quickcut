import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { comments } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { broadcastNewComment } from "../../../../lib/broadcast";

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

  const commentId = crypto.randomUUID();
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
    annotation: null,
  };

  await db.insert(comments).values(newReply);

  const responseComment = {
    ...newReply,
    createdAt: new Date().toISOString(),
    displayName: locals.user.displayName,
  };

  await broadcastNewComment(env, parent[0].videoId, responseComment);

  return new Response(JSON.stringify({ comment: responseComment }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
