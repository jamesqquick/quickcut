import { desc, eq } from "drizzle-orm";
import { projectActivity } from "../db/schema";
import type { Database } from "../db";

export type ProjectActivityType =
  | "project.created"
  | "phase.changed"
  | "target_date.changed"
  | "first_cut.uploaded";

export interface ProjectActivityItem {
  id: string;
  videoId: string;
  actorUserId: string | null;
  actorDisplayName: string;
  type: ProjectActivityType;
  data: Record<string, unknown> | null;
  createdAt: string;
}

interface LogProjectActivityInput {
  videoId: string;
  actorUserId: string | null;
  actorDisplayName: string;
  type: ProjectActivityType;
  data?: Record<string, unknown> | null;
  createdAt?: string;
}

export async function logProjectActivity(
  db: Database,
  input: LogProjectActivityInput,
): Promise<void> {
  try {
    await db.insert(projectActivity).values({
      id: crypto.randomUUID(),
      videoId: input.videoId,
      actorUserId: input.actorUserId,
      actorDisplayName: input.actorDisplayName,
      type: input.type,
      data: input.data ? JSON.stringify(input.data) : null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to log project activity", { videoId: input.videoId, type: input.type, err });
  }
}

export async function getProjectActivity(
  db: Database,
  videoId: string,
): Promise<ProjectActivityItem[]> {
  let rows: Array<typeof projectActivity.$inferSelect> = [];

  try {
    rows = await db
      .select()
      .from(projectActivity)
      .where(eq(projectActivity.videoId, videoId))
      .orderBy(desc(projectActivity.createdAt));
  } catch (err) {
    console.error("Failed to load project activity", { videoId, err });
    return [];
  }

  return rows.map((row) => ({
    ...row,
    type: row.type as ProjectActivityType,
    data: row.data ? JSON.parse(row.data) as Record<string, unknown> : null,
  }));
}
