import { eq, asc } from "drizzle-orm";
import { comments, users } from "../db/schema";
import type { Database } from "../db";
import type { Comment } from "../types";

export async function getCommentsWithNames(
  db: Database,
  videoId: string,
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
      annotation: comments.annotation,
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

  return allComments.map((c) => ({
    ...c,
    annotation: c.annotation ? JSON.parse(c.annotation) : null,
    displayName:
      c.authorType === "user" && c.authorUserId
        ? userMap[c.authorUserId] || "Unknown"
        : c.authorDisplayName || "Anonymous",
  }));
}
