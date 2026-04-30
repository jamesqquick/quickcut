import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../db";
import { users, spaces, spaceMembers } from "../../../db/schema";
import { hashPassword, createSession, makeSessionCookie } from "../../../lib/auth";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, redirect }) => {
  const db = createDb(env.DB);

  let email: string;
  let password: string;
  let confirmPassword: string;
  let displayName: string;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    email = body.email?.trim().toLowerCase();
    password = body.password;
    confirmPassword = body.confirmPassword;
    displayName = body.displayName?.trim();
  } else {
    const formData = await request.formData();
    email = (formData.get("email") as string)?.trim().toLowerCase();
    password = formData.get("password") as string;
    confirmPassword = formData.get("confirmPassword") as string;
    displayName = (formData.get("displayName") as string)?.trim();
  }

  // Validation
  if (!email || !password || !confirmPassword || !displayName) {
    return redirect("/register?error=All fields are required");
  }

  if (!email.endsWith("@cloudflare.com")) {
    return redirect("/register?error=Quick Cuts is currently limited to Cloudflare email addresses");
  }

  if (password.length < 8) {
    return redirect("/register?error=Password must be at least 8 characters");
  }

  if (password !== confirmPassword) {
    return redirect("/register?error=Passwords do not match");
  }

  // Check if email exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return redirect("/register?error=An account with this email already exists");
  }

  // Create user + default Personal space
  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const spaceId = crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    displayName,
  });

  await db.insert(spaces).values({
    id: spaceId,
    name: "Personal",
    ownerId: userId,
    requiredApprovals: 0,
  });

  await db.insert(spaceMembers).values({
    id: crypto.randomUUID(),
    spaceId,
    userId,
    role: "owner",
  });

  // Create session
  const sessionId = await createSession(db, userId);
  const cookie = makeSessionCookie(sessionId);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/dashboard",
      "Set-Cookie": cookie,
    },
  });
};
