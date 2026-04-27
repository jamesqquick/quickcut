import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { approvals, spaces, videos } from "../../../../db/schema";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { getApprovalStatus } from "../../../../lib/approvals";
import { approveVideoSchema } from "../../../../lib/validation";
import { broadcastApprovalUpdate } from "../../../../lib/broadcast";

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * POST /api/videos/[id]/approve
 *
 * Record an approval for the given video on behalf of the authenticated
 * user. Approval state itself is never stored on the video row — it is
 * always recomputed from the rows in the `approvals` table compared to the
 * space's `requiredApprovals` setting.
 *
 * Rules enforced here (mirroring docs/teams-feature.md):
 *   - User must be a member of the video's space.
 *   - The space must have `requiredApprovals > 0`. Otherwise the approval
 *     workflow is disabled for this space and we reject with 403.
 *   - The uploader of a video can never approve their own video.
 *   - Each user can approve a given video at most once. The DB also has a
 *     unique index on (video_id, user_id) as a backstop.
 */
export const POST: APIRoute = async ({ params, locals, request }) => {
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
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  const video = videoResult[0];

  const role = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  // Approval workflow must be enabled on this space.
  const spaceRow = await db
    .select({ requiredApprovals: spaces.requiredApprovals })
    .from(spaces)
    .where(eq(spaces.id, video.spaceId))
    .limit(1);

  if (!spaceRow[0] || spaceRow[0].requiredApprovals <= 0) {
    return new Response(
      JSON.stringify({ error: "Approval workflow is not enabled for this space" }),
      { status: 403, headers: jsonHeaders },
    );
  }

  // Uploader can never approve their own video.
  if (video.uploadedBy === locals.user.id) {
    return new Response(
      JSON.stringify({ error: "You cannot approve your own video" }),
      { status: 403, headers: jsonHeaders },
    );
  }

  // Parse the (optional) approval comment.
  let payload: unknown = {};
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const parsed = approveVideoSchema.safeParse(payload);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  // Reject if this user has already approved this video.
  const existing = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(eq(approvals.videoId, id), eq(approvals.userId, locals.user.id)),
    )
    .limit(1);

  if (existing.length > 0) {
    return new Response(
      JSON.stringify({ error: "You have already approved this video" }),
      { status: 409, headers: jsonHeaders },
    );
  }

  const now = new Date().toISOString();
  const commentValue = parsed.data.comment?.trim() || null;

  try {
    await db.insert(approvals).values({
      id: nanoid(),
      videoId: id,
      userId: locals.user.id,
      comment: commentValue,
      createdAt: now,
    });
  } catch (err) {
    // Likely a race against the unique index. Surface as 409.
    console.error("Failed to insert approval:", err);
    return new Response(
      JSON.stringify({ error: "Could not record approval" }),
      { status: 409, headers: jsonHeaders },
    );
  }

  const status = await getApprovalStatus(db, id, video.spaceId);

  // Best-effort fan-out to anyone watching the video right now.
  await broadcastApprovalUpdate(env, id, status);

  return new Response(JSON.stringify({ approvalStatus: status }), {
    status: 201,
    headers: jsonHeaders,
  });
};

/**
 * DELETE /api/videos/[id]/approve
 *
 * Remove the authenticated user's approval row for this video. Only the
 * user who recorded the approval can remove it. Returns the updated
 * approval status. Idempotent: deleting a non-existent approval returns
 * 404 so callers can distinguish state.
 */
export const DELETE: APIRoute = async ({ params, locals }) => {
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
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  const video = videoResult[0];

  const role = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  const existing = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(eq(approvals.videoId, id), eq(approvals.userId, locals.user.id)),
    )
    .limit(1);

  if (existing.length === 0) {
    return new Response(
      JSON.stringify({ error: "No approval to remove" }),
      { status: 404, headers: jsonHeaders },
    );
  }

  await db
    .delete(approvals)
    .where(
      and(eq(approvals.videoId, id), eq(approvals.userId, locals.user.id)),
    );

  const status = await getApprovalStatus(db, id, video.spaceId);

  await broadcastApprovalUpdate(env, id, status);

  return new Response(JSON.stringify({ approvalStatus: status }), {
    headers: jsonHeaders,
  });
};
