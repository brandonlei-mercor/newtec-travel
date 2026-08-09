"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_BOARD_PATH, ADMIN_SESSION_PATH } from "@/shared/admin-routes";

export function SignInForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(ADMIN_SESSION_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) {
        /*
         * The server decides what a failure says; repeating its message keeps
         * "wrong password" and "too many attempts" from having to be guessed at
         * from a status code, and keeps this form from inventing a third answer.
         */
        const body = await response.json().catch(() => null);
        setError(
          (body as { error?: { message?: string } } | null)?.error?.message ??
            "Could not sign in. Try again."
        );
        setPassword("");
        return;
      }
      /*
       * replace, not push: the sign-in form is not somewhere the back button
       * should return to now that the session exists.
       */
      router.replace(ADMIN_BOARD_PATH);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="admin-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={error ? "admin-password-error" : undefined}
          aria-invalid={error ? true : undefined}
          className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 py-2 text-base"
        />
      </div>
      {error ? (
        <p id="admin-password-error" role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="w-full rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
