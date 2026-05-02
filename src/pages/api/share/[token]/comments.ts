import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks, comments, users } from "../../../../db/schema";
import { eq, asc, gt, and } from "drizzle-orm";
import { broadcastNewComment } from "../../../../lib/broadcast";
import { addReactionSummaries } from "../../../../lib/comments";
import { createCommentNotifications } from "../../../../lib/notifications";

export const GET: APIRoute = async ({ params, url }) => {
  const { token } = params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Token required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const shareLinkResult = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (shareLinkResult.length === 0 || shareLinkResult[0].status === "revoked") {
    return new Response(JSON.stringify({ error: "Link not available" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const videoId = shareLinkResult[0].videoId;
  const since = url.searchParams.get("since");

  let conditions = eq(comments.videoId, videoId);
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
      .from(users);
    userMap = Object.fromEntries(usersResult.map((u) => [u.id, u.name]));
  }

  const commentsWithNames = await addReactionSummaries(
    db,
    allComments.map((c) => ({
      ...c,
      annotation: c.annotation ? JSON.parse(c.annotation) : null,
      name:
        c.authorType === "user" && c.authorUserId
          ? userMap[c.authorUserId] || "Unknown"
          : c.authorDisplayName || "Anonymous",
    })),
  );

  return new Response(JSON.stringify({ comments: commentsWithNames }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const { token } = params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Token required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const shareLinkResult = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (shareLinkResult.length === 0 || shareLinkResult[0].status === "revoked") {
    return new Response(JSON.stringify({ error: "Link not available" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const videoId = shareLinkResult[0].videoId;
  const body = await request.json();
  const { text, timestamp, name, parentId, annotation, urgency } = body;

  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "Comment text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!name || !name.trim()) {
    return new Response(
      JSON.stringify({ error: "Name is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Replies don't carry urgency; force "suggestion" for them. Validate input
  // for top-level comments and fall back to "suggestion" if missing/invalid.
  const allowedUrgencies = [
    "idea",
    "suggestion",
    "important",
    "critical",
  ] as const;
  type Urgency = (typeof allowedUrgencies)[number];
  const isReply = !!parentId;
  const commentUrgency: Urgency = isReply
    ? "suggestion"
    : allowedUrgencies.includes(urgency as Urgency)
      ? (urgency as Urgency)
      : "suggestion";

  const commentId = crypto.randomUUID();
  let parentPhase: "script" | "review" = "review";
  if (isReply && parentId) {
    const parentRows = await db
      .select({ phase: comments.phase })
      .from(comments)
      .where(and(eq(comments.id, parentId), eq(comments.videoId, videoId)))
      .limit(1);

    if (parentRows.length === 0) {
      return new Response(JSON.stringify({ error: "Parent comment not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    parentPhase = parentRows[0].phase;
  }

  const newComment = {
    id: commentId,
    videoId,
    authorType: "anonymous" as const,
    authorUserId: null,
    authorDisplayName: name.trim(),
    timestamp: timestamp != null ? Number(timestamp) : null,
    text: text.trim(),
    parentId: parentId || null,
    isResolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolvedReason: null,
    annotation: annotation ? JSON.stringify(annotation) : null,
    urgency: commentUrgency,
    phase: parentPhase,
    textRange: null,
  };

  await db.insert(comments).values(newComment);

  try {
    await createCommentNotifications(db, {
      commentId,
      videoId,
      actorUserId: null,
      actorDisplayName: newComment.authorDisplayName,
      text: newComment.text,
      parentCommentId: newComment.parentId,
      phase: newComment.phase,
    }, {
      send: (msg) => env.EMAIL.send(msg),
      from: env.OTP_EMAIL_FROM,
      baseUrl: new URL(request.url).origin,
    });
  } catch (err) {
    console.error("Failed to create share comment notification", err);
  }

  const responseComment = {
    ...newComment,
    annotation: annotation || null,
    createdAt: new Date().toISOString(),
    name: name.trim(),
    reactions: [],
  };

  await broadcastNewComment(env, videoId, responseComment);

  return new Response(JSON.stringify({ comment: responseComment }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
