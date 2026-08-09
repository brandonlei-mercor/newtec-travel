"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_LOGIN_PATH, ADMIN_SESSION_PATH } from "@/shared/admin-routes";

/**
 * Signing out is a DELETE rather than a link, so nothing a browser prefetches
 * can end the session. The server clears the cookie; this only asks it to.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch(ADMIN_SESSION_PATH, { method: "DELETE" });
    /*
     * replace, not push: the board is behind a session that no longer exists,
     * so leaving it in history only offers a back button that bounces.
     */
    router.replace(ADMIN_LOGIN_PATH);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--brand)] disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
