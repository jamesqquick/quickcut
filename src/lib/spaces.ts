import { eq, and, asc } from "drizzle-orm";
import { spaces, spaceMembers, users } from "../db/schema";
import type { Database } from "../db";

export type SpaceRole = "owner" | "member";

export interface SpaceWithRole {
  id: string;
  name: string;
  ownerId: string;
  requiredApprovals: number;
  pipelineEnabled: boolean;
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
      pipelineEnabled: spaces.pipelineEnabled,
      role: spaceMembers.role,
      createdAt: spaces.createdAt,
      updatedAt: spaces.updatedAt,
    })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .where(eq(spaceMembers.userId, userId))
    .orderBy(asc(spaceMembers.createdAt));

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

export interface SpaceMember {
  id: string;
  userId: string;
  role: SpaceRole;
  name: string;
  email: string;
  createdAt: string;
}

/** Return every member of a space joined with their user info. */
export async function getSpaceMembers(
  db: Database,
  spaceId: string,
): Promise<SpaceMember[]> {
  const rows = await db
    .select({
      id: spaceMembers.id,
      userId: spaceMembers.userId,
      role: spaceMembers.role,
      createdAt: spaceMembers.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(spaceMembers.userId, users.id))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(asc(spaceMembers.createdAt));

  return rows as SpaceMember[];
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
