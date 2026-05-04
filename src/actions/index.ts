import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { users, videos, folders } from "../db/schema";
import { videoUpdateSchema } from "../lib/validation";
import { verifySpaceAccess } from "../lib/spaces";
import { logProjectActivity } from "../lib/activity";

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
      accept: "json",
      input: z.object({
        id: z.string().uuid(),
        data: videoUpdateSchema,
      }),
      handler: async ({ id, data }, context) => {
        const user = requireUser(context);
        const db = createDb(env.DB);

        // Verify video exists
        const videoResult = await db
          .select()
          .from(videos)
          .where(eq(videos.id, id))
          .limit(1);

        if (videoResult.length === 0) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Video not found",
          });
        }

        const video = videoResult[0];

        // Verify user has space access
        const role = await verifySpaceAccess(db, user.id, video.spaceId);
        if (!role) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "You do not have access to this video",
          });
        }

        const targetDateOnly =
          data.targetDate !== undefined &&
          data.title === undefined &&
          data.description === undefined &&
          data.folderId === undefined;

        // Published videos stay locked, but launch-date scheduling remains editable
        if (video.phase === "published" && !targetDateOnly) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Cannot edit published videos",
          });
        }

        const updates: { title?: string; description?: string; targetDate?: string | null } = {};
        let folderUpdate: string | null | undefined;

        if (data.title !== undefined) updates.title = data.title.trim();
        if (data.description !== undefined) updates.description = data.description.trim();
        if (data.targetDate !== undefined) updates.targetDate = data.targetDate;
        if (data.folderId !== undefined) {
          const folderId = data.folderId ?? null;

          if (folderId) {
            const folder = await db
              .select({ id: folders.id })
              .from(folders)
              .where(and(eq(folders.id, folderId), eq(folders.spaceId, video.spaceId)))
              .limit(1);

            if (folder.length === 0) {
              throw new ActionError({
                code: "NOT_FOUND",
                message: "Folder not found",
              });
            }
          }

          folderUpdate = folderId;
        }

        if (Object.keys(updates).length === 0 && folderUpdate === undefined) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "No updates provided",
          });
        }

        const now = new Date().toISOString();

        if (Object.keys(updates).length > 0) {
          await db
            .update(videos)
            .set({ ...updates, updatedAt: now })
            .where(eq(videos.id, id));

          if (data.targetDate !== undefined && data.targetDate !== video.targetDate) {
            await logProjectActivity(db, {
              videoId: id,
              actorUserId: user.id,
              actorDisplayName: user.name,
              type: "target_date.changed",
              data: { from: video.targetDate, to: data.targetDate },
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
  },
};
