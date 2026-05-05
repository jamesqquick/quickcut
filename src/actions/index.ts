import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { eq, and, count, desc, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createDb } from "../db";
import {
  users,
  videos,
  folders,
  spaces,
  spaceMembers,
  spaceInvites,
  approvals,
  approvalRequests,
  comments,
  scripts,
  transcripts,
} from "../db/schema";
import {
  videoUpdateSchema,
  phaseSchema,
  approveVideoSchema,
  commentSchema,
  spaceUpdateSchema,
  inviteCreateSchema,
  folderCreateSchema,
  folderUpdateSchema,
  projectCreateSchema,
  uploadSchema,
} from "../lib/validation";
import { verifySpaceAccess, getDefaultSpaceForUser } from "../lib/spaces";
import { getApprovalStatus } from "../lib/approvals";
import { createDirectUpload, deleteVideo as deleteStreamVideo } from "../lib/stream";
import { isTranscriptGenerationEnabled } from "../lib/flags";
import { queueTranscriptForVideo } from "../lib/transcripts";
import { logProjectActivity } from "../lib/activity";
import {
  broadcastPhaseChange,
  broadcastApprovalUpdate,
  broadcastNewComment,
  broadcastCommentReactions,
  broadcastNotification,
} from "../lib/broadcast";
import {
  isCommentReactionEmoji,
  toggleCommentReaction,
} from "../lib/comments";
import {
  createCommentNotifications,
  createTargetedApprovalRequestNotifications,
  resolveApprovalRequestsForApprover,
} from "../lib/notifications";
import { buildInviteAuthPath, buildInviteEmail } from "../lib/email";

// Re-export ActionError for convenience
export { ActionError } from "astro:actions";

const UPLOAD_ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];
const UPLOAD_MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

function validateUploadFile(fileName: string, fileSize: number) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || !UPLOAD_ALLOWED_EXTENSIONS.includes(ext)) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Unsupported file type. Please upload MP4, MOV, WebM, AVI, or MKV.",
    });
  }
  if (fileSize > UPLOAD_MAX_FILE_SIZE) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "File exceeds the 5GB limit.",
    });
  }
}

/**
 * Helper to require authentication in an action handler.
 * Throws ActionError with UNAUTHORIZED code if user is not logged in.
 */
function requireUser(context: { locals: App.Locals }) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }
  return user;
}

export const server = {
  setEmailPreference: defineAction({
    input: z.object({
      enabled: z.boolean(),
    }),
    handler: async ({ enabled }, context) => {
      const user = requireUser(context);
      const db = createDb(env.DB);

      await db
        .update(users)
        .set({ emailNotificationsEnabled: enabled })
        .where(eq(users.id, user.id));

      return { emailNotificationsEnabled: enabled };
    },
  }),

  video: {
    update: defineAction({
      input: z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        targetDate: z.string().date().nullable().optional(),
        folderId: z.string().uuid().nullable().optional(),
        targetAudience: z.string().max(200).nullable().optional(),
        hook: z.string().max(500).nullable().optional(),
        takeaway1: z.string().max(200).nullable().optional(),
        takeaway2: z.string().max(200).nullable().optional(),
        takeaway3: z.string().max(200).nullable().optional(),
        primaryCta: z.string().max(200).nullable().optional(),
        outro: z.string().max(500).nullable().optional(),
      }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const { id } = input;
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const video = videoResult[0];
        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const targetDateOnly =
          input.targetDate !== undefined &&
          input.title === undefined &&
          input.description === undefined &&
          input.folderId === undefined &&
          input.targetAudience === undefined &&
          input.hook === undefined &&
          input.takeaway1 === undefined &&
          input.takeaway2 === undefined &&
          input.takeaway3 === undefined &&
          input.primaryCta === undefined &&
          input.outro === undefined;

        if (video.phase === "published" && !targetDateOnly) {
          throw new ActionError({ code: "FORBIDDEN", message: "Cannot edit published videos" });
        }

        const updates: {
          title?: string;
          description?: string;
          targetDate?: string | null;
          targetAudience?: string | null;
          hook?: string | null;
          takeaway1?: string | null;
          takeaway2?: string | null;
          takeaway3?: string | null;
          primaryCta?: string | null;
          outro?: string | null;
        } = {};
        let folderUpdate: string | null | undefined;

        const normalizeMetadata = (value: string | null | undefined) => {
          if (value === undefined) return undefined;
          if (value === null) return null;
          const trimmed = value.trim();
          return trimmed.length === 0 ? null : trimmed;
        };

        if (input.title !== undefined) updates.title = input.title.trim();
        if (input.description !== undefined) updates.description = input.description.trim();
        if (input.targetDate !== undefined) updates.targetDate = input.targetDate;
        const audience = normalizeMetadata(input.targetAudience);
        if (audience !== undefined) updates.targetAudience = audience;
        const hookValue = normalizeMetadata(input.hook);
        if (hookValue !== undefined) updates.hook = hookValue;
        const t1 = normalizeMetadata(input.takeaway1);
        if (t1 !== undefined) updates.takeaway1 = t1;
        const t2 = normalizeMetadata(input.takeaway2);
        if (t2 !== undefined) updates.takeaway2 = t2;
        const t3 = normalizeMetadata(input.takeaway3);
        if (t3 !== undefined) updates.takeaway3 = t3;
        const cta = normalizeMetadata(input.primaryCta);
        if (cta !== undefined) updates.primaryCta = cta;
        const outroValue = normalizeMetadata(input.outro);
        if (outroValue !== undefined) updates.outro = outroValue;
        if (input.folderId !== undefined) {
          const folderId = input.folderId ?? null;
          if (folderId) {
            const folder = await db
              .select({ id: folders.id })
              .from(folders)
              .where(and(eq(folders.id, folderId), eq(folders.spaceId, video.spaceId)))
              .limit(1);
            if (folder.length === 0) {
              throw new ActionError({ code: "NOT_FOUND", message: "Folder not found" });
            }
          }
          folderUpdate = folderId;
        }

        if (Object.keys(updates).length === 0 && folderUpdate === undefined) {
          throw new ActionError({ code: "BAD_REQUEST", message: "No updates provided" });
        }

        const now = new Date().toISOString();

        if (Object.keys(updates).length > 0) {
          await db
            .update(videos)
            .set({ ...updates, updatedAt: now })
            .where(eq(videos.id, id));

          if (input.targetDate !== undefined && input.targetDate !== video.targetDate) {
            await logProjectActivity(db, {
              videoId: id,
              actorUserId: user.id,
              actorDisplayName: user.name,
              type: "target_date.changed",
              data: { from: video.targetDate, to: input.targetDate },
              createdAt: now,
            });
          }
        }

        if (folderUpdate !== undefined) {
          const versionGroupId = video.versionGroupId || video.id;
          await db
            .update(videos)
            .set({ folderId: folderUpdate, updatedAt: now })
            .where(and(eq(videos.spaceId, video.spaceId), eq(videos.versionGroupId, versionGroupId)));
        }

        const updated = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        return { video: updated[0] };
      },
    }),

    delete: defineAction({
      input: z.object({
        id: z.string().min(1),
      }),
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const video = videoResult[0];
        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }
        if (role !== "owner" && video.uploadedBy !== user.id) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const versionGroupId = video.versionGroupId || video.id;
        const projectVersions = await db
          .select({ id: videos.id, streamVideoId: videos.streamVideoId })
          .from(videos)
          .where(and(eq(videos.spaceId, video.spaceId), eq(videos.versionGroupId, versionGroupId)));

        for (const version of projectVersions) {
          if (!version.streamVideoId) continue;
          try {
            await deleteStreamVideo(
              env.STREAM_ACCOUNT_ID,
              env.STREAM_API_TOKEN,
              version.streamVideoId,
            );
          } catch (err) {
            console.error("Failed to delete video from Cloudflare Stream:", err);
          }
        }

        for (const version of projectVersions) {
          await db.delete(videos).where(eq(videos.id, version.id));
        }

        return { success: true, redirectVideoId: null };
      },
    }),

    setPhase: defineAction({
      input: z.object({
        id: z.string().min(1),
        phase: phaseSchema,
        override: z.boolean().optional(),
      }),
      handler: async ({ id, phase, override }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const video = videoResult[0];
        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (
          (phase === "published" || video.phase === "published") &&
          role !== "owner" &&
          video.uploadedBy !== user.id
        ) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Only the space owner or video uploader can publish or unpublish",
          });
        }

        // Server-side approval gate. Only enforced on transitions INTO
        // published — already-published videos can be unpublished freely,
        // and increasing requiredApprovals later does not retroactively
        // un-publish anything.
        let publishedWithOverride = false;
        let shortApprovalsBy = 0;
        if (phase === "published" && video.phase !== "published") {
          const status = await getApprovalStatus(db, id, video.spaceId);
          if (status.requiredApprovals > 0 && !status.isApproved) {
            if (override) {
              if (role !== "owner") {
                throw new ActionError({
                  code: "FORBIDDEN",
                  message: "Only the space owner can publish without full approvals",
                });
              }
              publishedWithOverride = true;
              shortApprovalsBy = Math.max(
                0,
                status.requiredApprovals - status.currentApprovals,
              );
            } else {
              throw new ActionError({
                code: "FORBIDDEN",
                message: "Required approvals not met",
              });
            }
          }
        }

        const now = new Date().toISOString();
        await db
          .update(videos)
          .set({ phase, updatedAt: now })
          .where(eq(videos.id, id));

        await logProjectActivity(db, {
          videoId: id,
          actorUserId: user.id,
          actorDisplayName: user.name,
          type: "phase.changed",
          data: { from: video.phase, to: phase },
          createdAt: now,
        });

        if (publishedWithOverride) {
          await logProjectActivity(db, {
            videoId: id,
            actorUserId: user.id,
            actorDisplayName: user.name,
            type: "phase.published_with_override",
            data: { shortApprovalsBy },
            createdAt: now,
          });
        }

        await broadcastPhaseChange(env, id, {
          videoId: id,
          phase,
          changedBy: user.name,
        });

        // NOTE: per issue #93 the generic fan-out of approval.requested
        // notifications to every space member has been removed. Approvals
        // are now requested explicitly via `video.requestApprovals`.

        const updated = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        return { video: updated[0] };
      },
    }),

    approve: defineAction({
      input: z.object({
        id: z.string().min(1),
        comment: z.string().max(500).optional(),
      }),
      handler: async ({ id, comment }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const video = videoResult[0];
        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const spaceRow = await db
          .select({ requiredApprovals: spaces.requiredApprovals })
          .from(spaces)
          .where(eq(spaces.id, video.spaceId))
          .limit(1);

        if (!spaceRow[0] || spaceRow[0].requiredApprovals <= 0) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Approval workflow is not enabled for this space",
          });
        }

        if (video.uploadedBy === user.id) {
          throw new ActionError({ code: "FORBIDDEN", message: "You cannot approve your own video" });
        }

        const existing = await db
          .select({ id: approvals.id })
          .from(approvals)
          .where(and(eq(approvals.videoId, id), eq(approvals.userId, user.id)))
          .limit(1);

        if (existing.length > 0) {
          throw new ActionError({ code: "CONFLICT", message: "You have already approved this video" });
        }

        const now = new Date().toISOString();
        const commentValue = comment?.trim() || null;

        try {
          await db.insert(approvals).values({
            id: nanoid(),
            videoId: id,
            userId: user.id,
            comment: commentValue,
            createdAt: now,
          });
        } catch (err) {
          console.error("Failed to insert approval:", err);
          throw new ActionError({ code: "CONFLICT", message: "Could not record approval" });
        }

        // Resolve any pending targeted approval requests for this approver,
        // so the "Pending for me" bucket clears once they approve. Best-effort.
        try {
          await resolveApprovalRequestsForApprover(db, id, user.id);
        } catch (err) {
          console.error("Failed to resolve approval requests on approve", err);
        }

        const status = await getApprovalStatus(db, id, video.spaceId);
        await broadcastApprovalUpdate(env, id, status);

        await logProjectActivity(db, {
          videoId: id,
          actorUserId: user.id,
          actorDisplayName: user.name,
          type: "approval.given",
          data: {
            approverUserId: user.id,
            approverDisplayName: user.name,
          },
          createdAt: now,
        });

        return { approvalStatus: status };
      },
    }),

    unapprove: defineAction({
      input: z.object({
        id: z.string().min(1),
      }),
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const video = videoResult[0];
        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const existing = await db
          .select({ id: approvals.id })
          .from(approvals)
          .where(and(eq(approvals.videoId, id), eq(approvals.userId, user.id)))
          .limit(1);

        if (existing.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "No approval to remove" });
        }

        await db
          .delete(approvals)
          .where(and(eq(approvals.videoId, id), eq(approvals.userId, user.id)));

        const status = await getApprovalStatus(db, id, video.spaceId);
        await broadcastApprovalUpdate(env, id, status);

        await logProjectActivity(db, {
          videoId: id,
          actorUserId: user.id,
          actorDisplayName: user.name,
          type: "approval.revoked",
          data: {
            approverUserId: user.id,
            approverDisplayName: user.name,
          },
        });

        return { approvalStatus: status };
      },
    }),

    requestApprovals: defineAction({
      input: z.object({
        id: z.string().min(1),
        userIds: z.array(z.string().min(1)).min(1).max(50),
      }),
      handler: async ({ id, userIds }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const video = videoResult[0];

        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        // Only the uploader or a space owner can request approvals on a
        // video. Member-reviewers shouldn't be able to ping each other.
        if (role !== "owner" && video.uploadedBy !== user.id) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Only the uploader or a space owner can request approvals",
          });
        }

        const spaceRow = await db
          .select({ requiredApprovals: spaces.requiredApprovals })
          .from(spaces)
          .where(eq(spaces.id, video.spaceId))
          .limit(1);

        if (!spaceRow[0] || spaceRow[0].requiredApprovals <= 0) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Approval workflow is not enabled for this space",
          });
        }

        // Validate that every requested user is a member of the same space.
        // Silently drops the actor and the uploader — neither can approve,
        // so requesting approval from them is meaningless.
        const uniqueIds = [...new Set(userIds)].filter(
          (uid) => uid !== user.id && uid !== video.uploadedBy,
        );

        if (uniqueIds.length === 0) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "No valid approvers selected",
          });
        }

        const memberRows = await db
          .select({ userId: spaceMembers.userId })
          .from(spaceMembers)
          .where(
            and(
              eq(spaceMembers.spaceId, video.spaceId),
              inArray(spaceMembers.userId, uniqueIds),
            ),
          );
        const validMemberIds = memberRows.map((row) => row.userId);
        if (validMemberIds.length !== uniqueIds.length) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "One or more selected users are not members of this space",
          });
        }

        // Skip users who already have a pending request for this video.
        // Approving a video does not delete the row (status flips to
        // "resolved"), so we only filter on status = pending.
        const existing = await db
          .select({ requestedUserId: approvalRequests.requestedUserId })
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.videoId, id),
              eq(approvalRequests.status, "pending"),
              inArray(approvalRequests.requestedUserId, validMemberIds),
            ),
          );
        const alreadyPending = new Set(existing.map((r) => r.requestedUserId));
        const toCreate = validMemberIds.filter((uid) => !alreadyPending.has(uid));

        if (toCreate.length === 0) {
          return {
            created: 0,
            alreadyPending: validMemberIds.length,
          };
        }

        const now = new Date().toISOString();
        const newRows = toCreate.map((requestedUserId) => ({
          id: nanoid(),
          videoId: id,
          spaceId: video.spaceId,
          requesterUserId: user.id,
          requesterDisplayName: user.name,
          requestedUserId,
          status: "pending" as const,
          createdAt: now,
          resolvedAt: null,
        }));

        await db.insert(approvalRequests).values(newRows);

        // Per-user notification + email. Best-effort: dispatch failures
        // don't roll back the request rows.
        try {
          await createTargetedApprovalRequestNotifications(
            db,
            {
              videoId: id,
              requestedUserIds: toCreate,
              actorUserId: user.id,
              actorDisplayName: user.name,
            },
            {
              send: (msg) => env.EMAIL.send(msg),
              from: env.OTP_EMAIL_FROM,
              baseUrl: new URL(context.request.url).origin,
            },
            env,
          );
        } catch (err) {
          console.error("Failed to dispatch targeted approval-request notifications", err);
        }

        return {
          created: toCreate.length,
          alreadyPending: alreadyPending.size,
        };
      },
    }),

    move: defineAction({
      input: z.object({
        id: z.string().min(1),
        folderId: z.string().uuid().nullable(),
      }),
      handler: async ({ id, folderId }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const video = videoResult[0];
        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (folderId) {
          const folder = await db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.spaceId, video.spaceId)))
            .limit(1);
          if (folder.length === 0) {
            throw new ActionError({ code: "NOT_FOUND", message: "Folder not found" });
          }
        }

        const versionGroupId = video.versionGroupId || video.id;
        const now = new Date().toISOString();
        await db
          .update(videos)
          .set({ folderId, updatedAt: now })
          .where(and(eq(videos.spaceId, video.spaceId), eq(videos.versionGroupId, versionGroupId)));

        const updated = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        return { video: updated[0] };
      },
    }),

    createProject: defineAction({
      input: projectCreateSchema,
      handler: async (input, context) => {
        const user = requireUser(context);
        const { title, description, spaceId, folderId } = input;
        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (folderId) {
          const folder = await db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
            .limit(1);

          if (folder.length === 0) {
            throw new ActionError({ code: "NOT_FOUND", message: "Folder not found" });
          }
        }

        const videoId = crypto.randomUUID();
        const now = new Date().toISOString();

        await db.insert(videos).values({
          id: videoId,
          spaceId,
          uploadedBy: user.id,
          folderId: folderId || null,
          title,
          description: description || null,
          status: "draft",
          versionGroupId: videoId,
          versionNumber: 1,
          isCurrentVersion: true,
          phase: "creating_script",
          targetDate: null,
          createdAt: now,
          updatedAt: now,
        });

        await db.insert(scripts).values({
          id: crypto.randomUUID(),
          videoId,
          content: "",
          plainText: "",
          status: "writing",
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        });

        await logProjectActivity(db, {
          videoId,
          actorUserId: user.id,
          actorDisplayName: user.name,
          type: "project.created",
          data: { title },
          createdAt: now,
        });

        return { videoId };
      },
    }),

    uploadFirstCut: defineAction({
      input: uploadSchema
        .omit({ spaceId: true, folderId: true })
        .extend({ id: z.string().min(1) }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const { id, fileName, fileSize, generateTranscript } = input;

        validateUploadFile(fileName, fileSize);

        const db = createDb(env.DB);
        const projectResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);
        const project = projectResult[0];

        if (!project) {
          throw new ActionError({ code: "NOT_FOUND", message: "Project not found" });
        }
        if (project.phase === "published") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Cannot upload to a published project",
          });
        }
        if (project.status !== "draft" || project.streamVideoId) {
          throw new ActionError({
            code: "CONFLICT",
            message: "This project already has a video",
          });
        }

        const role = await verifySpaceAccess(db, user.id, project.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        let uploadUrl: string;
        let streamVideoId: string;
        try {
          const direct = await createDirectUpload(
            env.STREAM_ACCOUNT_ID,
            env.STREAM_API_TOKEN,
            fileName,
            fileSize,
          );
          uploadUrl = direct.uploadUrl;
          streamVideoId = direct.streamVideoId;
        } catch (error) {
          console.error("First-cut upload error:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Upload service is temporarily unavailable. Please try again.",
          });
        }

        const now = new Date().toISOString();
        const transcriptRequested = generateTranscript
          ? await isTranscriptGenerationEnabled(env, user)
          : false;

        await db
          .update(videos)
          .set({
            uploadedBy: user.id,
            status: "processing",
            phase: "reviewing_video",
            streamVideoId,
            fileName,
            fileSize,
            transcriptRequested,
            updatedAt: now,
          })
          .where(eq(videos.id, id));

        await logProjectActivity(db, {
          videoId: id,
          actorUserId: user.id,
          actorDisplayName: user.name,
          type: "first_cut.uploaded",
          data: { fileName, fileSize },
          createdAt: now,
        });

        await logProjectActivity(db, {
          videoId: id,
          actorUserId: user.id,
          actorDisplayName: user.name,
          type: "phase.changed",
          data: { from: project.phase, to: "reviewing_video" },
          createdAt: now,
        });

        await broadcastPhaseChange(env, id, {
          videoId: id,
          phase: "reviewing_video",
          changedBy: user.name,
        });

        return { videoId: id, uploadUrl };
      },
    }),

    uploadVersion: defineAction({
      input: uploadSchema
        .omit({ folderId: true })
        .extend({ id: z.string().min(1) }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const { id, fileName, fileSize, title, description, generateTranscript } = input;

        validateUploadFile(fileName, fileSize);

        const db = createDb(env.DB);
        const baseResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);
        const baseVideo = baseResult[0];

        if (!baseVideo) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }
        if (baseVideo.phase === "published") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Cannot add versions to published videos",
          });
        }

        const role = await verifySpaceAccess(db, user.id, baseVideo.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const versionGroupId = baseVideo.versionGroupId || baseVideo.id;
        const latestResult = await db
          .select({ versionNumber: videos.versionNumber })
          .from(videos)
          .where(
            and(
              eq(videos.spaceId, baseVideo.spaceId),
              eq(videos.versionGroupId, versionGroupId),
            ),
          )
          .orderBy(desc(videos.versionNumber))
          .limit(1);

        const nextVersionNumber = (latestResult[0]?.versionNumber || 1) + 1;

        let uploadUrl: string;
        let streamVideoId: string;
        try {
          const direct = await createDirectUpload(
            env.STREAM_ACCOUNT_ID,
            env.STREAM_API_TOKEN,
            fileName,
            fileSize,
          );
          uploadUrl = direct.uploadUrl;
          streamVideoId = direct.streamVideoId;
        } catch (error) {
          console.error("Version upload error:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Upload service is temporarily unavailable. Please try again.",
          });
        }

        const videoId = crypto.randomUUID();
        const now = new Date().toISOString();
        const transcriptRequested = generateTranscript
          ? await isTranscriptGenerationEnabled(env, user)
          : false;

        await db
          .update(videos)
          .set({ isCurrentVersion: false, updatedAt: now })
          .where(
            and(
              eq(videos.spaceId, baseVideo.spaceId),
              eq(videos.versionGroupId, versionGroupId),
            ),
          );

        await db.insert(videos).values({
          id: videoId,
          spaceId: baseVideo.spaceId,
          uploadedBy: user.id,
          folderId: baseVideo.folderId,
          title: title?.trim() || baseVideo.title,
          description:
            description !== undefined
              ? description.trim() || null
              : baseVideo.description,
          status: "processing",
          versionGroupId,
          versionNumber: nextVersionNumber,
          isCurrentVersion: true,
          streamVideoId,
          fileName,
          fileSize,
          transcriptRequested,
          createdAt: now,
          updatedAt: now,
        });

        // Reset approvals when a new version is uploaded. We hard-delete
        // approval rows for ALL prior versions in this version group so the
        // approver list starts fresh on the new version. Old versions are
        // archived/read-only anyway.
        try {
          const groupVersions = await db
            .select({ id: videos.id })
            .from(videos)
            .where(
              and(
                eq(videos.spaceId, baseVideo.spaceId),
                eq(videos.versionGroupId, versionGroupId),
              ),
            );
          const priorIds = groupVersions
            .map((row) => row.id)
            .filter((existingId) => existingId !== videoId);

          if (priorIds.length > 0) {
            const existingApprovals = await db
              .select({ id: approvals.id })
              .from(approvals)
              .where(inArray(approvals.videoId, priorIds))
              .limit(1);

            if (existingApprovals.length > 0) {
              await db
                .delete(approvals)
                .where(inArray(approvals.videoId, priorIds));

              await logProjectActivity(db, {
                videoId,
                actorUserId: user.id,
                actorDisplayName: user.name,
                type: "approvals.reset",
                data: { reason: "new_version" },
                createdAt: now,
              });

              const status = await getApprovalStatus(
                db,
                videoId,
                baseVideo.spaceId,
              );
              await broadcastApprovalUpdate(env, videoId, status);
            }
          }
        } catch (err) {
          console.error("Failed to reset approvals on new version", err);
        }

        return { videoId, uploadUrl };
      },
    }),

  },

  transcript: {
    get: defineAction({
      input: z.object({
        videoId: z.string().min(1),
      }),
      handler: async ({ videoId }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, videoId))
          .limit(1);
        const video = videoResult[0];

        if (!video) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const transcriptResult = await db
          .select()
          .from(transcripts)
          .where(eq(transcripts.videoId, videoId))
          .limit(1);
        const transcript = transcriptResult[0] || null;

        return {
          transcript,
          transcriptRequested: video.transcriptRequested,
          transcriptsEnabled: await isTranscriptGenerationEnabled(env, user),
          videoStatus: video.status,
        };
      },
    }),

    queue: defineAction({
      input: z.object({
        videoId: z.string().min(1),
      }),
      handler: async ({ videoId }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, videoId))
          .limit(1);
        const video = videoResult[0];

        if (!video) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const enabled = await isTranscriptGenerationEnabled(env, user);
        if (!enabled) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Transcript generation is not enabled",
          });
        }

        await db
          .update(videos)
          .set({ transcriptRequested: true, updatedAt: new Date().toISOString() })
          .where(eq(videos.id, videoId));

        const existingTranscript = await db
          .select({ id: transcripts.id })
          .from(transcripts)
          .where(eq(transcripts.videoId, videoId))
          .limit(1);

        if (!existingTranscript[0] && video.status !== "ready") {
          const now = new Date().toISOString();
          await db.insert(transcripts).values({
            id: crypto.randomUUID(),
            videoId,
            userId: user.id,
            status: "requested",
            requestedAt: now,
            updatedAt: now,
          });
        }

        await queueTranscriptForVideo(env, db, {
          ...video,
          transcriptRequested: true,
        });

        const transcriptResult = await db
          .select()
          .from(transcripts)
          .where(eq(transcripts.videoId, videoId))
          .limit(1);

        return { transcript: transcriptResult[0] || null };
      },
    }),
  },

  comment: {
    create: defineAction({
      input: commentSchema.extend({
        videoId: z.string().min(1),
      }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const { videoId, text, timestamp, annotation, urgency, phase, textRange } = input;
        const db = createDb(env.DB);

        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, videoId))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        if (videoResult[0].phase === "published") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Cannot comment on published videos",
          });
        }

        const role = await verifySpaceAccess(db, user.id, videoResult[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const commentId = crypto.randomUUID();
        const now = new Date().toISOString();
        const newComment = {
          id: commentId,
          videoId,
          authorType: "user" as const,
          authorUserId: user.id,
          authorDisplayName: user.name,
          timestamp: timestamp != null ? Number(timestamp) : null,
          text: text.trim(),
          parentId: null,
          isResolved: false,
          resolvedBy: null,
          resolvedAt: null,
          resolvedReason: null,
          annotation: annotation ? JSON.stringify(annotation) : null,
          urgency,
          phase,
          textRange: textRange ? JSON.stringify(textRange) : null,
        };

        await db.insert(comments).values(newComment);

        try {
          await createCommentNotifications(
            db,
            {
              commentId,
              videoId,
              actorUserId: user.id,
              actorDisplayName: user.name,
              text: newComment.text,
              parentCommentId: null,
              phase,
            },
            {
              send: (msg) => env.EMAIL.send(msg),
              from: env.OTP_EMAIL_FROM,
              baseUrl: new URL(context.request.url).origin,
            },
            env,
          );
        } catch (err) {
          console.error("Failed to create comment notification", err);
        }

        const responseComment = {
          ...newComment,
          annotation: annotation ?? null,
          textRange: textRange ?? null,
          createdAt: now,
          name: user.name,
          reactions: [],
        };

        await broadcastNewComment(env, videoId, responseComment);

        return { comment: responseComment };
      },
    }),

    delete: defineAction({
      input: z.object({
        id: z.string().min(1),
      }),
      handler: async ({ id: commentId }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const comment = await db
          .select()
          .from(comments)
          .where(eq(comments.id, commentId))
          .limit(1);

        if (comment.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Comment not found" });
        }

        const videoRow = await db
          .select({ spaceId: videos.spaceId })
          .from(videos)
          .where(eq(videos.id, comment[0].videoId))
          .limit(1);

        if (videoRow.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, videoRow[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (comment[0].authorUserId !== user.id) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "You can only delete your own comments",
          });
        }

        // Delete replies if this is a root comment
        if (!comment[0].parentId) {
          await db.delete(comments).where(eq(comments.parentId, commentId));
        }

        await db.delete(comments).where(eq(comments.id, commentId));

        return { success: true };
      },
    }),

    resolve: defineAction({
      input: z.object({
        id: z.string().min(1),
        resolved: z.boolean(),
      }),
      handler: async ({ id: commentId, resolved }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const comment = await db
          .select()
          .from(comments)
          .where(eq(comments.id, commentId))
          .limit(1);

        if (comment.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Comment not found" });
        }

        if (comment[0].parentId) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Only root comments can be resolved",
          });
        }

        const videoRow = await db
          .select({ spaceId: videos.spaceId })
          .from(videos)
          .where(eq(videos.id, comment[0].videoId))
          .limit(1);

        if (videoRow.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, videoRow[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        await db
          .update(comments)
          .set({
            isResolved: resolved,
            resolvedBy: resolved ? user.id : null,
            resolvedAt: resolved ? new Date().toISOString() : null,
            resolvedReason: resolved ? "manual" : null,
          })
          .where(eq(comments.id, commentId));

        const updated = await db
          .select()
          .from(comments)
          .where(eq(comments.id, commentId))
          .limit(1);

        return { comment: updated[0] };
      },
    }),

    reply: defineAction({
      input: z.object({
        parentId: z.string().min(1),
        text: z.string().min(1, "Reply text is required").max(5000),
      }),
      handler: async ({ parentId, text }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const parent = await db
          .select()
          .from(comments)
          .where(eq(comments.id, parentId))
          .limit(1);

        if (parent.length === 0) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Parent comment not found",
          });
        }

        const videoRow = await db
          .select({ spaceId: videos.spaceId })
          .from(videos)
          .where(eq(videos.id, parent[0].videoId))
          .limit(1);

        if (videoRow.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, videoRow[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const commentId = crypto.randomUUID();
        const now = new Date().toISOString();
        // Replies don't carry urgency; default to "suggestion" so the column
        // stays populated without surfacing in the UI.
        const newReply = {
          id: commentId,
          videoId: parent[0].videoId,
          authorType: "user" as const,
          authorUserId: user.id,
          authorDisplayName: user.name,
          timestamp: null,
          text: text.trim(),
          parentId,
          isResolved: false,
          resolvedBy: null,
          resolvedAt: null,
          resolvedReason: null,
          annotation: null,
          urgency: "suggestion" as const,
          phase: parent[0].phase,
          textRange: null,
        };

        await db.insert(comments).values(newReply);

        try {
          await createCommentNotifications(
            db,
            {
              commentId,
              videoId: parent[0].videoId,
              actorUserId: user.id,
              actorDisplayName: user.name,
              text: newReply.text,
              parentCommentId: parentId,
              phase: parent[0].phase,
            },
            {
              send: (msg) => env.EMAIL.send(msg),
              from: env.OTP_EMAIL_FROM,
              baseUrl: new URL(context.request.url).origin,
            },
            env,
          );
        } catch (err) {
          console.error("Failed to create reply notification", err);
        }

        const responseComment = {
          ...newReply,
          createdAt: now,
          name: user.name,
          reactions: [],
        };

        await broadcastNewComment(env, parent[0].videoId, responseComment);

        return { comment: responseComment };
      },
    }),

    toggleReaction: defineAction({
      input: z.object({
        id: z.string().min(1),
        emoji: z.string().min(1),
      }),
      handler: async ({ id: commentId, emoji }, context) => {
        const user = requireUser(context);

        if (!isCommentReactionEmoji(emoji)) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Unsupported reaction",
          });
        }

        const db = createDb(env.DB);
        const comment = await db
          .select({ videoId: comments.videoId })
          .from(comments)
          .where(eq(comments.id, commentId))
          .limit(1);

        if (comment.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Comment not found" });
        }

        const videoRow = await db
          .select({ spaceId: videos.spaceId, phase: videos.phase })
          .from(videos)
          .where(eq(videos.id, comment[0].videoId))
          .limit(1);

        if (videoRow.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        if (videoRow[0].phase === "published") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Cannot react on published videos",
          });
        }

        const role = await verifySpaceAccess(db, user.id, videoRow[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const reactions = await toggleCommentReaction(db, commentId, emoji, {
          userId: user.id,
          name: user.name,
        });

        await broadcastCommentReactions(env, comment[0].videoId, {
          commentId,
          reactions: reactions.map((reaction) => ({
            ...reaction,
            reactedByMe: false,
          })),
        });

        return { commentId, reactions };
      },
    }),
  },


  space: {
    update: defineAction({
      input: spaceUpdateSchema.extend({
        id: z.string().min(1),
      }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, input.id);
        if (role !== "owner") {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const updates: {
          name?: string;
          requiredApprovals?: number;
          pipelineEnabled?: boolean;
          updatedAt: string;
        } = { updatedAt: new Date().toISOString() };

        if (input.name !== undefined) updates.name = input.name;
        if (input.requiredApprovals !== undefined) updates.requiredApprovals = input.requiredApprovals;
        if (input.pipelineEnabled !== undefined) updates.pipelineEnabled = input.pipelineEnabled;

        await db.update(spaces).set(updates).where(eq(spaces.id, input.id));
        const updated = await db
          .select()
          .from(spaces)
          .where(eq(spaces.id, input.id))
          .limit(1);

        return { space: updated[0] };
      },
    }),

    delete: defineAction({
      input: z.object({
        id: z.string().min(1),
      }),
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, id);
        if (role !== "owner") {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const space = await db
          .select({ id: spaces.id, name: spaces.name })
          .from(spaces)
          .where(eq(spaces.id, id))
          .limit(1);

        if (space.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Space not found" });
        }

        // Find the user's earliest owned space (their "Personal" default space)
        const firstOwned = await db
          .select({ id: spaces.id })
          .from(spaces)
          .where(eq(spaces.ownerId, user.id))
          .orderBy(spaces.createdAt)
          .limit(1);

        if (firstOwned.length > 0 && firstOwned[0].id === id) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Cannot delete your default personal space",
          });
        }

        // CASCADE will handle space_members, space_invites, folders, videos
        await db.delete(spaces).where(eq(spaces.id, id));

        return { success: true };
      },
    }),

    leave: defineAction({
      input: z.object({
        id: z.string().min(1),
      }),
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, id);
        if (!role) {
          throw new ActionError({ code: "NOT_FOUND", message: "Not a member of this space" });
        }

        if (role === "owner") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Owners cannot leave. Transfer ownership or delete the space.",
          });
        }

        await db
          .delete(spaceMembers)
          .where(and(eq(spaceMembers.spaceId, id), eq(spaceMembers.userId, user.id)));

        return { success: true };
      },
    }),

    removeMember: defineAction({
      input: z.object({
        id: z.string().min(1),
        userId: z.string().min(1),
      }),
      handler: async ({ id, userId: targetUserId }, context) => {
        const user = requireUser(context);

        if (targetUserId === user.id) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Cannot remove yourself. Use leave instead.",
          });
        }

        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, id);
        if (role !== "owner") {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const member = await db
          .select({ id: spaceMembers.id })
          .from(spaceMembers)
          .where(
            and(eq(spaceMembers.spaceId, id), eq(spaceMembers.userId, targetUserId)),
          )
          .limit(1);

        if (member.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Member not found" });
        }

        await db
          .delete(spaceMembers)
          .where(
            and(eq(spaceMembers.spaceId, id), eq(spaceMembers.userId, targetUserId)),
          );

        return { success: true };
      },
    }),

    createInvite: defineAction({
      input: inviteCreateSchema.extend({
        id: z.string().min(1),
      }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, input.id);
        if (role !== "owner") {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const space = await db
          .select({ name: spaces.name })
          .from(spaces)
          .where(eq(spaces.id, input.id))
          .limit(1);

        if (space.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Space not found" });
        }

        // Check for duplicate pending invite for same email + space
        const existing = await db
          .select({ id: spaceInvites.id })
          .from(spaceInvites)
          .where(
            and(
              eq(spaceInvites.spaceId, input.id),
              eq(spaceInvites.email, input.email),
              eq(spaceInvites.status, "pending"),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          throw new ActionError({
            code: "CONFLICT",
            message: "A pending invite already exists for this email",
          });
        }

        const invite = {
          id: crypto.randomUUID(),
          spaceId: input.id,
          email: input.email,
          invitedBy: user.id,
          token: nanoid(12),
          status: "pending" as const,
        };

        await db.insert(spaceInvites).values(invite);

        const existingUser = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        const invitePath = buildInviteAuthPath({
          email: input.email,
          hasAccount: existingUser.length > 0,
          token: invite.token,
        });
        const inviteUrl = new URL(invitePath, new URL(context.request.url).origin).toString();
        const email = buildInviteEmail({
          inviteUrl,
          inviterName: user.name,
          spaceName: space[0].name,
        });

        try {
          await env.EMAIL.send({
            to: input.email,
            from: env.OTP_EMAIL_FROM,
            subject: email.subject,
            text: email.text,
            html: email.html,
          });
        } catch (error) {
          await db.delete(spaceInvites).where(eq(spaceInvites.id, invite.id));
          console.error("Failed to send invite email", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send invite email",
          });
        }

        // If the invitee already has an account, push a real-time signal to
        // their open tabs so the header badge increments — pending invites
        // count toward the unread badge (see Layout.astro).
        if (existingUser.length > 0) {
          await broadcastNotification(env, existingUser[0].id, {
            kind: "invite",
            id: invite.id,
            title: `${user.name} invited you to ${space[0].name}`,
            href: "/notifications",
            createdAt: new Date().toISOString(),
          });
        }

        const created = await db
          .select()
          .from(spaceInvites)
          .where(eq(spaceInvites.id, invite.id))
          .limit(1);

        return { invite: created[0] };
      },
    }),

    revokeInvite: defineAction({
      input: z.object({
        id: z.string().min(1),
        inviteId: z.string().min(1),
      }),
      handler: async ({ id, inviteId }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, id);
        if (role !== "owner") {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const invite = await db
          .select({ id: spaceInvites.id, status: spaceInvites.status })
          .from(spaceInvites)
          .where(and(eq(spaceInvites.id, inviteId), eq(spaceInvites.spaceId, id)))
          .limit(1);

        if (invite.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Invite not found" });
        }

        if (invite[0].status !== "pending") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Only pending invites can be revoked",
          });
        }

        await db
          .update(spaceInvites)
          .set({ status: "revoked" })
          .where(eq(spaceInvites.id, inviteId));

        return { success: true };
      },
    }),
  },

  folder: {
    create: defineAction({
      input: folderCreateSchema,
      handler: async (input, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const parentId = input.parentId ?? null;
        const defaultSpace = input.spaceId
          ? null
          : await getDefaultSpaceForUser(db, user.id);
        const targetSpaceId = input.spaceId ?? defaultSpace?.id;

        if (!targetSpaceId) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No space found for user",
          });
        }

        const role = await verifySpaceAccess(db, user.id, targetSpaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (parentId) {
          const parent = await db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, parentId), eq(folders.spaceId, targetSpaceId)))
            .limit(1);

          if (parent.length === 0) {
            throw new ActionError({
              code: "NOT_FOUND",
              message: "Parent folder not found",
            });
          }
        }

        const id = crypto.randomUUID();
        await db.insert(folders).values({
          id,
          spaceId: targetSpaceId,
          name: input.name,
          parentId,
        });

        const created = await db
          .select()
          .from(folders)
          .where(eq(folders.id, id))
          .limit(1);

        return { folder: created[0] };
      },
    }),

    update: defineAction({
      input: folderUpdateSchema.extend({
        id: z.string().min(1),
      }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await db
          .select()
          .from(folders)
          .where(eq(folders.id, input.id))
          .limit(1);

        if (current.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Folder not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const updates: { name?: string; parentId?: string | null; updatedAt: string } = {
          updatedAt: new Date().toISOString(),
        };

        if (input.name !== undefined) updates.name = input.name;
        if (input.parentId !== undefined) {
          const parentId = input.parentId ?? null;
          if (parentId === input.id) {
            throw new ActionError({
              code: "BAD_REQUEST",
              message: "A folder cannot contain itself",
            });
          }

          if (parentId) {
            const allFolders = await db
              .select({ id: folders.id, parentId: folders.parentId })
              .from(folders)
              .where(eq(folders.spaceId, current[0].spaceId));
            const folderById = new Map(
              allFolders.map((folder) => [folder.id, folder]),
            );
            let cursor = folderById.get(parentId);

            while (cursor) {
              if (cursor.id === input.id) {
                throw new ActionError({
                  code: "BAD_REQUEST",
                  message: "Cannot move a folder into its own child",
                });
              }
              cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
            }

            if (!folderById.has(parentId)) {
              throw new ActionError({
                code: "NOT_FOUND",
                message: "Parent folder not found",
              });
            }
          }

          updates.parentId = parentId;
        }

        await db.update(folders).set(updates).where(eq(folders.id, input.id));
        const updated = await db
          .select()
          .from(folders)
          .where(eq(folders.id, input.id))
          .limit(1);

        return { folder: updated[0] };
      },
    }),

    move: defineAction({
      input: z.object({
        id: z.string().min(1),
        parentId: z.string().uuid().nullable(),
      }),
      handler: async ({ id, parentId }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await db
          .select()
          .from(folders)
          .where(eq(folders.id, id))
          .limit(1);

        if (current.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Folder not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const nextParentId = parentId ?? null;
        if (nextParentId === id) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "A folder cannot contain itself",
          });
        }

        if (nextParentId) {
          const allFolders = await db
            .select({ id: folders.id, parentId: folders.parentId })
            .from(folders)
            .where(eq(folders.spaceId, current[0].spaceId));
          const folderById = new Map(
            allFolders.map((folder) => [folder.id, folder]),
          );
          let cursor = folderById.get(nextParentId);

          while (cursor) {
            if (cursor.id === id) {
              throw new ActionError({
                code: "BAD_REQUEST",
                message: "Cannot move a folder into its own child",
              });
            }
            cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
          }

          if (!folderById.has(nextParentId)) {
            throw new ActionError({
              code: "NOT_FOUND",
              message: "Parent folder not found",
            });
          }
        }

        await db
          .update(folders)
          .set({ parentId: nextParentId, updatedAt: new Date().toISOString() })
          .where(eq(folders.id, id));

        const updated = await db
          .select()
          .from(folders)
          .where(eq(folders.id, id))
          .limit(1);

        return { folder: updated[0] };
      },
    }),

    delete: defineAction({
      input: z.object({
        id: z.string().min(1),
      }),
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await db
          .select({ id: folders.id, spaceId: folders.spaceId })
          .from(folders)
          .where(eq(folders.id, id))
          .limit(1);

        if (current.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Folder not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const allFolders = await db
          .select({ id: folders.id, parentId: folders.parentId })
          .from(folders)
          .where(eq(folders.spaceId, current[0].spaceId));
        const idsToDelete = new Set([id]);
        let changed = true;

        while (changed) {
          changed = false;
          for (const folder of allFolders) {
            if (
              folder.parentId &&
              idsToDelete.has(folder.parentId) &&
              !idsToDelete.has(folder.id)
            ) {
              idsToDelete.add(folder.id);
              changed = true;
            }
          }
        }

        const ids = Array.from(idsToDelete);
        const now = new Date().toISOString();
        await db
          .update(videos)
          .set({ folderId: null, updatedAt: now })
          .where(inArray(videos.folderId, ids));
        await db.delete(folders).where(inArray(folders.id, ids));

        return { success: true };
      },
    }),
  },
};
