import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks, comments, users } from "../../../../db/schema";
import { eq, asc, gt, and } from "drizzle-orm";
import { broadcastNewComment } from "../../../../lib/broadcast";

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
      .select({ id: users.id, displayName: users.displayName })
      .from(users);
    userMap = Object.fromEntries(usersResult.map((u) => [u.id, u.displayName]));
  }

  const commentsWithNames = allComments.map((c) => ({
    ...c,
    annotation: c.annotation ? JSON.parse(c.annotation) : null,
    displayName:
      c.authorType === "user" && c.authorUserId
        ? userMap[c.authorUserId] || "Unknown"
        : c.authorDisplayName || "Anonymous",
  }));

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
  const { text, timestamp, displayName, parentId, annotation, urgency } = body;

  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "Comment text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!displayName || !displayName.trim()) {
    return new Response(
      JSON.stringify({ error: "Display name is required" }),
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
  const newComment = {
    id: commentId,
    videoId,
    authorType: "anonymous" as const,
    authorUserId: null,
    authorDisplayName: displayName.trim(),
    timestamp: timestamp != null ? Number(timestamp) : null,
    text: text.trim(),
    parentId: parentId || null,
    isResolved: false,
    resolvedBy: null,
    resolvedAt: null,
    annotation: annotation ? JSON.stringify(annotation) : null,
    urgency: commentUrgency,
  };

  await db.insert(comments).values(newComment);

  const responseComment = {
    ...newComment,
    annotation: annotation || null,
    createdAt: new Date().toISOString(),
    displayName: displayName.trim(),
  };

  await broadcastNewComment(env, videoId, responseComment);

  return new Response(JSON.stringify({ comment: responseComment }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
