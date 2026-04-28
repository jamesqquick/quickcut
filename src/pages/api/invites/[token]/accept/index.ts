import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../../../db";
import { spaceInvites, spaceMembers } from "../../../../../db/schema";

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

  if (locals.user.email.toLowerCase() !== inv.email.toLowerCase()) {
    return new Response(
      JSON.stringify({ error: "This invite was sent to a different email address" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const existingMembership = await db
    .select({ id: spaceMembers.id })
    .from(spaceMembers)
    .where(
      and(
        eq(spaceMembers.spaceId, inv.spaceId),
        eq(spaceMembers.userId, locals.user.id),
      ),
    )
    .limit(1);

  if (existingMembership.length === 0) {
    await db.insert(spaceMembers).values({
      id: crypto.randomUUID(),
      spaceId: inv.spaceId,
      userId: locals.user.id,
      role: "member",
    });
  }

  // Mark invite as accepted
  await db
    .update(spaceInvites)
    .set({ status: "accepted", acceptedAt: new Date().toISOString() })
    .where(eq(spaceInvites.id, inv.id));

  return new Response(
    JSON.stringify({ success: true, spaceId: inv.spaceId }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
