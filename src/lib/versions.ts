import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { comments, videos } from "../db/schema";

export interface VersionSummary {
  id: string;
  title: string;
  status: string;
  thumbnailUrl: string | null;
  duration: number | null;
  versionNumber: number;
  isCurrentVersion: boolean;
  createdAt: string;
  commentCount: number;
  versionNotes: string | null;
}

interface VersionContext {
  id: string;
  spaceId: string;
  versionGroupId: string | null;
}

export async function getVideoVersions(
  db: Database,
  video: VersionContext,
): Promise<VersionSummary[]> {
  const versionGroupId = video.versionGroupId || video.id;

  const versionRows = await db
    .select()
    .from(videos)
    .where(
      and(
        eq(videos.spaceId, video.spaceId),
        eq(videos.versionGroupId, versionGroupId),
      ),
    )
    .orderBy(desc(videos.versionNumber));

  const versionIds = versionRows.map((version) => version.id);
  let commentCounts: Record<string, number> = {};

  if (versionIds.length > 0) {
    const counts = await db
      .select({ videoId: comments.videoId, count: count() })
      .from(comments)
      .where(
        sql`${comments.videoId} IN (${sql.join(
          versionIds.map((versionId) => sql`${versionId}`),
          sql`, `,
        )})`,
      )
      .groupBy(comments.videoId);

    commentCounts = Object.fromEntries(
      counts.map((row) => [row.videoId, row.count]),
    );
  }

  return versionRows.map((version) => ({
    id: version.id,
    title: version.title,
    status: version.status,
    thumbnailUrl: version.thumbnailUrl,
    duration: version.duration,
    versionNumber: version.versionNumber,
    isCurrentVersion: version.isCurrentVersion,
    createdAt: version.createdAt,
    commentCount: commentCounts[version.id] || 0,
    versionNotes: version.versionNotes ?? null,
  }));
}
