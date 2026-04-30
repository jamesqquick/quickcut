import { and, asc, eq, inArray } from "drizzle-orm";
import { commentReactions, comments, users } from "../db/schema";
import type { Database } from "../db";
import {
  COMMENT_REACTION_EMOJIS,
  type Comment,
  type CommentReactionEmoji,
  type CommentReactionSummary,
} from "../types";

export type CommentReactor =
  | { type: "user"; userId: string; displayName: string }
  | { type: "anonymous"; anonymousId: string; displayName: string };

export function isCommentReactionEmoji(
  emoji: string,
): emoji is CommentReactionEmoji {
  return COMMENT_REACTION_EMOJIS.includes(emoji as CommentReactionEmoji);
}

export async function getCommentsWithNames(
  db: Database,
  videoId: string,
  reactor?: CommentReactor,
): Promise<Comment[]> {
  const allComments = await db
    .select({
      id: comments.id,
      videoId: comments.videoId,
      authorType: comments.authorType,
      authorUserId: comments.authorUserId,
      authorDisplayName: comments.authorDisplayName,
      timestamp: comments.timestamp,
      text: comments.text,
      parentId: comments.parentId,
      isResolved: comments.isResolved,
      resolvedBy: comments.resolvedBy,
      resolvedAt: comments.resolvedAt,
      resolvedReason: comments.resolvedReason,
      annotation: comments.annotation,
      urgency: comments.urgency,
      phase: comments.phase,
      textRange: comments.textRange,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(eq(comments.videoId, videoId))
    .orderBy(asc(comments.timestamp), asc(comments.createdAt));

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
    userMap = Object.fromEntries(
      usersResult.map((u) => [u.id, u.displayName]),
    );
  }

  return addReactionSummaries(
    db,
    allComments.map((c) => ({
      ...c,
      annotation: c.annotation ? JSON.parse(c.annotation) : null,
      textRange: c.textRange ? JSON.parse(c.textRange) : null,
      displayName:
        c.authorType === "user" && c.authorUserId
          ? userMap[c.authorUserId] || "Unknown"
          : c.authorDisplayName || "Anonymous",
    })),
    reactor,
  );
}

export async function addReactionSummaries<T extends { id: string }>(
  db: Database,
  commentRows: T[],
  reactor?: CommentReactor,
): Promise<Array<T & { reactions: CommentReactionSummary[] }>> {
  if (commentRows.length === 0) return [];

  const summariesByComment = await getReactionSummaries(
    db,
    commentRows.map((comment) => comment.id),
    reactor,
  );

  return commentRows.map((comment) => ({
    ...comment,
    reactions: summariesByComment[comment.id] ?? [],
  }));
}

export async function getReactionSummaries(
  db: Database,
  commentIds: string[],
  reactor?: CommentReactor,
): Promise<Record<string, CommentReactionSummary[]>> {
  if (commentIds.length === 0) return {};

  const rows = await db
    .select({
      commentId: commentReactions.commentId,
      emoji: commentReactions.emoji,
      reactorUserId: commentReactions.reactorUserId,
      anonymousReactorId: commentReactions.anonymousReactorId,
    })
    .from(commentReactions)
    .where(inArray(commentReactions.commentId, commentIds));

  const counts = new Map<string, number>();
  const mine = new Set<string>();

  for (const row of rows) {
    if (!isCommentReactionEmoji(row.emoji)) continue;
    const key = `${row.commentId}:${row.emoji}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);

    const reactedByMe =
      reactor?.type === "user"
        ? row.reactorUserId === reactor.userId
        : reactor?.type === "anonymous"
          ? row.anonymousReactorId === reactor.anonymousId
          : false;
    if (reactedByMe) mine.add(key);
  }

  const summaries: Record<string, CommentReactionSummary[]> = {};
  for (const commentId of commentIds) {
    summaries[commentId] = COMMENT_REACTION_EMOJIS.flatMap((emoji) => {
      const key = `${commentId}:${emoji}`;
      const count = counts.get(key) ?? 0;
      const reactedByMe = mine.has(key);
      if (count === 0 && !reactedByMe) return [];
      return [{ emoji, count, reactedByMe }];
    });
  }

  return summaries;
}

export async function toggleCommentReaction(
  db: Database,
  commentId: string,
  emoji: CommentReactionEmoji,
  reactor: CommentReactor,
): Promise<CommentReactionSummary[]> {
  const conditions = [
    eq(commentReactions.commentId, commentId),
    eq(commentReactions.emoji, emoji),
  ];

  if (reactor.type === "user") {
    conditions.push(eq(commentReactions.reactorUserId, reactor.userId));
  } else {
    conditions.push(eq(commentReactions.anonymousReactorId, reactor.anonymousId));
  }

  const existing = await db
    .select({ id: commentReactions.id })
    .from(commentReactions)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(commentReactions)
      .where(eq(commentReactions.id, existing[0].id));
  } else {
    try {
      await db.insert(commentReactions).values({
        id: crypto.randomUUID(),
        commentId,
        emoji,
        reactorType: reactor.type,
        reactorUserId: reactor.type === "user" ? reactor.userId : null,
        anonymousReactorId:
          reactor.type === "anonymous" ? reactor.anonymousId : null,
        reactorDisplayName: reactor.displayName,
      });
    } catch (err) {
      const duplicate = await db
        .select({ id: commentReactions.id })
        .from(commentReactions)
        .where(and(...conditions))
        .limit(1);
      if (duplicate.length === 0) throw err;
      await db
        .delete(commentReactions)
        .where(eq(commentReactions.id, duplicate[0].id));
    }
  }

  const summariesByComment = await getReactionSummaries(db, [commentId], reactor);
  return summariesByComment[commentId] ?? [];
}
