import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { videos, shareLinks, comments, folders, spaceMembers } from "../../../../db/schema";
import { and, desc, eq, count } from "drizzle-orm";
import { deleteVideo as deleteStreamVideo } from "../../../../lib/stream";
import { videoUpdateSchema } from "../../../../lib/validation";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { getApprovalStatus } from "../../../../lib/approvals";
import { logProjectActivity } from "../../../../lib/activity";

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

export const PATCH: APIRoute = async ({ params, locals, request }) => {
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

  // Verify video exists and user has space access
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

  const patchRole = await verifySpaceAccess(db, locals.user.id, videoResult[0].spaceId);
  if (!patchRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = videoUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetDateOnly =
    parsed.data.targetDate !== undefined &&
    parsed.data.title === undefined &&
    parsed.data.description === undefined &&
    parsed.data.folderId === undefined;

  // Published videos stay locked, but launch-date scheduling remains editable.
  if (videoResult[0].phase === "published" && !targetDateOnly) {
    return new Response(JSON.stringify({ error: "Cannot edit published videos" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates: { title?: string; description?: string; targetDate?: string | null } = {};
  let folderUpdate: string | null | undefined;

  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description.trim();
  if (parsed.data.targetDate !== undefined) updates.targetDate = parsed.data.targetDate;
  if (parsed.data.folderId !== undefined) {
    const folderId = parsed.data.folderId ?? null;

    if (folderId) {
      const folder = await db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.spaceId, videoResult[0].spaceId)))
        .limit(1);

      if (folder.length === 0) {
        return new Response(JSON.stringify({ error: "Folder not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    folderUpdate = folderId;
  }

  if (Object.keys(updates).length === 0 && folderUpdate === undefined) {
    return new Response(JSON.stringify({ error: "No updates provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();

  if (Object.keys(updates).length > 0) {
    await db
      .update(videos)
      .set({ ...updates, updatedAt: now })
      .where(eq(videos.id, id));

    if (parsed.data.targetDate !== undefined && parsed.data.targetDate !== videoResult[0].targetDate) {
      await logProjectActivity(db, {
        videoId: id,
        actorUserId: locals.user.id,
        actorDisplayName: locals.user.displayName,
        type: "target_date.changed",
        data: { from: videoResult[0].targetDate, to: parsed.data.targetDate },
        createdAt: now,
      });
    }
  }

  if (folderUpdate !== undefined) {
    const versionGroupId = videoResult[0].versionGroupId || videoResult[0].id;
    await db
      .update(videos)
      .set({ folderId: folderUpdate, updatedAt: now })
      .where(and(eq(videos.spaceId, videoResult[0].spaceId), eq(videos.versionGroupId, versionGroupId)));
  }

  const updated = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  return new Response(JSON.stringify({ video: updated[0] }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
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

  // Verify video exists and user has access via space membership
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

  // Delete requires: space owner, OR the original uploader
  const deleteRole = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!deleteRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (deleteRole !== "owner" && video.uploadedBy !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Best-effort delete from Cloudflare Stream. Don't block DB cleanup if it fails.
  if (video.streamVideoId) {
    try {
      await deleteStreamVideo(
        env.STREAM_ACCOUNT_ID,
        env.STREAM_API_TOKEN,
        video.streamVideoId,
      );
    } catch (err) {
      console.error("Failed to delete video from Cloudflare Stream:", err);
    }
  }

  const versionGroupId = video.versionGroupId || video.id;
  const remainingVersions = await db
    .select({ id: videos.id, versionNumber: videos.versionNumber })
    .from(videos)
    .where(and(eq(videos.spaceId, video.spaceId), eq(videos.versionGroupId, versionGroupId)))
    .orderBy(desc(videos.versionNumber));

  const replacement = remainingVersions.find((version) => version.id !== id) || null;

  // Delete the video row. share_links and comments cascade via FK constraints.
  await db.delete(videos).where(eq(videos.id, id));

  if (video.isCurrentVersion && replacement) {
    await db
      .update(videos)
      .set({ isCurrentVersion: true, updatedAt: new Date().toISOString() })
      .where(eq(videos.id, replacement.id));
  }

  return new Response(JSON.stringify({ success: true, redirectVideoId: replacement?.id || null }), {
    headers: { "Content-Type": "application/json" },
  });
};
