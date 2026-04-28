import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { createDb } from "../../../db";
import { folders, videos, spaceMembers } from "../../../db/schema";
import { folderCreateSchema } from "../../../lib/validation";
import { getDefaultSpaceForUser, verifySpaceAccess } from "../../../lib/spaces";

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const parentId = url.searchParams.get("parentId");
  const requestedSpaceId = url.searchParams.get("space");

  // Get all space IDs the user belongs to
  const memberRows = await db
    .select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, locals.user.id));
  const spaceIds = memberRows.map((r) => r.spaceId);

  if (spaceIds.length === 0) {
    return new Response(
      JSON.stringify({ folders: [] }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const targetSpaceIds = requestedSpaceId ? spaceIds.filter((id) => id === requestedSpaceId) : spaceIds;
  if (requestedSpaceId && targetSpaceIds.length === 0) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const spaceFilter = inArray(folders.spaceId, targetSpaceIds);
  const where = parentId
    ? parentId === "root"
      ? and(spaceFilter, isNull(folders.parentId))
      : and(spaceFilter, eq(folders.parentId, parentId))
    : spaceFilter;

  const userFolders = await db.select().from(folders).where(where).orderBy(folders.name);
  const folderIds = userFolders.map((folder) => folder.id);

  let counts: Record<string, number> = {};
  let thumbnails: Record<string, string[]> = {};

  if (folderIds.length > 0) {
    const videoCounts = await db
      .select({ folderId: videos.folderId, count: count() })
      .from(videos)
      .where(inArray(videos.folderId, folderIds))
      .groupBy(videos.folderId);

    counts = Object.fromEntries(
      videoCounts.map((row) => [row.folderId ?? "", row.count]),
    );

    const folderVideos = await db
      .select({ folderId: videos.folderId, thumbnailUrl: videos.thumbnailUrl })
      .from(videos)
      .where(inArray(videos.folderId, folderIds));

    thumbnails = folderVideos.reduce<Record<string, string[]>>((acc, video) => {
      if (!video.folderId || !video.thumbnailUrl) return acc;
      acc[video.folderId] = acc[video.folderId] || [];
      if (acc[video.folderId].length < 4) acc[video.folderId].push(video.thumbnailUrl);
      return acc;
    }, {});
  }

  return new Response(
    JSON.stringify({
      folders: userFolders.map((folder) => ({
        ...folder,
        videoCount: counts[folder.id] || 0,
        thumbnails: thumbnails[folder.id] || [],
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = folderCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const parentId = parsed.data.parentId ?? null;

  const defaultSpace = parsed.data.spaceId ? null : await getDefaultSpaceForUser(db, locals.user.id);
  const targetSpaceId = parsed.data.spaceId ?? defaultSpace?.id;
  if (!targetSpaceId) {
    return new Response(JSON.stringify({ error: "No space found for user" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const role = await verifySpaceAccess(db, locals.user.id, targetSpaceId);
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (parentId) {
    const parent = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, parentId), eq(folders.spaceId, targetSpaceId)))
      .limit(1);

    if (parent.length === 0) {
      return new Response(JSON.stringify({ error: "Parent folder not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const id = crypto.randomUUID();
  await db.insert(folders).values({
    id,
    spaceId: targetSpaceId,
    name: parsed.data.name,
    parentId,
  });

  const created = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  return new Response(JSON.stringify({ folder: created[0] }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
