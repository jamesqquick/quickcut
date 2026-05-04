import { useEffect, useRef, useState } from "react";

interface AuthFormEnhancementsProps {
  /** Selector for the form to enhance. Defaults to "form[data-auth-form]". */
  formSelector?: string;
  /** Label shown on the submit button while the request is in flight. */
  pendingLabel: string;
}

/**
 * Progressive enhancement layer for the server-rendered auth forms in
 * login.astro and register.astro. The form already submits natively to an
 * Astro Action via `<form method="POST" action={actions.auth.x}>`. This
 * component:
 *
 *  - Disables the submit button and swaps its label while the form is being
 *    submitted, so users get immediate feedback without waiting for the full
 *    page navigation.
 *  - Re-enables the button if the user navigates back to the page (bfcache).
 *
 * The component intentionally does NOT prevent default / take over submission.
 * Astro handles the POST → result → re-render flow natively, and the form
 * continues to work when JavaScript is disabled.
 */
export function AuthFormEnhancements({
  formSelector = "form[data-auth-form]",
  pendingLabel,
}: AuthFormEnhancementsProps) {
  const initializedRef = useRef(false);
  const [, setMounted] = useState(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setMounted(true);

    const form = document.querySelector<HTMLFormElement>(formSelector);
    if (!form) return;

    const submitButton = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    const originalLabel = submitButton?.textContent ?? "";

    function handleSubmit() {
      if (!submitButton) return;
      submitButton.disabled = true;
      submitButton.dataset.pending = "true";
      submitButton.textContent = pendingLabel;
    }

    function handlePageShow(event: PageTransitionEvent) {
      // Reset button when returning via back/forward cache.
      if (event.persisted && submitButton) {
        submitButton.disabled = false;
        delete submitButton.dataset.pending;
        if (originalLabel) submitButton.textContent = originalLabel;
      }
    }

    form.addEventListener("submit", handleSubmit);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      form.removeEventListener("submit", handleSubmit);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [formSelector, pendingLabel]);

  return null;
}
