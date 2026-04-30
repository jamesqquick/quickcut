import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { spaceInvites, spaces, users } from "../db/schema";

export interface PendingInviteForUser {
  id: string;
  token: string;
  spaceId: string;
  spaceName: string;
  email: string;
  invitedBy: string;
  inviterDisplayName: string;
  inviterEmail: string;
  createdAt: string;
}

export async function getPendingInvitesForUser(
  db: Database,
  email: string,
): Promise<PendingInviteForUser[]> {
  const normalizedEmail = email.trim().toLowerCase();

  const rows = await db
    .select({
      id: spaceInvites.id,
      token: spaceInvites.token,
      spaceId: spaceInvites.spaceId,
      spaceName: spaces.name,
      email: spaceInvites.email,
      invitedBy: spaceInvites.invitedBy,
      inviterDisplayName: users.name,
      inviterEmail: users.email,
      createdAt: spaceInvites.createdAt,
    })
    .from(spaceInvites)
    .innerJoin(spaces, eq(spaceInvites.spaceId, spaces.id))
    .innerJoin(users, eq(spaceInvites.invitedBy, users.id))
    .where(
      and(
        eq(spaceInvites.status, "pending"),
        sql`lower(${spaceInvites.email}) = ${normalizedEmail}`,
      ),
    )
    .orderBy(desc(spaceInvites.createdAt));

  return rows;
}
