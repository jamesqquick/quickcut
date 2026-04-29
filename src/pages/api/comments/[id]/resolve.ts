import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { comments, videos } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { verifySpaceAccess } from "../../../../lib/spaces";

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: commentId } = params;
  if (!commentId) {
    return new Response(JSON.stringify({ error: "Comment ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { resolved } = body;

  if (typeof resolved !== "boolean") {
    return new Response(
      JSON.stringify({ error: "resolved must be a boolean" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = createDb(env.DB);

  // Verify comment exists and is a root comment
  const comment = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (comment.length === 0) {
    return new Response(JSON.stringify({ error: "Comment not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (comment[0].parentId) {
    return new Response(
      JSON.stringify({ error: "Only root comments can be resolved" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify user is a member of the video's space
  const videoRow = await db
    .select({ spaceId: videos.spaceId })
    .from(videos)
    .where(eq(videos.id, comment[0].videoId))
    .limit(1);
  if (videoRow.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const resolveRole = await verifySpaceAccess(db, locals.user.id, videoRow[0].spaceId);
  if (!resolveRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db
    .update(comments)
    .set({
      isResolved: resolved,
      resolvedBy: resolved ? locals.user.id : null,
      resolvedAt: resolved ? new Date().toISOString() : null,
      resolvedReason: resolved ? "manual" : null,
    })
    .where(eq(comments.id, commentId));

  const updated = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  return new Response(JSON.stringify({ comment: updated[0] }), {
    headers: { "Content-Type": "application/json" },
  });
};
