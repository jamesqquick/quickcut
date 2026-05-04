import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { eq, and, count } from "drizzle-orm";
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
} from "../db/schema";
import {
  videoUpdateSchema,
  phaseSchema,
  approveVideoSchema,
  spaceUpdateSchema,
  inviteCreateSchema,
} from "../lib/validation";
import { verifySpaceAccess } from "../lib/spaces";
import { getApprovalStatus } from "../lib/approvals";
import { deleteVideo as deleteStreamVideo } from "../lib/stream";
import { logProjectActivity } from "../lib/activity";
import { broadcastPhaseChange, broadcastApprovalUpdate } from "../lib/broadcast";
import { buildInviteAuthPath, buildInviteEmail } from "../lib/email";

// Re-export ActionError for convenience
export { ActionError } from "astro:actions";

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
          input.folderId === undefined;

        if (video.phase === "published" && !targetDateOnly) {
          throw new ActionError({ code: "FORBIDDEN", message: "Cannot edit published videos" });
        }

        const updates: { title?: string; description?: string; targetDate?: string | null } = {};
        let folderUpdate: string | null | undefined;

        if (input.title !== undefined) updates.title = input.title.trim();
        if (input.description !== undefined) updates.description = input.description.trim();
        if (input.targetDate !== undefined) updates.targetDate = input.targetDate;
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
      }),
      handler: async ({ id, phase }, context) => {
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

        await broadcastPhaseChange(env, id, {
          videoId: id,
          phase,
          changedBy: user.name,
        });

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

        const status = await getApprovalStatus(db, id, video.spaceId);
        await broadcastApprovalUpdate(env, id, status);

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

        return { approvalStatus: status };
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
};
