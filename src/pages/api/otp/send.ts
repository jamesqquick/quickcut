import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../db";
import { users } from "../../../db/schema";
import { createAuth } from "../../../lib/auth";

type OtpMode = "login" | "register";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function neutralResponse(): Response {
  return json({ message: "If the account is eligible we sent a code." });
}

function rateLimitedResponse(): Response {
  return json({ error: "Too many requests. Try again in a minute." }, 429);
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    mode?: OtpMode;
  } | null;

  const email = body?.email?.trim().toLowerCase() ?? "";
  const mode = body?.mode;

  if (!email || !mode) {
    return json({ error: "Email and mode are required" }, 400);
  }

  const ip = getClientIp(request);
  const [ipLimit, emailLimit] = await Promise.all([
    env.OTP_RATE_LIMITER.limit({ key: `otp:ip:${ip}` }),
    env.OTP_RATE_LIMITER.limit({ key: `otp:email:${email}` }),
  ]);
  if (!ipLimit.success || !emailLimit.success) {
    return rateLimitedResponse();
  }

  const db = createDb(env.DB);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const accountExists = existing.length > 0;
  const eligible =
    (mode === "login" && accountExists) ||
    (mode === "register" && !accountExists);

  if (!eligible) {
    return neutralResponse();
  }

  const auth = createAuth(env.DB, {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    EMAIL: env.EMAIL,
    OTP_EMAIL_FROM: env.OTP_EMAIL_FROM,
  });

  try {
    await auth.api.sendVerificationOTP({
      body: { email, type: "sign-in" },
    });
  } catch (err) {
    console.error("sendVerificationOTP failed", err);
  }

  return neutralResponse();
};
