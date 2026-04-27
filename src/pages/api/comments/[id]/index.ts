import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { comments, videos } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { verifySpaceAccess } from "../../../../lib/spaces";

export const DELETE: APIRoute = async ({ params, locals }) => {
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

  const db = createDb(env.DB);

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
  const deleteRole = await verifySpaceAccess(db, locals.user.id, videoRow[0].spaceId);
  if (!deleteRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (comment[0].authorUserId !== locals.user.id) {
    return new Response(
      JSON.stringify({ error: "You can only delete your own comments" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // Delete replies if this is a root comment
  if (!comment[0].parentId) {
    await db.delete(comments).where(eq(comments.parentId, commentId));
  }

  await db.delete(comments).where(eq(comments.id, commentId));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
