import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { getSafeReturnUrl } from "../lib/urls";

type SocialMode = "login" | "register";

interface SocialButtonsProps {
  mode: SocialMode;
  returnUrl?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function SocialButtons({ mode, returnUrl }: SocialButtonsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackURL = getSafeReturnUrl(returnUrl) || "/dashboard";
  const label = mode === "register" ? "Sign up with Google" : "Continue with Google";

  async function handleGoogleSignIn() {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: "/login?error=oauth_failed",
      });

      if (result && "error" in result && result.error) {
        setError(getErrorMessage(result.error, "Could not sign in with Google."));
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Could not sign in with Google."));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white px-5 py-2.5 text-sm font-medium text-[#3c4043] transition-all duration-150 hover:bg-[#f8f9fa] hover:shadow-[0_1px_3px_rgba(60,64,67,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ fontFamily: "'Google Sans', Roboto, Arial, sans-serif" }}
      >
        <GoogleLogo />
        <span>{isSubmitting ? "Redirecting..." : label}</span>
      </button>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.806.54-1.8368.8595-3.0477.8595-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9831 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8269.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}
