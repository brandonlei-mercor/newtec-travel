import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/admin/sign-in-form";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/server/admin-auth";
import { ADMIN_BOARD_PATH } from "@/shared/admin-routes";
import { COMPANY } from "@/shared/company";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  /* Already signed in: show the board rather than a form asking for what we have. */
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (await isValidSessionToken(token)) redirect(ADMIN_BOARD_PATH);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {COMPANY.name}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Staff sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Customer requests are behind this password. If you do not have it, you are not meant to be
        here.
      </p>
      <SignInForm />
    </main>
  );
}
