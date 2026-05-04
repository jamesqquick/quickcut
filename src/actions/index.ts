import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { users } from "../db/schema";

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
};
