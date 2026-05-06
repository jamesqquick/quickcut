import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db";
import { brainstormReactions, brainstorms, projects } from "../db/schema";
import {
  BRAINSTORM_REACTION_EMOJIS,
  type BrainstormItem,
  type BrainstormReactionEmoji,
  type BrainstormReactionSummary,
  type BrainstormStatus,
} from "../types";

export type BrainstormRow = typeof brainstorms.$inferSelect;

export function isBrainstormReactionEmoji(
  emoji: string,
): emoji is BrainstormReactionEmoji {
  return BRAINSTORM_REACTION_EMOJIS.includes(emoji as BrainstormReactionEmoji);
}

export interface BrainstormReactor {
  userId: string;
  name: string;
}

export async function getBrainstormById(
  db: Database,
  id: string,
): Promise<BrainstormRow | null> {
  const rows = await db
    .select()
    .from(brainstorms)
    .where(eq(brainstorms.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getBrainstormsForSpace(
  db: Database,
  spaceId: string,
  reactor?: BrainstormReactor,
): Promise<BrainstormItem[]> {
  const rows = await db
    .select({
      brainstorm: brainstorms,
      promotedTitle: projects.title,
    })
    .from(brainstorms)
    .leftJoin(projects, eq(projects.id, brainstorms.promotedProjectId))
    .where(eq(brainstorms.spaceId, spaceId))
    .orderBy(desc(brainstorms.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.brainstorm.id);
  const summariesById = await getReactionSummaries(db, ids, reactor);

  const items: BrainstormItem[] = rows.map((row) => {
    const summaries = summariesById[row.brainstorm.id] ?? [];
    const reactionCount = summaries.reduce((sum, s) => sum + s.count, 0);
    return {
      id: row.brainstorm.id,
      spaceId: row.brainstorm.spaceId,
      authorUserId: row.brainstorm.authorUserId,
      authorDisplayName: row.brainstorm.authorDisplayName,
      title: row.brainstorm.title,
      notes: row.brainstorm.notes,
      status: row.brainstorm.status as BrainstormStatus,
      promotedProjectId: row.brainstorm.promotedProjectId,
      promotedProjectTitle: row.promotedTitle ?? null,
      createdAt: row.brainstorm.createdAt,
      updatedAt: row.brainstorm.updatedAt,
      reactionCount,
      reactions: summaries,
    };
  });

  items.sort((a, b) => {
    if (b.reactionCount !== a.reactionCount) {
      return b.reactionCount - a.reactionCount;
    }
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  return items;
}

async function getReactionSummaries(
  db: Database,
  brainstormIds: string[],
  reactor?: BrainstormReactor,
): Promise<Record<string, BrainstormReactionSummary[]>> {
  if (brainstormIds.length === 0) return {};

  const rows = await db
    .select({
      brainstormId: brainstormReactions.brainstormId,
      emoji: brainstormReactions.emoji,
      reactorUserId: brainstormReactions.reactorUserId,
    })
    .from(brainstormReactions)
    .where(inArray(brainstormReactions.brainstormId, brainstormIds))
    .orderBy(asc(brainstormReactions.createdAt));

  const counts = new Map<string, number>();
  const mine = new Set<string>();

  for (const row of rows) {
    if (!isBrainstormReactionEmoji(row.emoji)) continue;
    const key = `${row.brainstormId}:${row.emoji}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (reactor && row.reactorUserId === reactor.userId) {
      mine.add(key);
    }
  }

  const result: Record<string, BrainstormReactionSummary[]> = {};
  for (const id of brainstormIds) {
    result[id] = BRAINSTORM_REACTION_EMOJIS.flatMap((emoji) => {
      const key = `${id}:${emoji}`;
      const count = counts.get(key) ?? 0;
      const reactedByMe = mine.has(key);
      if (count === 0 && !reactedByMe) return [];
      return [{ emoji, count, reactedByMe }];
    });
  }
  return result;
}

export async function getBrainstormReactionSummary(
  db: Database,
  brainstormId: string,
  reactor?: BrainstormReactor,
): Promise<BrainstormReactionSummary[]> {
  const map = await getReactionSummaries(db, [brainstormId], reactor);
  return map[brainstormId] ?? [];
}

export async function toggleBrainstormReaction(
  db: Database,
  brainstormId: string,
  emoji: BrainstormReactionEmoji,
  reactor: BrainstormReactor,
): Promise<BrainstormReactionSummary[]> {
  const existing = await db
    .select({ id: brainstormReactions.id })
    .from(brainstormReactions)
    .where(
      and(
        eq(brainstormReactions.brainstormId, brainstormId),
        eq(brainstormReactions.emoji, emoji),
        eq(brainstormReactions.reactorUserId, reactor.userId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(brainstormReactions)
      .where(eq(brainstormReactions.id, existing[0].id));
  } else {
    try {
      await db.insert(brainstormReactions).values({
        id: crypto.randomUUID(),
        brainstormId,
        emoji,
        reactorUserId: reactor.userId,
        reactorDisplayName: reactor.name,
      });
    } catch (err) {
      const dup = await db
        .select({ id: brainstormReactions.id })
        .from(brainstormReactions)
        .where(
          and(
            eq(brainstormReactions.brainstormId, brainstormId),
            eq(brainstormReactions.emoji, emoji),
            eq(brainstormReactions.reactorUserId, reactor.userId),
          ),
        )
        .limit(1);
      if (dup.length === 0) throw err;
    }
  }

  return getBrainstormReactionSummary(db, brainstormId, reactor);
}
