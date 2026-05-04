import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { videos, shareLinks, comments } from "../../../../db/schema";
import { and, eq, count } from "drizzle-orm";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { getApprovalStatus } from "../../../../lib/approvals";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const videoResult = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const video = videoResult[0];

  // Verify the user is a member of the video's space
  const role = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get share link
  const shareLinkResult = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.videoId, id))
    .limit(1);

  // Get comment count
  const commentCountResult = await db
    .select({ count: count() })
    .from(comments)
    .where(eq(comments.videoId, id));

  const versionGroupId = video.versionGroupId || video.id;
  const versionCountResult = await db
    .select({ count: count() })
    .from(videos)
    .where(and(eq(videos.spaceId, video.spaceId), eq(videos.versionGroupId, versionGroupId)));

  // Approval state is computed on demand from the approvals table compared
  // against the space's required threshold. Only attached when the
  // workflow is actually enabled for this space (requiredApprovals > 0).
  const approvalStatus = await getApprovalStatus(db, id, video.spaceId);
  const includeApprovalStatus = approvalStatus.requiredApprovals > 0;

  return new Response(
    JSON.stringify({
      video,
      shareLink: shareLinkResult[0] || null,
      commentCount: commentCountResult[0]?.count || 0,
      versionCount: versionCountResult[0]?.count || 1,
      approvalStatus: includeApprovalStatus ? approvalStatus : null,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
