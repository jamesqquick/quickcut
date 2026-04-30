import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { createAuth } from "./lib/auth";

// Extend Astro locals type
declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string; name: string; image?: string | null } | null;
    }
  }
}

const protectedRoutes = ["/dashboard", "/notifications", "/upload", "/videos/", "/spaces/"];
const authApiRoutes = ["/api/videos", "/api/comments", "/api/spaces", "/api/invites"];

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;

  const auth = createAuth(env.DB, {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    EMAIL: env.EMAIL,
    OTP_EMAIL_FROM: env.OTP_EMAIL_FROM,
  });

  try {
    const session = await auth.api.getSession({
      headers: context.request.headers,
    });

    if (session?.user) {
      context.locals.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      };
    }
  } catch {
    // Auth error, continue unauthenticated
  }

  const pathname = context.url.pathname;

  // Let Better Auth handle its own routes
  if (pathname.startsWith("/api/auth/")) {
    return next();
  }

  // Redirect authenticated users away from login
  if (context.locals.user && pathname === "/login") {
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
