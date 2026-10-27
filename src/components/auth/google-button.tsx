import { googleConfig } from "@/lib/google";

/**
 * PRD F17. The Google entry point on the sign in and sign up pages. When the
 * OAuth credentials are absent the button says so plainly and stays
 * disabled rather than linking to a route that would only bounce back with
 * an error.
 */
export function GoogleButton() {
  if (!googleConfig()) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          className="btn btn-secondary"
          disabled
          aria-disabled="true"
          aria-describedby="google-not-configured"
        >
          Continue with Google
        </button>
        <p id="google-not-configured" className="text-sm text-muted">
          Google sign-in is not configured on this deployment. Email and
          password still work.
        </p>
      </div>
    );
  }

  return (
    <a href="/api/auth/google" className="btn btn-secondary w-full">
      Continue with Google
    </a>
  );
}
