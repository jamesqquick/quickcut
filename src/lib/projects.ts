import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db";
import { projects, videos } from "../db/schema";

export type ProjectRow = typeof projects.$inferSelect;
export type VideoRow = typeof videos.$inferSelect;

/**
 * The shape every read site expects: the version row joined with its
 * owning project. Project-level fields are sourced from `projects`
 * (the source of truth after #121). The flat property names match
 * the legacy "video" shape so React components don't change.
 */
export type MergedVideo = VideoRow & {
  title: string;
  description: string | null;
  phase: ProjectRow["phase"];
  targetDate: string | null;
  targetAudience: string | null;
  hook: string | null;
  takeaway1: string | null;
  takeaway2: string | null;
  takeaway3: string | null;
  primaryCta: string | null;
  outro: string | null;
  folderId: string | null;
};

const PROJECT_OVERRIDE_COLUMNS = {
  title: projects.title,
  description: projects.description,
  phase: projects.phase,
  targetDate: projects.targetDate,
  targetAudience: projects.targetAudience,
  hook: projects.hook,
  takeaway1: projects.takeaway1,
  takeaway2: projects.takeaway2,
  takeaway3: projects.takeaway3,
  primaryCta: projects.primaryCta,
  outro: projects.outro,
  folderId: projects.folderId,
} as const;

type ProjectOverrideRow = {
  [K in keyof typeof PROJECT_OVERRIDE_COLUMNS]: ProjectRow[K];
};

function mergeRow(video: VideoRow, project: ProjectOverrideRow): MergedVideo {
  return { ...video, ...project };
}

export async function getMergedVideoById(
  db: Database,
  id: string,
): Promise<MergedVideo | null> {
  const rows = await db
    .select({ video: videos, project: PROJECT_OVERRIDE_COLUMNS })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(eq(videos.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return mergeRow(row.video, row.project);
}

interface CurrentVideoListOptions {
  spaceIds: string[];
  folderId?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * List the current version of every project visible to a user. Filters
 * by folder when `folderId` is provided ("root" → folderId IS NULL).
 */
export async function listCurrentMergedVideos(
  db: Database,
  options: CurrentVideoListOptions,
): Promise<{ rows: MergedVideo[]; total: number }> {
  const { spaceIds, folderId, limit, offset } = options;
  if (spaceIds.length === 0) return { rows: [], total: 0 };

  const folderFilter =
    folderId === undefined || folderId === null
      ? null
      : folderId === "root"
        ? isNull(projects.folderId)
        : eq(projects.folderId, folderId);

  const where = and(
    inArray(videos.spaceId, spaceIds),
    eq(videos.isCurrentVersion, true),
    ...(folderFilter ? [folderFilter] : []),
  );

  let query = db
    .select({ video: videos, project: PROJECT_OVERRIDE_COLUMNS })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(where)
    .orderBy(desc(videos.createdAt));

  if (typeof limit === "number") query = query.limit(limit) as typeof query;
  if (typeof offset === "number") query = query.offset(offset) as typeof query;

  const rows = await query;

  const totalRow = await db
    .select({ count: count() })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(where);

  return {
    rows: rows.map((row) => mergeRow(row.video, row.project)),
    total: totalRow[0]?.count ?? 0,
  };
}

/**
 * Count of versions per project.
 */
export async function getVersionCountsByProjectId(
  db: Database,
  projectIds: string[],
): Promise<Record<string, number>> {
  const unique = [...new Set(projectIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {};

  const rows = await db
    .select({ projectId: videos.projectId, count: count() })
    .from(videos)
    .where(inArray(videos.projectId, unique))
    .groupBy(videos.projectId);

  return Object.fromEntries(
    rows.map((row) => [row.projectId, row.count] as const),
  );
}

/**
 * Count current-version videos per folder, filtered to a space and a
 * set of folder ids.
 */
export async function getCurrentVideoCountsByFolder(
  db: Database,
  spaceId: string,
  folderIds: string[],
): Promise<Record<string, number>> {
  if (folderIds.length === 0) return {};
  const rows = await db
    .select({ folderId: projects.folderId, count: count() })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(
      and(
        eq(videos.spaceId, spaceId),
        eq(videos.isCurrentVersion, true),
        inArray(projects.folderId, folderIds),
      ),
    )
    .groupBy(projects.folderId);

  return Object.fromEntries(
    rows.map((row) => [row.folderId ?? "", row.count] as const),
  );
}

/**
 * Up to 4 thumbnails per folder for the dashboard folder cards.
 */
export async function getCurrentVideoThumbnailsByFolder(
  db: Database,
  spaceId: string,
  folderIds: string[],
): Promise<Record<string, string[]>> {
  if (folderIds.length === 0) return {};
  const rows = await db
    .select({
      folderId: projects.folderId,
      thumbnailUrl: videos.thumbnailUrl,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(
      and(
        eq(videos.spaceId, spaceId),
        eq(videos.isCurrentVersion, true),
        inArray(projects.folderId, folderIds),
      ),
    )
    .orderBy(desc(videos.createdAt));

  return rows.reduce<Record<string, string[]>>((acc, row) => {
    if (!row.folderId || !row.thumbnailUrl) return acc;
    const bucket = acc[row.folderId] ?? [];
    if (bucket.length < 4) bucket.push(row.thumbnailUrl);
    acc[row.folderId] = bucket;
    return acc;
  }, {});
}

export async function getProjectForVideoId(
  db: Database,
  videoId: string,
): Promise<ProjectRow | null> {
  const rows = await db
    .select({ project: projects })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(eq(videos.id, videoId))
    .limit(1);
  return rows[0]?.project ?? null;
}

export type { ProjectRow as Project };
