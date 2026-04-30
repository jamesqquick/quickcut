import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { comments, videos } from "../../../../db/schema";
import { broadcastCommentReactions } from "../../../../lib/broadcast";
import {
  isCommentReactionEmoji,
  toggleCommentReaction,
} from "../../../../lib/comments";
import { verifySpaceAccess } from "../../../../lib/spaces";

export const POST: APIRoute = async ({ params, locals, request }) => {
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
  const emoji = typeof body.emoji === "string" ? body.emoji : "";
  if (!isCommentReactionEmoji(emoji)) {
    return new Response(JSON.stringify({ error: "Unsupported reaction" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const comment = await db
    .select({ videoId: comments.videoId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (comment.length === 0) {
    return new Response(JSON.stringify({ error: "Comment not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const videoRow = await db
    .select({ spaceId: videos.spaceId, phase: videos.phase })
    .from(videos)
    .where(eq(videos.id, comment[0].videoId))
    .limit(1);
  if (videoRow.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (videoRow[0].phase === "published") {
    return new Response(JSON.stringify({ error: "Cannot react on published videos" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const role = await verifySpaceAccess(db, locals.user.id, videoRow[0].spaceId);
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const reactions = await toggleCommentReaction(db, commentId, emoji, {
    userId: locals.user.id,
    displayName: locals.user.displayName,
  });

  const update = { commentId, reactions };
  await broadcastCommentReactions(env, comment[0].videoId, {
    commentId,
    reactions: reactions.map((reaction) => ({
      ...reaction,
      reactedByMe: false,
    })),
  });

  return new Response(JSON.stringify(update), {
    headers: { "Content-Type": "application/json" },
  });
};
