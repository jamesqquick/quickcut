import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db";
import {
  approvalRequests,
  comments,
  notifications,
  projects,
  spaceMembers,
  spaces,
  users,
  videos,
} from "../db/schema";
import { broadcastNotification } from "./broadcast";
import { buildApprovalRequestEmail, buildCommentNotificationEmail } from "./email";
import { getNotificationCopy, type NotificationType } from "./notification-copy";

export type { NotificationType, NotificationCopy } from "./notification-copy";
export { getNotificationCopy } from "./notification-copy";

export interface CommentNotificationInput {
  commentId: string;
  videoId: string;
  actorUserId: string | null;
  actorDisplayName: string;
  text: string;
  parentCommentId: string | null;
  phase: "script" | "review";
}

export interface EmailConfig {
  send: (msg: { to: string; from: string; subject: string; text: string; html: string }) => Promise<void>;
  from: string;
  baseUrl: string;
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
  emailConfig?: EmailConfig,
  realtimeEnv?: Env,
  ctx?: ExecutionContext,
): Promise<void> {
  const videoRows = await db
    .select({
      id: videos.id,
      title: projects.title,
      uploadedBy: videos.uploadedBy,
      spaceId: videos.spaceId,
      spaceOwnerId: spaces.ownerId,
    })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
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
  const copy = getNotificationCopy(type, input.actorDisplayName, video.title);
  const body = snippet(input.text);

  const rows = recipientIds.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    type,
    videoId: video.id,
    commentId: input.commentId,
    parentCommentId: input.parentCommentId,
    spaceId: video.spaceId,
    title: copy.title,
    body,
    href,
  }));

  await db.insert(notifications).values(rows);

  const fanOut = async () => {
    if (realtimeEnv) {
      const createdAt = new Date().toISOString();
      const broadcastResults = await Promise.allSettled(
        rows.map((row) =>
          broadcastNotification(realtimeEnv, row.userId, {
            kind: "notification",
            id: row.id,
            type: row.type,
            title: row.title,
            href: row.href,
            createdAt,
          }),
        ),
      );
      const broadcastFailures = broadcastResults.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (broadcastFailures.length > 0) {
        console.error(
          `${broadcastFailures.length}/${broadcastResults.length} notification broadcasts failed`,
          broadcastFailures.map((f) => f.reason),
        );
      }
    }

    if (!emailConfig) return;

    try {
      const emailRecipients = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            inArray(users.id, recipientIds),
            eq(users.emailNotificationsEnabled, true),
          ),
        );

      if (emailRecipients.length === 0) return;

      const emailContent = buildCommentNotificationEmail({
        type,
        actorDisplayName: input.actorDisplayName,
        videoTitle: video.title,
        commentSnippet: body,
        href,
        baseUrl: emailConfig.baseUrl,
      });

      const results = await Promise.allSettled(
        emailRecipients.map((recipient) =>
          emailConfig.send({
            to: recipient.email,
            from: emailConfig.from,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
          }),
        ),
      );

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failures.length > 0) {
        console.error(
          `${failures.length}/${results.length} notification emails failed`,
          failures.map((f) => f.reason),
        );
      }
    } catch (error) {
      console.error("Failed to send comment notification emails", error);
    }
  };

  if (ctx) {
    ctx.waitUntil(fanOut());
  } else {
    await fanOut();
  }
}

export interface TargetedApprovalRequestInput {
  videoId: string;
  /** User ids the approval is being requested from. Already validated as space members. */
  requestedUserIds: string[];
  actorUserId: string | null;
  actorDisplayName: string;
}

/**
 * Notify the specific users an uploader/owner has requested approval from.
 * One notification row per recipient with personalized copy, and an email
 * to recipients who have `users.emailNotificationsEnabled = true`.
 */
export async function createTargetedApprovalRequestNotifications(
  db: Database,
  input: TargetedApprovalRequestInput,
  emailConfig?: EmailConfig,
  realtimeEnv?: Env,
  ctx?: ExecutionContext,
): Promise<void> {
  if (input.requestedUserIds.length === 0) return;

  const videoRows = await db
    .select({
      id: videos.id,
      title: projects.title,
      spaceId: videos.spaceId,
    })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(eq(videos.id, input.videoId))
    .limit(1);

  const video = videoRows[0];
  if (!video) return;

  const recipientIds = [...new Set(input.requestedUserIds.filter(Boolean))];
  if (recipientIds.length === 0) return;

  const copy = getNotificationCopy(
    "approval.requested",
    input.actorDisplayName,
    video.title,
  );
  const href = `/videos/${video.id}?tab=video`;

  const rows = recipientIds.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    type: "approval.requested" as const,
    videoId: video.id,
    commentId: null,
    parentCommentId: null,
    spaceId: video.spaceId,
    title: copy.title,
    body: null,
    href,
  }));

  await db.insert(notifications).values(rows);

  const fanOut = async () => {
    if (realtimeEnv) {
      const createdAt = new Date().toISOString();
      const broadcastResults = await Promise.allSettled(
        rows.map((row) =>
          broadcastNotification(realtimeEnv, row.userId, {
            kind: "notification",
            id: row.id,
            type: row.type,
            title: row.title,
            href: row.href,
            createdAt,
          }),
        ),
      );
      const broadcastFailures = broadcastResults.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (broadcastFailures.length > 0) {
        console.error(
          `${broadcastFailures.length}/${broadcastResults.length} approval-request broadcasts failed`,
          broadcastFailures.map((f) => f.reason),
        );
      }
    }

    if (!emailConfig) return;

    try {
      const emailRecipients = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            inArray(users.id, recipientIds),
            eq(users.emailNotificationsEnabled, true),
          ),
        );

      if (emailRecipients.length === 0) return;

      const emailContent = buildApprovalRequestEmail({
        actorDisplayName: input.actorDisplayName,
        videoTitle: video.title,
        href,
        baseUrl: emailConfig.baseUrl,
      });

      const results = await Promise.allSettled(
        emailRecipients.map((recipient) =>
          emailConfig.send({
            to: recipient.email,
            from: emailConfig.from,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
          }),
        ),
      );

      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (failures.length > 0) {
        console.error(
          `${failures.length}/${results.length} approval-request emails failed`,
          failures.map((f) => f.reason),
        );
      }
    } catch (error) {
      console.error("Failed to send approval-request emails", error);
    }
  };

  if (ctx) {
    ctx.waitUntil(fanOut());
  } else {
    await fanOut();
  }
}

export interface PendingApprovalRequestForUser {
  id: string;
  videoId: string;
  videoTitle: string;
  spaceId: string;
  spaceName: string;
  requesterDisplayName: string;
  createdAt: string;
}

/** Approval requests still pending for the given user (the requested approver). */
export async function getPendingApprovalRequestsForUser(
  db: Database,
  userId: string,
): Promise<PendingApprovalRequestForUser[]> {
  return db
    .select({
      id: approvalRequests.id,
      videoId: approvalRequests.videoId,
      videoTitle: projects.title,
      spaceId: approvalRequests.spaceId,
      spaceName: spaces.name,
      requesterDisplayName: approvalRequests.requesterDisplayName,
      createdAt: approvalRequests.createdAt,
    })
    .from(approvalRequests)
    .innerJoin(videos, eq(approvalRequests.videoId, videos.id))
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .innerJoin(spaces, eq(approvalRequests.spaceId, spaces.id))
    .where(
      and(
        eq(approvalRequests.requestedUserId, userId),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt));
}

/** Flip every pending approval_request from this user on this video to resolved. */
export async function resolveApprovalRequestsForApprover(
  db: Database,
  videoId: string,
  userId: string,
): Promise<void> {
  await db
    .update(approvalRequests)
    .set({ status: "resolved", resolvedAt: new Date().toISOString() })
    .where(
      and(
        eq(approvalRequests.videoId, videoId),
        eq(approvalRequests.requestedUserId, userId),
        eq(approvalRequests.status, "pending"),
      ),
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

export type VideoNotificationTab = "video" | "script";

const TAB_NOTIFICATION_TYPES: Record<VideoNotificationTab, NotificationType[]> = {
  video: ["comment.created", "comment.reply", "approval.requested"],
  script: ["script_comment.created", "script_comment.reply"],
};

/**
 * Bulk mark all of a user's unread notifications for a given video+tab as
 * read. Returns the ids of rows that were transitioned from unread to read,
 * so callers can broadcast that subset to other open tabs/devices.
 *
 * Caller is responsible for checking access to the video (via
 * `verifySpaceAccess` on the video's space) before invoking this helper.
 */
export async function markNotificationsReadByVideoTab(
  db: Database,
  userId: string,
  videoId: string,
  tab: VideoNotificationTab,
): Promise<string[]> {
  const types = TAB_NOTIFICATION_TYPES[tab];

  const unreadRows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.videoId, videoId),
        inArray(notifications.type, types),
        isNull(notifications.readAt),
      ),
    );

  const ids = unreadRows.map((row) => row.id);
  if (ids.length === 0) return [];

  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
      ),
    );

  return ids;
}
