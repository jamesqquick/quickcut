import { defineMiddleware } from "astro:middleware";
import { createDb } from "./db";
import { sessions, users } from "./db/schema";
import { eq, gt } from "drizzle-orm";
import { env } from "cloudflare:workers";

// Extend Astro locals type
declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string; displayName: string } | null;
    }
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) cookies[name] = rest.join("=");
  });
  return cookies;
}

const protectedRoutes = ["/dashboard", "/upload", "/videos/"];
const authApiRoutes = ["/api/videos", "/api/comments"];

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;

  const cookieHeader = context.request.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  const sessionId = cookies["quickcut_session"];

  if (sessionId) {
    try {
      const db = createDb(env.DB);
      const now = new Date().toISOString();

      const result = await db
        .select({
          userId: sessions.userId,
          email: users.email,
          displayName: users.displayName,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (result.length > 0) {
        const session = await db
          .select({ expiresAt: sessions.expiresAt })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);

        if (session.length > 0 && session[0].expiresAt > now) {
          context.locals.user = {
            id: result[0].userId,
            email: result[0].email,
            displayName: result[0].displayName,
          };
        } else {
          // Session expired, clean up
          await db.delete(sessions).where(eq(sessions.id, sessionId));
        }
      }
    } catch {
      // DB error, continue unauthenticated
    }
  }

  const pathname = context.url.pathname;

  // Redirect authenticated users away from login/register
  if (context.locals.user && (pathname === "/login" || pathname === "/register")) {
    return context.redirect("/dashboard");
  }

  // Protect routes
  const isProtectedPage = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );
  if (isProtectedPage && !context.locals.user) {
    return context.redirect("/login?message=Your session has expired. Please sign in again.");
  }

  // Protect API routes. The /live WebSocket upgrade endpoint does its own
  // auth (supporting both session cookies and share-link tokens) so it must
  // bypass the cookie-only check here.
  const isLiveEndpoint =
    /^\/api\/videos\/[^/]+\/live\/?$/.test(pathname);
  const isProtectedApi =
    !isLiveEndpoint &&
    authApiRoutes.some((route) => pathname.startsWith(route));
  if (isProtectedApi && !context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return next();
});
