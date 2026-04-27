import { eq, and } from "drizzle-orm";
import { sessions, users, videos, shareLinks, spaceMembers } from "../db/schema";
import type { Database } from "../db";

export type VideoAccess =
  | { ok: true; videoId: string; spaceId: string; identity: { type: "user"; userId: string } | { type: "anonymous" } }
  | { ok: false; status: number; error: string };

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) cookies[name] = rest.join("=");
  });
  return cookies;
}

/**
 * Verify a request is allowed to view a video, either via an authenticated
 * session cookie or via an active share-link token in the query string.
 *
 * Centralized here so middleware-protected HTTP routes and the WebSocket
 * upgrade endpoint share the same access rules.
 */
export async function verifyVideoAccess(
  db: Database,
  request: Request,
  videoId: string,
): Promise<VideoAccess> {
  // 1. Check the video exists.
  const videoRow = await db
    .select({ id: videos.id, spaceId: videos.spaceId })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (videoRow.length === 0) {
    return { ok: false, status: 404, error: "Video not found" };
  }

  const spaceId = videoRow[0].spaceId;

  // 2. Authenticated path: validate the session cookie, then verify the user
  //    is a member of the video's space.
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  const sessionId = cookies["quickcut_session"];

  if (sessionId) {
    const now = new Date().toISOString();
    const sessionRow = await db
      .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (sessionRow.length > 0 && sessionRow[0].expiresAt > now) {
      // Verify user is a member of the video's space.
      const membership = await db
        .select({ role: spaceMembers.role })
        .from(spaceMembers)
        .where(
          and(
            eq(spaceMembers.spaceId, spaceId),
            eq(spaceMembers.userId, sessionRow[0].userId),
          ),
        )
        .limit(1);

      if (membership.length > 0) {
        return {
          ok: true,
          videoId,
          spaceId,
          identity: { type: "user", userId: sessionRow[0].userId },
        };
      }
    }
  }

  // 3. Share-link path: token can be in the URL query string.
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || url.searchParams.get("token");
  if (token) {
    const linkRow = await db
      .select({ videoId: shareLinks.videoId, status: shareLinks.status })
      .from(shareLinks)
      .where(eq(shareLinks.token, token))
      .limit(1);

    if (
      linkRow.length > 0 &&
      linkRow[0].status === "active" &&
      linkRow[0].videoId === videoId
    ) {
      return { ok: true, videoId, spaceId, identity: { type: "anonymous" } };
    }
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const computedHex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computedHex === hashHex;
}

export async function createSession(
  db: Database,
  userId: string,
  rememberMe = false,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const durationMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs).toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return sessionId;
}

export async function deleteSession(
  db: Database,
  sessionId: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function makeSessionCookie(
  sessionId: string,
  rememberMe = false,
): string {
  const maxAge = rememberMe ? 30 * 24 * 3600 : 24 * 3600;
  return [
    `quickcut_session=${sessionId}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `quickcut_session=`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=0`,
  ].join("; ");
}
