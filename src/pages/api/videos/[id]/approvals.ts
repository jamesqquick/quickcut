import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { videos } from "../../../../db/schema";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { getApprovalStatus } from "../../../../lib/approvals";

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * GET /api/videos/[id]/approvals
 *
 * Returns the full computed approval status for a video: the threshold
 * configured on the space, how many approvals have been recorded, whether
 * the threshold is met, and the list of approving users. Requires that
 * the caller is a member of the video's space.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const db = createDb(env.DB);

  const videoResult = await db
    .select({ spaceId: videos.spaceId })
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  const role = await verifySpaceAccess(
    db,
    locals.user.id,
    videoResult[0].spaceId,
  );
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  const status = await getApprovalStatus(db, id, videoResult[0].spaceId);

  return new Response(JSON.stringify({ approvalStatus: status }), {
    headers: jsonHeaders,
  });
};
