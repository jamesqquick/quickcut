import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../db";
import { users } from "../../../db/schema";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const rows = await db
    .select({ emailNotificationsEnabled: users.emailNotificationsEnabled })
    .from(users)
    .where(eq(users.id, locals.user.id))
    .limit(1);

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ emailNotificationsEnabled: rows[0].emailNotificationsEnabled }),
    { headers: { "Content-Type": "application/json" } },
  );
};

export const PUT: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { enabled } = body;

  if (typeof enabled !== "boolean") {
    return new Response(JSON.stringify({ error: "\"enabled\" must be a boolean" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  await db
    .update(users)
    .set({ emailNotificationsEnabled: enabled })
    .where(eq(users.id, locals.user.id));

  return new Response(
    JSON.stringify({ emailNotificationsEnabled: enabled }),
    { headers: { "Content-Type": "application/json" } },
  );
};
