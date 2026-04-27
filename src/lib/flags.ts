export const TRANSCRIPT_GENERATION_FLAG = "transcript-generation";

interface FlagshipBinding {
  getBooleanValue(
    flagKey: string,
    defaultValue: boolean,
    context?: Record<string, string>,
  ): Promise<boolean>;
}

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

  const flags = (env as Env & { FLAGS?: FlagshipBinding }).FLAGS;
  if (!flags) return false;

  return flags.getBooleanValue(TRANSCRIPT_GENERATION_FLAG, false, {
    userId: user.id,
    email: user.email,
  });
}
