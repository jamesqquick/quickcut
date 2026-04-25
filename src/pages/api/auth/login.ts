import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../db";
import { users } from "../../../db/schema";
import {
  verifyPassword,
  createSession,
  makeSessionCookie,
} from "../../../lib/auth";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, redirect }) => {
  const db = createDb(env.DB);

  let email: string;
  let password: string;
  let rememberMe = false;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    email = body.email?.trim().toLowerCase();
    password = body.password;
    rememberMe = !!body.rememberMe;
  } else {
    const formData = await request.formData();
    email = (formData.get("email") as string)?.trim().toLowerCase();
    password = formData.get("password") as string;
    rememberMe = formData.get("rememberMe") === "on";
  }

  if (!email || !password) {
    return redirect("/login?error=Email and password are required");
  }

  // Find user
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (result.length === 0) {
    return redirect("/login?error=Invalid email or password");
  }

  const user = result[0];

  // Verify password
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return redirect("/login?error=Invalid email or password");
  }

  // Create session
  const sessionId = await createSession(db, user.id, rememberMe);
  const cookie = makeSessionCookie(sessionId, rememberMe);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/dashboard",
      "Set-Cookie": cookie,
    },
  });
};
