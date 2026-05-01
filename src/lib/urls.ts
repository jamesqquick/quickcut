export function getSafeReturnUrl(returnUrl: string | null | undefined): string | null {
  if (!returnUrl || /[\u0000-\u001F\u007F\\]/.test(returnUrl)) return null;

  const base = "https://quickcuts.local";
  const url = new URL(returnUrl, base);

  if (url.origin !== base) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}
