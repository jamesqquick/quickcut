import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { sessions, videos, shareLinks, spaceMembers } from "../db/schema";
import * as schema from "../db/schema";
import type { Database } from "../db";

export type VideoAccess =
  | { ok: true; videoId: string; spaceId: string; identity: { type: "user"; userId: string } | { type: "anonymous" } }
  | { ok: false; status: number; error: string };

type AuthEnv = Pick<Cloudflare.Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "EMAIL" | "OTP_EMAIL_FROM">;

function isCloudflareEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@cloudflare.com");
}

function getOtpEmailSubject(type: "sign-in" | "email-verification" | "forget-password" | "change-email"): string {
  switch (type) {
    case "sign-in":
      return "Your Quick Cuts sign-in code";
    case "email-verification":
      return "Verify your Quick Cuts email";
    case "forget-password":
      return "Reset your Quick Cuts password";
    case "change-email":
      return "Confirm your Quick Cuts email change";
  }
}

function getOtpEmailBody(otp: string, type: "sign-in" | "email-verification" | "forget-password" | "change-email") {
  const subject = getOtpEmailSubject(type);
  const text = `${subject}\n\nUse this code to continue: ${otp}\n\nThis code expires in 5 minutes. If you did not request this, you can ignore this email.`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">${subject}</h1>
      <p style="margin: 0 0 16px;">Use this code to continue:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 0 0 16px;">${otp}</p>
      <p style="margin: 0; color: #6b7280;">This code expires in 5 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
}

export function createAuth(d1: D1Database, env: AuthEnv) {
  const db = drizzle(d1, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      usePlural: true,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    user: {
      modelName: "users",
    },
    session: {
      modelName: "sessions",
    },
    account: {
      modelName: "accounts",
    },
    plugins: [
      emailOTP({
        expiresIn: 300,
        allowedAttempts: 3,
        async sendVerificationOTP({ email, otp, type }) {
          const normalizedEmail = email.trim().toLowerCase();

          if (!isCloudflareEmail(normalizedEmail)) {
            throw new Error("Only Cloudflare accounts are allowed");
          }

          const { subject, text, html } = getOtpEmailBody(otp, type);

          await env.EMAIL.send({
            to: normalizedEmail,
            from: env.OTP_EMAIL_FROM,
            subject,
            text,
            html,
          });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.email || !isCloudflareEmail(user.email)) {
              throw new Error("Only Cloudflare accounts are allowed");
            }
            return user;
          },
          after: async (user, db) => {
            // Create default "Personal" space for new users
            const spaceId = crypto.randomUUID();
            const drizzleDb = drizzle(d1, { schema });

            await drizzleDb.insert(schema.spaces).values({
              id: spaceId,
              name: "Personal",
              ownerId: user.id,
              requiredApprovals: 0,
            });

            await drizzleDb.insert(schema.spaceMembers).values({
              id: crypto.randomUUID(),
              spaceId,
              userId: user.id,
              role: "owner",
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

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

  // 2. Authenticated path: validate the session cookie via Better Auth's
  //    token-based session lookup.
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies["better-auth.session_token"];

  if (sessionToken) {
    const now = new Date();
    const sessionRow = await db
      .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.token, sessionToken))
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
