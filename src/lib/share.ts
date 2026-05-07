import { nanoid } from "nanoid";

export function generateShareToken(): string {
  return nanoid(22);
}

export function generateInviteToken(): string {
  return nanoid(22);
}
