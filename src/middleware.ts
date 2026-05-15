import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { createAuth } from "./lib/auth";
import { getCanonicalBaseUrl, getSafeReturnUrl } from "./lib/urls";

// Extend Astro locals type
declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string; name: string; image?: string | null } | null;
      cfContext: ExecutionContext;
    }
  }
}

const protectedRoutes = ["/dashboard", "/notifications", "/settings", "/videos/", "/spaces/"];
const authApiRoutes = ["/api/videos", "/api/comments", "/api/spaces", "/api/invites", "/api/notifications", "/_actions/"];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ORIGIN_CHECK_SKIP_PATTERNS: RegExp[] = [
  /^\/api\/auth\//,
  /^\/api\/webhooks\/stream\/?$/,
  /^\/api\/share\/[^/]+\/comments\/?$/,
  /^\/api\/share\/[^/]+\/view\/?$/,
];

function shouldEnforceOriginCheck(method: string, pathname: string): boolean {
  if (SAFE_METHODS.has(method)) return false;
  const isProtectedScope =
    pathname.startsWith("/api/") || pathname.startsWith("/_actions/");
  if (!isProtectedScope) return false;
  return !ORIGIN_CHECK_SKIP_PATTERNS.some((pattern) => pattern.test(pathname));
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;

  const pathname = context.url.pathname;

  if (shouldEnforceOriginCheck(context.request.method, pathname)) {
    const origin = context.request.headers.get("Origin");
    if (origin && origin !== getCanonicalBaseUrl(env)) {
      return new Response(JSON.stringify({ error: "Cross-origin request blocked" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const auth = createAuth(env.DB, {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    EMAIL: env.EMAIL,
    OTP_EMAIL_FROM: env.OTP_EMAIL_FROM,
    SEND_REAL_EMAILS: env.SEND_REAL_EMAILS,
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

  // Let Better Auth handle its own routes
  if (pathname.startsWith("/api/auth/")) {
    return next();
  }

  // Redirect authenticated users away from auth pages
  if (context.locals.user && (pathname === "/login" || pathname === "/register")) {
    return context.redirect(getSafeReturnUrl(context.url.searchParams.get("returnUrl")) || "/dashboard");
  }

  // Protect routes
  const isProtectedPage = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );
  if (isProtectedPage && !context.locals.user) {
    const params = new URLSearchParams({
      message: "Your session has expired. Please sign in again.",
      returnUrl: `${context.url.pathname}${context.url.search}`,
    });
    return context.redirect(`/login?${params.toString()}`);
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
