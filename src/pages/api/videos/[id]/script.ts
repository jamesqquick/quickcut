import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { comments, scripts, videos } from "../../../../db/schema";
import { scriptUpdateSchema } from "../../../../lib/validation";
import { verifySpaceAccess } from "../../../../lib/spaces";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getProject(db: ReturnType<typeof createDb>, videoId: string) {
  const rows = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  return rows[0] || null;
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const db = createDb(env.DB);
  const project = await getProject(db, id);
  if (!project) return json({ error: "Project not found" }, 404);

  const role = await verifySpaceAccess(db, locals.user.id, project.spaceId);
  if (!role) return json({ error: "Forbidden" }, 403);

  const scriptRows = await db.select().from(scripts).where(eq(scripts.videoId, id)).limit(1);
  return json({ script: scriptRows[0] || null });
};

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const parsed = scriptUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Invalid script" }, 400);

  const db = createDb(env.DB);
  const project = await getProject(db, id);
  if (!project) return json({ error: "Project not found" }, 404);

  if (project.phase === "published") return json({ error: "Cannot edit published scripts" }, 403);

  const role = await verifySpaceAccess(db, locals.user.id, project.spaceId);
  if (!role) return json({ error: "Forbidden" }, 403);

  const now = new Date().toISOString();
  const content = parsed.data.content;
  const plainText = (parsed.data.plainText ?? content).replace(/\s+/g, " ").trim();
  const existing = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.videoId, id)).limit(1);

  const openScriptComments = await db
    .select({ id: comments.id, textRange: comments.textRange })
    .from(comments)
    .where(and(eq(comments.videoId, id), eq(comments.phase, "script"), eq(comments.isResolved, false)));

  const outdatedCommentIds = openScriptComments
    .filter((comment) => {
      if (!comment.textRange) return false;
      try {
        const textRange = JSON.parse(comment.textRange) as { quote?: string };
        return !!textRange.quote && !plainText.includes(textRange.quote.replace(/\s+/g, " ").trim());
      } catch {
        return false;
      }
    })
    .map((comment) => comment.id);

  if (existing[0]) {
    await db
      .update(scripts)
      .set({ content, plainText, updatedAt: now })
      .where(eq(scripts.videoId, id));
  } else {
    await db.insert(scripts).values({
      id: crypto.randomUUID(),
      videoId: id,
      content,
      plainText,
      createdBy: locals.user.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const commentId of outdatedCommentIds) {
    await db
      .update(comments)
      .set({
        isResolved: true,
        resolvedBy: locals.user.id,
        resolvedAt: now,
        resolvedReason: "text_edited",
      })
      .where(eq(comments.id, commentId));
  }

  const scriptRows = await db.select().from(scripts).where(eq(scripts.videoId, id)).limit(1);
  return json({ script: scriptRows[0], resolvedCommentIds: outdatedCommentIds });
};
