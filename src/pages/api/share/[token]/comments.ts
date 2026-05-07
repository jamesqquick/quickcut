import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks, comments, projects, users, videos } from "../../../../db/schema";
import { eq, asc, gt, and } from "drizzle-orm";
import { broadcastNewComment } from "../../../../lib/broadcast";
import { addReactionSummaries } from "../../../../lib/comments";
import { createCommentNotifications } from "../../../../lib/notifications";
import { anonymousCommentSchema, commentSchema } from "../../../../lib/validation";
import { getCanonicalBaseUrl } from "../../../../lib/urls";
import { z } from "zod";

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
      textRange: c.textRange ? JSON.parse(c.textRange) : null,
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

export const POST: APIRoute = async ({ params, request, locals }) => {
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

  const sessionUser = locals.user;
  const videoId = shareLinkResult[0].videoId;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const schema = sessionUser ? commentSchema : anonymousCommentSchema;
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const input = parsed.data;
  const anonymousName = !sessionUser
    ? (input as z.infer<typeof anonymousCommentSchema>).name
    : null;

  const videoResult = await db
    .select({ phase: projects.phase })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(eq(videos.id, videoId))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (videoResult[0].phase === "published") {
    return new Response(JSON.stringify({ error: "Cannot comment on published videos" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isReply = !!input.parentId;
  const commentUrgency = isReply ? "suggestion" : input.urgency;

  const commentId = crypto.randomUUID();

  let commentPhase: "script" | "review" = input.phase;
  if (isReply && input.parentId) {
    const parentRows = await db
      .select({ phase: comments.phase })
      .from(comments)
      .where(and(eq(comments.id, input.parentId), eq(comments.videoId, videoId)))
      .limit(1);

    if (parentRows.length === 0) {
      return new Response(JSON.stringify({ error: "Parent comment not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    commentPhase = parentRows[0].phase;
  }

  const annotation = input.annotation ?? null;
  const textRange = input.textRange ?? null;
  const timestampValue = input.timestamp ?? null;

  const newComment = sessionUser
    ? {
        id: commentId,
        videoId,
        authorType: "user" as const,
        authorUserId: sessionUser.id,
        authorDisplayName: null,
        timestamp: timestampValue,
        text: input.text,
        parentId: input.parentId ?? null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolvedReason: null,
        annotation: annotation ? JSON.stringify(annotation) : null,
        urgency: commentUrgency,
        phase: commentPhase,
        textRange: textRange ? JSON.stringify(textRange) : null,
      }
    : {
        id: commentId,
        videoId,
        authorType: "anonymous" as const,
        authorUserId: null,
        authorDisplayName: anonymousName!,
        timestamp: timestampValue,
        text: input.text,
        parentId: input.parentId ?? null,
        isResolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolvedReason: null,
        annotation: annotation ? JSON.stringify(annotation) : null,
        urgency: commentUrgency,
        phase: commentPhase,
        textRange: textRange ? JSON.stringify(textRange) : null,
      };

  await db.insert(comments).values(newComment);

  const displayName = sessionUser?.name ?? newComment.authorDisplayName ?? "Anonymous";

  try {
    await createCommentNotifications(db, {
      commentId,
      videoId,
      actorUserId: sessionUser?.id ?? null,
      actorDisplayName: displayName,
      text: newComment.text,
      parentCommentId: newComment.parentId,
      phase: newComment.phase,
    }, {
      send: (msg) => env.EMAIL.send(msg),
      from: env.OTP_EMAIL_FROM,
      baseUrl: getCanonicalBaseUrl(env),
    }, env);
  } catch (err) {
    console.error("Failed to create share comment notification", err);
  }

  const responseComment = {
    ...newComment,
    annotation: annotation || null,
    textRange: textRange || null,
    createdAt: new Date().toISOString(),
    name: displayName,
    reactions: [],
  };

  await broadcastNewComment(env, videoId, responseComment);

  return new Response(JSON.stringify({ comment: responseComment }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
