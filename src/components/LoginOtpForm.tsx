import { useState } from "react";
import { authClient } from "../lib/auth-client";

type Step = "email" | "code";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

export function LoginOtpForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  async function handleSendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!normalizedEmail.endsWith("@cloudflare.com")) {
      setError("Use your @cloudflare.com email address.");
      return;
    }

    if (!trimmedName) {
      setError("Enter your name.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      });

      if (error) {
        setError(getErrorMessage(error, "Could not send the sign-in code."));
        return;
      }

      setStep("code");
    } catch (err) {
      setError(getErrorMessage(err, "Could not send the sign-in code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!otp.trim()) {
      setError("Enter the code from your email.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await authClient.signIn.emailOtp({
        email: normalizedEmail,
        otp: otp.trim(),
        name: trimmedName,
      });

      if (error) {
        setError(getErrorMessage(error, "Invalid or expired code."));
        return;
      }

      window.location.assign("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid or expired code."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "code") {
    return (
      <form className="space-y-4" onSubmit={handleVerifyCode}>
        <div className="rounded-lg border border-border-default bg-bg-tertiary px-4 py-3 text-sm text-text-secondary">
          We sent a sign-in code to <span className="font-medium text-text-primary">{normalizedEmail}</span>.
        </div>

        {error && (
          <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="otp" className="mb-1 block text-sm font-medium text-text-secondary">
            Sign-in code
          </label>
          <input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
            placeholder="123456"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover hover:shadow-[0_2px_8px_rgba(108,92,231,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>

        <button
          type="button"
          onClick={() => {
            setOtp("");
            setError(null);
            setStep("email");
          }}
          className="w-full text-sm text-text-tertiary transition-colors hover:text-text-primary"
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSendCode}>
      {error && (
        <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-text-secondary">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          placeholder="Jane Doe"
          required
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-secondary">
          Cloudflare email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          placeholder="you@cloudflare.com"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover hover:shadow-[0_2px_8px_rgba(108,92,231,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending code..." : "Send sign-in code"}
      </button>
    </form>
  );
}
