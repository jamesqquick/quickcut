export const TRANSCRIPT_GENERATION_FLAG = "transcript-generation";

interface FlagUser {
  id: string;
  email: string;
}

export async function isTranscriptGenerationEnabled(
  env: Env,
  user: FlagUser | null | undefined,
): Promise<boolean> {
  if (!user) return false;
  if (env.TRANSCRIPTS_ENABLED === "false") return false;

  try {
    return await env.FLAGS.getBooleanValue(TRANSCRIPT_GENERATION_FLAG, false, {
      userId: user.id,
      email: user.email,
    });
  } catch {
    return false;
  }
}
