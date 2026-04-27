import { eq, and } from "drizzle-orm";
import { spaces, spaceMembers } from "../db/schema";
import type { Database } from "../db";

export type SpaceRole = "owner" | "member";

export interface SpaceWithRole {
  id: string;
  name: string;
  ownerId: string;
  requiredApprovals: number;
  role: SpaceRole;
  createdAt: string;
  updatedAt: string;
}

/** Return every space a user belongs to, including their role in each. */
export async function getUserSpaces(
  db: Database,
  userId: string,
): Promise<SpaceWithRole[]> {
  const rows = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      ownerId: spaces.ownerId,
      requiredApprovals: spaces.requiredApprovals,
      role: spaceMembers.role,
      createdAt: spaces.createdAt,
      updatedAt: spaces.updatedAt,
    })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .where(eq(spaceMembers.userId, userId));

  return rows as SpaceWithRole[];
}

/**
 * Check whether a user is a member of a given space.
 * Returns their role if they are, or null if they aren't.
 */
export async function verifySpaceAccess(
  db: Database,
  userId: string,
  spaceId: string,
): Promise<SpaceRole | null> {
  const row = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(
      and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)),
    )
    .limit(1);

  if (row.length === 0) return null;
  return row[0].role as SpaceRole;
}

/**
 * Return the first space the user owns. For users who registered through the
 * normal flow this will be their auto-created "Personal" space.
 */
export async function getDefaultSpaceForUser(
  db: Database,
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const row = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .where(
      and(eq(spaceMembers.userId, userId), eq(spaceMembers.role, "owner")),
    )
    .limit(1);

  return row[0] ?? null;
}
