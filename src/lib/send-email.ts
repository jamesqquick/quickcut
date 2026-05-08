export interface EmailMessagePayload {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

type SendEmailEnv = Pick<Cloudflare.Env, "EMAIL" | "SEND_REAL_EMAILS">;

function shouldSendRealEmails(env: SendEmailEnv): boolean {
  return (env.SEND_REAL_EMAILS as string | undefined) !== "false";
}

export async function sendEmail(
  env: SendEmailEnv,
  message: EmailMessagePayload,
): Promise<void> {
  if (shouldSendRealEmails(env)) {
    await env.EMAIL.send(message);
    return;
  }

  const divider = "─".repeat(60);
  console.log(`[email:dry-run] ${divider}`);
  console.log(`[email:dry-run] to:      ${message.to}`);
  console.log(`[email:dry-run] from:    ${message.from}`);
  console.log(`[email:dry-run] subject: ${message.subject}`);
  console.log(`[email:dry-run] ${divider}`);
  console.log(`[email:dry-run] text:`);
  console.log(message.text);
  console.log(`[email:dry-run] ${divider}`);
  console.log(`[email:dry-run] html:`);
  console.log(message.html);
  console.log(`[email:dry-run] ${divider}`);
}
