import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../db";
import { users } from "../../../db/schema";
import { getAuth } from "../../../lib/auth";

type OtpMode = "login" | "register";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as {
    email?: string;
    mode?: OtpMode;
    name?: string;
    otp?: string;
  } | null;

  const email = body?.email?.trim().toLowerCase() ?? "";
  const mode = body?.mode;
  const name = body?.name?.trim() ?? "";
  const otp = body?.otp?.trim() ?? "";

  if (!email || !mode || !otp) {
    return json({ error: "Email, mode, and code are required" }, 400);
  }

  if (mode === "register" && !name) {
    return json({ error: "Name is required" }, 400);
  }

  const db = createDb(env.DB);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (mode === "login" && existing.length === 0) {
    return json({ error: "No account exists for that email. Sign up first." }, 404);
  }

  if (mode === "register" && existing.length > 0) {
    return json({ error: "An account already exists for that email. Sign in instead." }, 409);
  }

  const auth = getAuth(env);

  return auth.api.signInEmailOTP({
    body: {
      email,
      otp,
      ...(mode === "register" ? { name } : {}),
    },
    headers: request.headers,
    asResponse: true,
  });
};
