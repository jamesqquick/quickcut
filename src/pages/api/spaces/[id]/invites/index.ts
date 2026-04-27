import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createDb } from "../../../../../db";
import { spaceInvites } from "../../../../../db/schema";
import { inviteCreateSchema } from "../../../../../lib/validation";
import { verifySpaceAccess } from "../../../../../lib/spaces";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: spaceId } = params;
  if (!spaceId) {
    return new Response(JSON.stringify({ error: "Space ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, spaceId);
  if (role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const invites = await db
    .select()
    .from(spaceInvites)
    .where(
      and(eq(spaceInvites.spaceId, spaceId), eq(spaceInvites.status, "pending")),
    );

  return new Response(JSON.stringify({ invites }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: spaceId } = params;
  if (!spaceId) {
    return new Response(JSON.stringify({ error: "Space ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = inviteCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, spaceId);
  if (role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check for duplicate pending invite for same email + space
  const existing = await db
    .select({ id: spaceInvites.id })
    .from(spaceInvites)
    .where(
      and(
        eq(spaceInvites.spaceId, spaceId),
        eq(spaceInvites.email, parsed.data.email),
        eq(spaceInvites.status, "pending"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return new Response(
      JSON.stringify({ error: "A pending invite already exists for this email" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  const invite = {
    id: crypto.randomUUID(),
    spaceId,
    email: parsed.data.email,
    invitedBy: locals.user.id,
    token: nanoid(12),
    status: "pending" as const,
  };

  await db.insert(spaceInvites).values(invite);

  const created = await db
    .select()
    .from(spaceInvites)
    .where(eq(spaceInvites.id, invite.id))
    .limit(1);

  return new Response(JSON.stringify({ invite: created[0] }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
