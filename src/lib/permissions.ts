import { ActionError } from "astro:actions";
import type { Database } from "../db";
import { verifySpaceAccess, type SpaceRole } from "./spaces";

export interface ProjectPermissions {
  role: SpaceRole;
  isSpaceOwner: boolean;
  isProjectCreator: boolean;
  canManage: boolean;
}

export async function getProjectPermissions(
  db: Database,
  userId: string,
  project: { spaceId: string; projectOwnerId: string | null },
): Promise<ProjectPermissions | null> {
  const role = await verifySpaceAccess(db, userId, project.spaceId);
  if (!role) return null;
  const isSpaceOwner = role === "owner";
  const isProjectCreator = project.projectOwnerId === userId;
  return {
    role,
    isSpaceOwner,
    isProjectCreator,
    canManage: isSpaceOwner || isProjectCreator,
  };
}

export function requireSpaceAccess(
  perms: ProjectPermissions | null,
): asserts perms is ProjectPermissions {
  if (!perms) {
    throw new ActionError({ code: "FORBIDDEN", message: "Forbidden" });
  }
}

export function requireProjectManage(
  perms: ProjectPermissions | null,
): asserts perms is ProjectPermissions & { canManage: true } {
  requireSpaceAccess(perms);
  if (!perms.canManage) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Forbidden",
    });
  }
}
