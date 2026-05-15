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
  brainstorms,
  comments,
  commentReactions,
  projects,
  scripts,
  shareLinks,
  transcripts,
} from "../db/schema";
import {
  projectUpdateSchema,
  phaseSchema,
  approveVideoSchema,
  brainstormCreateSchema,
  brainstormUpdateSchema,
  brainstormStatusUpdateSchema,
  brainstormReactionToggleSchema,
  brainstormMarkPromotedSchema,
  commentSchema,
  spaceUpdateSchema,
  inviteCreateSchema,
  folderCreateSchema,
  folderUpdateSchema,
  projectCreateSchema,
  uploadSchema,
  scriptUpdateSchema,
  notificationsMarkReadByContextSchema,
} from "../lib/validation";
import { verifySpaceAccess, getDefaultSpaceForUser } from "../lib/spaces";
import { generateShareToken, generateInviteToken } from "../lib/share";
import { getCanonicalBaseUrl } from "../lib/urls";
import { getApprovalStatus } from "../lib/approvals";
import { createDirectUpload, deleteVideo as deleteStreamVideo } from "../lib/stream";
import { isTranscriptGenerationEnabled } from "../lib/flags";
import { queueTranscriptForVideo } from "../lib/transcripts";
import { logProjectActivity } from "../lib/activity";
import { getMergedVideoById, createProjectInSpace } from "../lib/projects";
import {
  broadcastPhaseChange,
  broadcastApprovalUpdate,
  broadcastNewComment,
  broadcastCommentReactions,
  broadcastNotification,
  broadcastNotificationsRead,
} from "../lib/broadcast";
import {
  isCommentReactionEmoji,
  toggleCommentReaction,
} from "../lib/comments";
import {
  getBrainstormById,
  toggleBrainstormReaction,
} from "../lib/brainstorms";
import {
  createCommentNotifications,
  createTargetedApprovalRequestNotifications,
  resolveApprovalRequestsForApprover,
  markNotificationRead,
  markNotificationsReadByVideoTab,
} from "../lib/notifications";
import { buildInviteAuthPath, buildInviteEmail } from "../lib/email";
import { sendEmail } from "../lib/send-email";

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
      input: projectUpdateSchema.extend({ id: z.string().min(1) }),
      handler: async (input, context) => {
        const user = requireUser(context);
        const { id } = input;
        const db = createDb(env.DB);

        const video = await getMergedVideoById(db, id);
        if (!video) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

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
        const projectId = video.projectId;

        if (Object.keys(updates).length > 0) {
          await db
            .update(projects)
            .set({ ...updates, updatedAt: now })
            .where(eq(projects.id, projectId));

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
          await db
            .update(projects)
            .set({ folderId: folderUpdate, updatedAt: now })
            .where(eq(projects.id, projectId));
        }

        return { success: true };
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

        const projectId = video.projectId;
        const projectVersions = await db
          .select({ id: videos.id, streamVideoId: videos.streamVideoId })
          .from(videos)
          .where(eq(videos.projectId, projectId));

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

        await db.delete(projects).where(eq(projects.id, projectId));

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

        const video = await getMergedVideoById(db, id);
        if (!video) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

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
        const projectId = video.projectId;
        await db
          .update(projects)
          .set({ phase, updatedAt: now })
          .where(eq(projects.id, projectId));

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

        return { success: true };
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

        if (status.isApproved) {
          const projectId = video.projectId;
          const projectRow = await db
            .select({ phase: projects.phase })
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);
          const currentPhase = projectRow[0]?.phase;
          if (currentPhase === "reviewing_video") {
            await db
              .update(projects)
              .set({ phase: "video_approved", updatedAt: now })
              .where(eq(projects.id, projectId));

            await logProjectActivity(db, {
              videoId: id,
              actorUserId: user.id,
              actorDisplayName: user.name,
              type: "phase.changed",
              data: { from: currentPhase, to: "video_approved", auto: true },
              createdAt: now,
            });

            await broadcastPhaseChange(env, id, {
              videoId: id,
              phase: "video_approved",
              changedBy: user.name,
            });
          }
        }

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

        const now = new Date().toISOString();
        await logProjectActivity(db, {
          videoId: id,
          actorUserId: user.id,
          actorDisplayName: user.name,
          type: "approval.revoked",
          data: {
            approverUserId: user.id,
            approverDisplayName: user.name,
          },
          createdAt: now,
        });

        if (!status.isApproved) {
          const projectId = video.projectId;
          const projectRow = await db
            .select({ phase: projects.phase })
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);
          const currentPhase = projectRow[0]?.phase;
          if (currentPhase === "video_approved") {
            await db
              .update(projects)
              .set({ phase: "reviewing_video", updatedAt: now })
              .where(eq(projects.id, projectId));

            await logProjectActivity(db, {
              videoId: id,
              actorUserId: user.id,
              actorDisplayName: user.name,
              type: "phase.changed",
              data: { from: currentPhase, to: "reviewing_video", auto: true },
              createdAt: now,
            });

            await broadcastPhaseChange(env, id, {
              videoId: id,
              phase: "reviewing_video",
              changedBy: user.name,
            });
          }
        }

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

        // Drop the actor and uploader — neither can approve.
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

        // Resolved/cancelled rows are kept for audit, so only block
        // re-requesting against rows that are still pending.
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
              send: (msg) => sendEmail(env, msg),
              from: env.OTP_EMAIL_FROM,
              baseUrl: getCanonicalBaseUrl(env),
            },
            env,
            context.locals.cfContext,
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

        const projectId = video.projectId;
        const now = new Date().toISOString();
        await db
          .update(projects)
          .set({ folderId, updatedAt: now })
          .where(eq(projects.id, projectId));

        return { success: true };
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

        try {
          const { videoId } = await createProjectInSpace(db, {
            spaceId,
            folderId: folderId ?? null,
            title,
            description,
            user,
          });
          return { videoId };
        } catch (error) {
          if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") {
            throw new ActionError({ code: "NOT_FOUND", message: "Folder not found" });
          }
          console.error("[video.createProject] failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create the project. Please try again.",
          });
        }
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
        const project = await getMergedVideoById(db, id);

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
            streamVideoId,
            fileName,
            fileSize,
            transcriptRequested,
            updatedAt: now,
          })
          .where(eq(videos.id, id));

        const projectId = project.projectId;
        await db
          .update(projects)
          .set({ uploadedBy: user.id, phase: "reviewing_video", updatedAt: now })
          .where(eq(projects.id, projectId));

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
        const { id, fileName, fileSize, generateTranscript, versionNotes } = input;

        validateUploadFile(fileName, fileSize);

        const db = createDb(env.DB);
        const baseVideo = await getMergedVideoById(db, id);

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

        const projectId = baseVideo.projectId;
        const latestResult = await db
          .select({ versionNumber: videos.versionNumber })
          .from(videos)
          .where(eq(videos.projectId, projectId))
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
          .where(eq(videos.projectId, projectId));

        const trimmedNotes = versionNotes?.trim();
        await db.insert(videos).values({
          id: videoId,
          spaceId: baseVideo.spaceId,
          uploadedBy: user.id,
          projectId,
          status: "processing",
          versionNumber: nextVersionNumber,
          isCurrentVersion: true,
          streamVideoId,
          fileName,
          fileSize,
          transcriptRequested,
          versionNotes: trimmedNotes ? trimmedNotes : null,
          createdAt: now,
          updatedAt: now,
        });

        // Reset approvals when a new version is uploaded. We hard-delete
        // approval rows for ALL prior versions of this project so the
        // approver list starts fresh on the new version. Old versions are
        // archived/read-only anyway.
        try {
          const groupVersions = await db
            .select({ id: videos.id })
            .from(videos)
            .where(eq(videos.projectId, projectId));
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

  script: {
    update: defineAction({
      input: scriptUpdateSchema.extend({
        videoId: z.string().min(1),
      }),
      handler: async ({ videoId, content, plainText: plainTextInput }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const video = await getMergedVideoById(db, videoId);

        if (!video) {
          throw new ActionError({ code: "NOT_FOUND", message: "Project not found" });
        }

        if (video.phase === "published") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Cannot edit published scripts",
          });
        }

        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const now = new Date().toISOString();
        const plainText = (plainTextInput ?? content).replace(/\s+/g, " ").trim();

        const existing = await db
          .select({ id: scripts.id })
          .from(scripts)
          .where(eq(scripts.videoId, videoId))
          .limit(1);

        const openScriptComments = await db
          .select({ id: comments.id, textRange: comments.textRange })
          .from(comments)
          .where(
            and(
              eq(comments.videoId, videoId),
              eq(comments.phase, "script"),
              eq(comments.isResolved, false),
            ),
          );

        const outdatedCommentIds = openScriptComments
          .filter((comment) => {
            if (!comment.textRange) return false;
            try {
              const textRange = JSON.parse(comment.textRange) as { quote?: string };
              return (
                !!textRange.quote &&
                !plainText.includes(textRange.quote.replace(/\s+/g, " ").trim())
              );
            } catch {
              return false;
            }
          })
          .map((comment) => comment.id);

        if (existing[0]) {
          await db
            .update(scripts)
            .set({ content, plainText, updatedAt: now })
            .where(eq(scripts.videoId, videoId));
        } else {
          await db.insert(scripts).values({
            id: crypto.randomUUID(),
            videoId,
            content,
            plainText,
            createdBy: user.id,
            createdAt: now,
            updatedAt: now,
          });
        }

        for (const commentId of outdatedCommentIds) {
          await db
            .update(comments)
            .set({
              isResolved: true,
              resolvedBy: user.id,
              resolvedAt: now,
              resolvedReason: "text_edited",
            })
            .where(eq(comments.id, commentId));
        }

        const scriptRows = await db
          .select()
          .from(scripts)
          .where(eq(scripts.videoId, videoId))
          .limit(1);

        return { script: scriptRows[0], resolvedCommentIds: outdatedCommentIds };
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

        const video = await getMergedVideoById(db, videoId);

        if (!video) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        if (video.phase === "published") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Cannot comment on published videos",
          });
        }

        const role = await verifySpaceAccess(db, user.id, video.spaceId);
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
              send: (msg) => sendEmail(env, msg),
              from: env.OTP_EMAIL_FROM,
              baseUrl: getCanonicalBaseUrl(env),
            },
            env,
            context.locals.cfContext,
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

        context.locals.cfContext.waitUntil(
          broadcastNewComment(env, videoId, responseComment),
        );

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

        if (!comment[0].parentId) {
          const replyIds = await db
            .select({ id: comments.id })
            .from(comments)
            .where(eq(comments.parentId, commentId));
          if (replyIds.length > 0) {
            await db
              .delete(commentReactions)
              .where(
                inArray(
                  commentReactions.commentId,
                  replyIds.map((r) => r.id),
                ),
              );
            await db.delete(comments).where(eq(comments.parentId, commentId));
          }
        }

        await db
          .delete(commentReactions)
          .where(eq(commentReactions.commentId, commentId));
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
              send: (msg) => sendEmail(env, msg),
              from: env.OTP_EMAIL_FROM,
              baseUrl: getCanonicalBaseUrl(env),
            },
            env,
            context.locals.cfContext,
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

        context.locals.cfContext.waitUntil(
          broadcastNewComment(env, parent[0].videoId, responseComment),
        );

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
          .select({ spaceId: videos.spaceId, phase: projects.phase })
          .from(videos)
          .innerJoin(projects, eq(projects.id, videos.projectId))
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

        context.locals.cfContext.waitUntil(
          broadcastCommentReactions(env, comment[0].videoId, {
            commentId,
            reactions: reactions.map((reaction) => ({
              ...reaction,
              reactedByMe: false,
            })),
          }),
        );

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

        // Delete Stream assets before the DB cascade removes the rows that
        // reference them, otherwise the Stream videos are leaked permanently.
        const spaceVideos = await db
          .select({ streamVideoId: videos.streamVideoId })
          .from(videos)
          .where(eq(videos.spaceId, id));

        for (const video of spaceVideos) {
          if (!video.streamVideoId) continue;
          try {
            await deleteStreamVideo(
              env.STREAM_ACCOUNT_ID,
              env.STREAM_API_TOKEN,
              video.streamVideoId,
            );
          } catch (err) {
            console.error(
              `Failed to delete Stream video ${video.streamVideoId} during space ${id} deletion:`,
              err,
            );
          }
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
          token: generateInviteToken(),
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
        const inviteUrl = new URL(invitePath, getCanonicalBaseUrl(env)).toString();
        const email = buildInviteEmail({
          inviteUrl,
          inviterName: user.name,
          spaceName: space[0].name,
        });

        try {
          await sendEmail(env, {
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
          context.locals.cfContext.waitUntil(
            broadcastNotification(env, existingUser[0].id, {
              kind: "invite",
              id: invite.id,
              title: `${user.name} invited you to ${space[0].name}`,
              href: "/notifications",
              createdAt: new Date().toISOString(),
            }),
          );
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

    acceptInvite: defineAction({
      input: z.object({
        token: z.string().min(1),
      }),
      handler: async ({ token }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const invite = await db
          .select()
          .from(spaceInvites)
          .where(eq(spaceInvites.token, token))
          .limit(1);

        if (invite.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Invite not found" });
        }

        const inv = invite[0];

        if (inv.status !== "pending") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: `Invite has already been ${inv.status}`,
          });
        }

        if (user.email.toLowerCase() !== inv.email.toLowerCase()) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "This invite was sent to a different email address",
          });
        }

        const existingMembership = await db
          .select({ id: spaceMembers.id })
          .from(spaceMembers)
          .where(
            and(
              eq(spaceMembers.spaceId, inv.spaceId),
              eq(spaceMembers.userId, user.id),
            ),
          )
          .limit(1);

        if (existingMembership.length === 0) {
          await db.insert(spaceMembers).values({
            id: crypto.randomUUID(),
            spaceId: inv.spaceId,
            userId: user.id,
            role: "member",
          });
        }

        await db
          .update(spaceInvites)
          .set({ status: "accepted", acceptedAt: new Date().toISOString() })
          .where(eq(spaceInvites.id, inv.id));

        return { success: true, spaceId: inv.spaceId };
      },
    }),

    declineInvite: defineAction({
      input: z.object({
        token: z.string().min(1),
      }),
      handler: async ({ token }, context) => {
        requireUser(context);
        const db = createDb(env.DB);

        const invite = await db
          .select()
          .from(spaceInvites)
          .where(eq(spaceInvites.token, token))
          .limit(1);

        if (invite.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Invite not found" });
        }

        const inv = invite[0];

        if (inv.status !== "pending") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: `Invite has already been ${inv.status}`,
          });
        }

        await db
          .update(spaceInvites)
          .set({ status: "declined" })
          .where(eq(spaceInvites.id, inv.id));

        return { success: true };
      },
    }),
  },

  notification: {
    markRead: defineAction({
      input: z.object({
        id: z.string().min(1),
      }),
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const found = await markNotificationRead(db, id, user.id);
        if (!found) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Notification not found",
          });
        }

        return { success: true };
      },
    }),

    markReadByContext: defineAction({
      input: notificationsMarkReadByContextSchema,
      handler: async ({ videoId, tab }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const videoRow = await db
          .select({ spaceId: videos.spaceId })
          .from(videos)
          .where(eq(videos.id, videoId))
          .limit(1);

        if (videoRow.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, videoRow[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const ids = await markNotificationsReadByVideoTab(db, user.id, videoId, tab);

        if (ids.length > 0) {
          context.locals.cfContext.waitUntil(
            broadcastNotificationsRead(env, user.id, ids),
          );
        }

        return { ids, count: ids.length };
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
          .update(projects)
          .set({ folderId: null, updatedAt: now })
          .where(inArray(projects.folderId, ids));
        await db.delete(folders).where(inArray(folders.id, ids));

        return { success: true };
      },
    }),
  },

  brainstorm: {
    create: defineAction({
      input: brainstormCreateSchema,
      handler: async (input, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const role = await verifySpaceAccess(db, user.id, input.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await db.insert(brainstorms).values({
            id,
            spaceId: input.spaceId,
            authorUserId: user.id,
            authorDisplayName: user.name,
            title: input.title.trim(),
            notes: input.notes?.trim() ?? "",
            status: "open",
            promotedProjectId: null,
            createdAt: now,
            updatedAt: now,
          });
        } catch (error) {
          console.error("[brainstorm.create] insert failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save the idea. Please try again.",
          });
        }

        return { id };
      },
    }),

    update: defineAction({
      input: brainstormUpdateSchema,
      handler: async (input, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await getBrainstormById(db, input.id);
        if (!current) {
          throw new ActionError({ code: "NOT_FOUND", message: "Idea not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const isAuthor = current.authorUserId === user.id;
        const isOwner = role === "owner";
        if (!isAuthor && !isOwner) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const patch: Partial<typeof brainstorms.$inferInsert> = {
          updatedAt: new Date().toISOString(),
        };
        if (input.title !== undefined) patch.title = input.title.trim();
        if (input.notes !== undefined) patch.notes = input.notes;

        try {
          await db
            .update(brainstorms)
            .set(patch)
            .where(eq(brainstorms.id, input.id));
        } catch (error) {
          console.error("[brainstorm.update] update failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update the idea. Please try again.",
          });
        }

        return { success: true };
      },
    }),

    archive: defineAction({
      input: brainstormStatusUpdateSchema,
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await getBrainstormById(db, id);
        if (!current) {
          throw new ActionError({ code: "NOT_FOUND", message: "Idea not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const isAuthor = current.authorUserId === user.id;
        const isOwner = role === "owner";
        if (!isAuthor && !isOwner) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (current.status === "promoted") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Promoted ideas can't be archived.",
          });
        }

        try {
          await db
            .update(brainstorms)
            .set({ status: "archived", updatedAt: new Date().toISOString() })
            .where(eq(brainstorms.id, id));
        } catch (error) {
          console.error("[brainstorm.archive] update failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to archive the idea. Please try again.",
          });
        }

        return { success: true };
      },
    }),

    unarchive: defineAction({
      input: brainstormStatusUpdateSchema,
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await getBrainstormById(db, id);
        if (!current) {
          throw new ActionError({ code: "NOT_FOUND", message: "Idea not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const isAuthor = current.authorUserId === user.id;
        const isOwner = role === "owner";
        if (!isAuthor && !isOwner) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (current.status !== "archived") {
          return { success: true };
        }

        try {
          await db
            .update(brainstorms)
            .set({ status: "open", updatedAt: new Date().toISOString() })
            .where(eq(brainstorms.id, id));
        } catch (error) {
          console.error("[brainstorm.unarchive] update failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to restore the idea. Please try again.",
          });
        }

        return { success: true };
      },
    }),

    delete: defineAction({
      input: brainstormStatusUpdateSchema,
      handler: async ({ id }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await getBrainstormById(db, id);
        if (!current) {
          return { success: true };
        }

        const role = await verifySpaceAccess(db, user.id, current.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const isAuthor = current.authorUserId === user.id;
        const isOwner = role === "owner";
        if (!isAuthor && !isOwner) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        try {
          await db.delete(brainstorms).where(eq(brainstorms.id, id));
        } catch (error) {
          console.error("[brainstorm.delete] delete failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to delete the idea. Please try again.",
          });
        }

        return { success: true };
      },
    }),

    toggleReaction: defineAction({
      input: brainstormReactionToggleSchema,
      handler: async ({ brainstormId, emoji }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await getBrainstormById(db, brainstormId);
        if (!current) {
          throw new ActionError({ code: "NOT_FOUND", message: "Idea not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        try {
          const reactions = await toggleBrainstormReaction(db, brainstormId, emoji, {
            userId: user.id,
            name: user.name,
          });
          return { reactions };
        } catch (error) {
          console.error("[brainstorm.toggleReaction] failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save your reaction. Please try again.",
          });
        }
      },
    }),

    markPromoted: defineAction({
      input: brainstormMarkPromotedSchema,
      handler: async ({ id, videoId }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        const current = await getBrainstormById(db, id);
        if (!current) {
          throw new ActionError({ code: "NOT_FOUND", message: "Idea not found" });
        }

        const role = await verifySpaceAccess(db, user.id, current.spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        if (current.status === "promoted") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "This idea is already linked to a project.",
          });
        }

        const linkedVideo = await db
          .select({ projectId: videos.projectId, spaceId: videos.spaceId })
          .from(videos)
          .where(eq(videos.id, videoId))
          .limit(1);

        if (linkedVideo.length === 0 || linkedVideo[0].spaceId !== current.spaceId) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "That project doesn't belong to this space.",
          });
        }

        try {
          await db
            .update(brainstorms)
            .set({
              status: "promoted",
              promotedProjectId: linkedVideo[0].projectId,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(brainstorms.id, id));
        } catch (error) {
          console.error("[brainstorm.markPromoted] update failed:", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to link the idea to the project. Please try again.",
          });
        }

        return { success: true };
      },
    }),
  },

  share: {
    create: defineAction({
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

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, videoResult[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        // Replace any existing share link so the previous URL is invalidated.
        await db.delete(shareLinks).where(eq(shareLinks.videoId, videoId));

        const shareLinkId = crypto.randomUUID();
        const token = generateShareToken();

        await db.insert(shareLinks).values({
          id: shareLinkId,
          videoId,
          token,
          status: "active",
          viewCount: 0,
        });

        const result = await db
          .select()
          .from(shareLinks)
          .where(eq(shareLinks.id, shareLinkId))
          .limit(1);

        return { shareLink: result[0] };
      },
    }),

    revoke: defineAction({
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

        if (videoResult.length === 0) {
          throw new ActionError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const role = await verifySpaceAccess(db, user.id, videoResult[0].spaceId);
        if (!role) {
          throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        await db.delete(shareLinks).where(eq(shareLinks.videoId, videoId));

        return { success: true };
      },
    }),
  },
};
