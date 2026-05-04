import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { users } from "../db/schema";

export const server = {
  getEmailPreference: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) {
        throw new ActionError({ code: "UNAUTHORIZED" });
      }

      const db = createDb(env.DB);
      const rows = await db
        .select({ emailNotificationsEnabled: users.emailNotificationsEnabled })
        .from(users)
        .where(eq(users.id, context.locals.user.id))
        .limit(1);

      if (rows.length === 0) {
        throw new ActionError({ code: "NOT_FOUND", message: "User not found" });
      }

      return { emailNotificationsEnabled: rows[0].emailNotificationsEnabled };
    },
  }),

  setEmailPreference: defineAction({
    input: z.object({
      enabled: z.boolean(),
    }),
    handler: async ({ enabled }, context) => {
      if (!context.locals.user) {
        throw new ActionError({ code: "UNAUTHORIZED" });
      }

      const db = createDb(env.DB);
      await db
        .update(users)
        .set({ emailNotificationsEnabled: enabled })
        .where(eq(users.id, context.locals.user.id));

      return { emailNotificationsEnabled: enabled };
    },
  }),
};
