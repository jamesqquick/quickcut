import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../../db";
import { spaceInvites } from "../../../../../db/schema";

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { token } = params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Invite token required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const invite = await db
    .select()
    .from(spaceInvites)
    .where(eq(spaceInvites.token, token))
    .limit(1);

  if (invite.length === 0) {
    return new Response(JSON.stringify({ error: "Invite not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const inv = invite[0];

  if (inv.status !== "pending") {
    return new Response(
      JSON.stringify({ error: `Invite has already been ${inv.status}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  await db
    .update(spaceInvites)
    .set({ status: "declined" })
    .where(eq(spaceInvites.id, inv.id));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
