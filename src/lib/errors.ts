// Friendly fallback for action errors that bubble up from server-side
// failures (D1 queries, network blips, anything that raises before we catch it
// in the handler). Keeps internal details — SQL statements, stack traces, raw
// driver messages — out of the user-facing UI while still surfacing intent.

const RAW_ERROR_PATTERNS = [
  /^failed query:/i,
  /\b(select|insert|update|delete)\b\s+(into|from|videos|users|spaces|comments|approvals|scripts)/i,
  /\bsqlite\b/i,
  /\bD1_\w+\b/,
  /\bdrizzle\b/i,
  /params:\s*[\w-]+/i,
];

export function friendlyActionErrorMessage(
  message: string | undefined | null,
  fallback: string,
): string {
  const trimmed = message?.trim();
  if (!trimmed) return fallback;
  if (RAW_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }
  // Keep the original message if it looks like a deliberate, user-safe one
  // (short, no SQL keywords). Anything longer than a sentence is suspect —
  // server-side action handlers should produce concise messages.
  if (trimmed.length > 240) return fallback;
  return trimmed;
}
