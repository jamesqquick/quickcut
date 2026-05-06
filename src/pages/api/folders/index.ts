import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createDb } from "../../../db";
import { folders, spaceMembers } from "../../../db/schema";
import {
  getCurrentVideoCountsByFolder,
  getCurrentVideoThumbnailsByFolder,
} from "../../../lib/projects";

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

  if (folderIds.length > 0 && requestedSpaceId) {
    counts = await getCurrentVideoCountsByFolder(db, requestedSpaceId, folderIds);
    thumbnails = await getCurrentVideoThumbnailsByFolder(db, requestedSpaceId, folderIds);
  } else if (folderIds.length > 0) {
    for (const spaceId of targetSpaceIds) {
      const spaceCounts = await getCurrentVideoCountsByFolder(db, spaceId, folderIds);
      for (const [folderId, count] of Object.entries(spaceCounts)) {
        counts[folderId] = (counts[folderId] ?? 0) + count;
      }
      const spaceThumbnails = await getCurrentVideoThumbnailsByFolder(db, spaceId, folderIds);
      for (const [folderId, urls] of Object.entries(spaceThumbnails)) {
        const bucket = thumbnails[folderId] ?? [];
        for (const url of urls) {
          if (bucket.length < 4 && !bucket.includes(url)) bucket.push(url);
        }
        thumbnails[folderId] = bucket;
      }
    }
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
