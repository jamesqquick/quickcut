import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAuth } from "../../../lib/auth";

export const ALL: APIRoute = async ({ request }) => {
  const auth = createAuth(env.DB, {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    EMAIL: env.EMAIL,
    OTP_EMAIL_FROM: env.OTP_EMAIL_FROM,
    SEND_REAL_EMAILS: env.SEND_REAL_EMAILS,
  });

  return auth.handler(request);
};
