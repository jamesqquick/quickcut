import { count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { comments, projects, videos } from "../db/schema";

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
  projectId: string;
}

export async function getVideoVersions(
  db: Database,
  video: VersionContext,
): Promise<VersionSummary[]> {
  const rows = await db
    .select({
      video: videos,
      projectTitle: projects.title,
    })
    .from(videos)
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .where(eq(videos.projectId, video.projectId))
    .orderBy(desc(videos.versionNumber));

  const versionIds = rows.map((row) => row.video.id);
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

  return rows.map(({ video: version, projectTitle }) => ({
    id: version.id,
    title: projectTitle,
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
