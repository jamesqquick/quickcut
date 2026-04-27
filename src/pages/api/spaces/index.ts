import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../db";
import { spaces, spaceMembers } from "../../../db/schema";
import { spaceCreateSchema } from "../../../lib/validation";
import { getUserSpaces } from "../../../lib/spaces";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const userSpaces = await getUserSpaces(db, locals.user.id);

  return new Response(JSON.stringify({ spaces: userSpaces }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = spaceCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = createDb(env.DB);
  const spaceId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(spaces).values({
    id: spaceId,
    name: parsed.data.name,
    ownerId: locals.user.id,
    requiredApprovals: parsed.data.requiredApprovals,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(spaceMembers).values({
    id: crypto.randomUUID(),
    spaceId,
    userId: locals.user.id,
    role: "owner",
  });

  const created = await db
    .select()
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);

  return new Response(JSON.stringify({ space: created[0] }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
