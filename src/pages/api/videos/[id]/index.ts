import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks, comments, videos } from "../../../../db/schema";
import { eq, count } from "drizzle-orm";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { getApprovalStatus } from "../../../../lib/approvals";
import { getMergedVideoById } from "../../../../lib/projects";

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

  const video = await getMergedVideoById(db, id);
  if (!video) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const role = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shareLinkResult = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.videoId, id))
    .limit(1);

  const commentCountResult = await db
    .select({ count: count() })
    .from(comments)
    .where(eq(comments.videoId, id));

  const projectId = video.projectId;
  const versionCountResult = await db
    .select({ count: count() })
    .from(videos)
    .where(eq(videos.projectId, projectId));

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
