import { useState } from "react";

type Step = "email" | "code";
type OtpMode = "login" | "register";

interface LoginOtpFormProps {
  mode: OtpMode;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

async function getJsonError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
  const message = body?.error ?? body?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function LoginOtpForm({ mode }: LoginOtpFormProps) {
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

    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (mode === "register" && !trimmedName) {
      setError("Enter your name.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          mode,
        }),
      });

      if (!response.ok) {
        setError(await getJsonError(response, "Could not send the sign-in code."));
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
      const response = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          otp: otp.trim(),
          mode,
          ...(mode === "register" ? { name: trimmedName } : {}),
        }),
      });

      if (!response.ok) {
        setError(await getJsonError(response, "Invalid or expired code."));
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
          We sent a {mode === "register" ? "signup" : "sign-in"} code to <span className="font-medium text-text-primary">{normalizedEmail}</span>.
        </div>

        {error && (
          <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="otp" className="mb-1 block text-sm font-medium text-text-secondary">
            {mode === "register" ? "Signup" : "Sign-in"} code
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
          {isSubmitting ? (mode === "register" ? "Creating account..." : "Signing in...") : (mode === "register" ? "Create account" : "Sign in")}
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

      {mode === "register" && (
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
      )}

      <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-secondary">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          placeholder="you@example.com"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover hover:shadow-[0_2px_8px_rgba(108,92,231,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending code..." : `Send ${mode === "register" ? "signup" : "sign-in"} code`}
      </button>

      <p className="text-center text-sm text-text-tertiary">
        {mode === "register" ? "Already have an account?" : "Need an account?"}{" "}
        <a className="text-accent-primary transition-colors hover:text-accent-hover" href={mode === "register" ? "/login" : "/register"}>
          {mode === "register" ? "Sign in" : "Sign up"}
        </a>
      </p>
    </form>
  );
}
