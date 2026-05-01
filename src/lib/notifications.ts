import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db";
import { comments, notifications, spaceMembers, spaces, videos } from "../db/schema";

export type NotificationType =
  | "comment.created"
  | "comment.reply"
  | "script_comment.created"
  | "script_comment.reply";

export interface CommentNotificationInput {
  commentId: string;
  videoId: string;
  actorUserId: string | null;
  actorDisplayName: string;
  text: string;
  parentCommentId: string | null;
  phase: "script" | "review";
}

export interface UserNotification {
  id: string;
  actorDisplayName: string;
  type: NotificationType;
  videoId: string;
  commentId: string;
  parentCommentId: string | null;
  spaceId: string;
  title: string;
  body: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
}

function snippet(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function getNotificationType(input: CommentNotificationInput): NotificationType {
  if (input.phase === "script") {
    return input.parentCommentId ? "script_comment.reply" : "script_comment.created";
  }

  return input.parentCommentId ? "comment.reply" : "comment.created";
}

function getTitle(type: NotificationType, actorName: string, videoTitle: string): string {
  if (type === "script_comment.created") return `${actorName} left script feedback on "${videoTitle}"`;
  if (type === "script_comment.reply") return `${actorName} replied to your script comment on "${videoTitle}"`;
  if (type === "comment.reply") return `${actorName} replied to your comment on "${videoTitle}"`;
  return `${actorName} commented on "${videoTitle}"`;
}

async function filterRecipientsWithSpaceAccess(
  db: Database,
  recipientIds: string[],
  spaceId: string,
): Promise<string[]> {
  const uniqueRecipientIds = [...new Set(recipientIds.filter(Boolean))];
  if (uniqueRecipientIds.length === 0) return [];

  const rows = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(
      and(
        eq(spaceMembers.spaceId, spaceId),
        inArray(spaceMembers.userId, uniqueRecipientIds),
      ),
    );

  return rows.map((row) => row.userId);
}

export async function createCommentNotifications(
  db: Database,
  input: CommentNotificationInput,
): Promise<void> {
  const videoRows = await db
    .select({
      id: videos.id,
      title: videos.title,
      uploadedBy: videos.uploadedBy,
      spaceId: videos.spaceId,
      spaceOwnerId: spaces.ownerId,
    })
    .from(videos)
    .innerJoin(spaces, eq(videos.spaceId, spaces.id))
    .where(eq(videos.id, input.videoId))
    .limit(1);

  const video = videoRows[0];
  if (!video) return;

  let candidateRecipientIds: string[] = [];
  if (input.parentCommentId) {
    const parentRows = await db
      .select({ authorUserId: comments.authorUserId })
      .from(comments)
      .where(eq(comments.id, input.parentCommentId))
      .limit(1);
    const parentAuthorId = parentRows[0]?.authorUserId;
    if (parentAuthorId) candidateRecipientIds = [parentAuthorId];
  } else {
    candidateRecipientIds = [video.uploadedBy, video.spaceOwnerId].filter(
      (id): id is string => Boolean(id),
    );
  }

  const recipientIds = await filterRecipientsWithSpaceAccess(
    db,
    candidateRecipientIds.filter((id) => id !== input.actorUserId),
    video.spaceId,
  );

  if (recipientIds.length === 0) return;

  const type = getNotificationType(input);
  const href = `/videos/${video.id}?tab=${input.phase === "script" ? "script" : "video"}&comment=${input.commentId}`;
  const title = getTitle(type, input.actorDisplayName, video.title);
  const body = snippet(input.text);

  await db.insert(notifications).values(
    recipientIds.map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      actorUserId: input.actorUserId,
      actorDisplayName: input.actorDisplayName,
      type,
      videoId: video.id,
      commentId: input.commentId,
      parentCommentId: input.parentCommentId,
      spaceId: video.spaceId,
      title,
      body,
      href,
    })),
  );
}

export async function getNotificationsForUser(
  db: Database,
  userId: string,
): Promise<UserNotification[]> {
  return db
    .select({
      id: notifications.id,
      actorDisplayName: notifications.actorDisplayName,
      type: notifications.type,
      videoId: notifications.videoId,
      commentId: notifications.commentId,
      parentCommentId: notifications.parentCommentId,
      spaceId: notifications.spaceId,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt));
}

export async function getUnreadNotificationCount(
  db: Database,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return rows.length;
}

export async function markNotificationRead(
  db: Database,
  notificationId: string,
  userId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: notifications.id, readAt: notifications.readAt })
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .limit(1);

  if (existing.length === 0) return false;
  if (!existing[0].readAt) {
    await db
      .update(notifications)
      .set({ readAt: new Date().toISOString() })
      .where(eq(notifications.id, notificationId));
  }

  return true;
}
