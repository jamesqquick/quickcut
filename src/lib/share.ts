import { nanoid } from "nanoid";

export function generateShareToken(): string {
  return nanoid(21);
}

export function generateInviteToken(): string {
  return nanoid(24);
}
