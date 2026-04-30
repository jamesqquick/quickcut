import { eq, asc } from "drizzle-orm";
import { approvals, spaces, users } from "../db/schema";
import type { Database } from "../db";

export interface ApprovalRecord {
  id: string;
  userId: string;
  name: string;
  comment: string | null;
  createdAt: string;
}

export interface ApprovalStatus {
  requiredApprovals: number;
  currentApprovals: number;
  isApproved: boolean;
  approvals: ApprovalRecord[];
}

/**
 * Compute a video's approval state on demand. There is no stored review
 * status on the video — the state is always derived from the count of rows
 * in the `approvals` table compared against the space's `requiredApprovals`
 * threshold. This is the single source of truth for whether a video is
 * "approved" and is used by API responses, the video detail UI, dashboard
 * badges, and the share-link view.
 *
 * Note: when `requiredApprovals` is 0 the workflow is disabled. We still
 * return the (possibly stale) approval rows in case the threshold was
 * lowered to 0 after approvals were recorded, but `isApproved` will be
 * false.
 */
export async function getApprovalStatus(
  db: Database,
  videoId: string,
  spaceId: string,
): Promise<ApprovalStatus> {
  const spaceRow = await db
    .select({ requiredApprovals: spaces.requiredApprovals })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);

  const requiredApprovals = spaceRow[0]?.requiredApprovals ?? 0;

  const rows = await db
    .select({
      id: approvals.id,
      userId: approvals.userId,
      name: users.name,
      comment: approvals.comment,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .innerJoin(users, eq(approvals.userId, users.id))
    .where(eq(approvals.videoId, videoId))
    .orderBy(asc(approvals.createdAt));

  const currentApprovals = rows.length;
  const isApproved =
    requiredApprovals > 0 && currentApprovals >= requiredApprovals;

  return {
    requiredApprovals,
    currentApprovals,
    isApproved,
    approvals: rows,
  };
}
