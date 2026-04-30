import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../../../db";
import { comments, shareLinks } from "../../../../../../db/schema";
import { broadcastCommentReactions } from "../../../../../../lib/broadcast";
import {
  isCommentReactionEmoji,
  toggleCommentReaction,
} from "../../../../../../lib/comments";

export const POST: APIRoute = async ({ params, request }) => {
  const { token, id: commentId } = params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Token required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!commentId) {
    return new Response(JSON.stringify({ error: "Comment ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const emoji = typeof body.emoji === "string" ? body.emoji : "";
  const anonymousReactorId =
    typeof body.anonymousReactorId === "string"
      ? body.anonymousReactorId.trim()
      : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!isCommentReactionEmoji(emoji)) {
    return new Response(JSON.stringify({ error: "Unsupported reaction" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!anonymousReactorId || !displayName) {
    return new Response(JSON.stringify({ error: "Reviewer identity required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!/^[0-9a-f-]{36}$/i.test(anonymousReactorId)) {
    return new Response(JSON.stringify({ error: "Invalid reviewer identity" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const shareLinkResult = await db
    .select({ videoId: shareLinks.videoId, status: shareLinks.status })
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (shareLinkResult.length === 0 || shareLinkResult[0].status === "revoked") {
    return new Response(JSON.stringify({ error: "Link not available" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const comment = await db
    .select({ videoId: comments.videoId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (comment.length === 0 || comment[0].videoId !== shareLinkResult[0].videoId) {
    return new Response(JSON.stringify({ error: "Comment not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const reactions = await toggleCommentReaction(db, commentId, emoji, {
    type: "anonymous",
    anonymousId: anonymousReactorId,
    displayName,
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
