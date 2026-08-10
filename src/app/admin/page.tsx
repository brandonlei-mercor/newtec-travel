import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InquiryBoard } from "@/components/admin/inquiry-board";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/server/admin-auth";
import { getDatabase } from "@/server/db";
import { listInquiries } from "@/modules/inquiries/queries";
import { ADMIN_LOGIN_PATH } from "@/shared/admin-routes";
import { COMPANY } from "@/shared/company";
import { env } from "@/shared/env";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  /*
   * The proxy already turned anonymous callers away. Checking again here means
   * the page never renders customer contact details on the strength of a
   * matcher pattern alone.
   */
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) redirect(ADMIN_LOGIN_PATH);

  const inquiries = await listInquiries(getDatabase());

  return (
    <main className="mx-auto max-w-[110rem] px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {COMPANY.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Requests</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            {env.INQUIRY_EMAIL_ENABLED
              ? `Drag a request between columns as you work it. Every request is also emailed to ${COMPANY.email.address}; this board is the record that survives a mail problem.`
              : "Drag a request between columns as you work it. Email notifications are switched off, so this board is the only place a request appears."}
          </p>
        </div>
        <SignOutButton />
      </header>
      <InquiryBoard
        inquiries={inquiries.map(serialize)}
        showNotificationState={env.INQUIRY_EMAIL_ENABLED}
      />
    </main>
  );
}

/** Dates cross the server/client boundary as ISO strings. */
function serialize(inquiry: Awaited<ReturnType<typeof listInquiries>>[number]) {
  return {
    id: inquiry.id,
    reference: inquiry.reference,
    status: inquiry.status,
    submittedAt: inquiry.submittedAt.toISOString(),
    givenName: inquiry.givenName,
    familyName: inquiry.familyName,
    email: inquiry.email,
    phone: inquiry.phone,
    preferredContactMethod: inquiry.preferredContactMethod,
    preferredLocale: inquiry.preferredLocale,
    origin: inquiry.origin,
    destination: inquiry.destination,
    departureDate: inquiry.departureDate,
    returnDate: inquiry.returnDate,
    dateFlexibility: inquiry.dateFlexibility,
    cabin: inquiry.cabin,
    adults: inquiry.adults,
    children: inquiry.children,
    infants: inquiry.infants,
    passengers: inquiry.passengers.map((passenger) => ({
      type: passenger.type,
      givenName: passenger.givenName,
      familyName: passenger.familyName
    })),
    visaInterest: inquiry.visaInterest,
    selectedOffer: inquiry.selectedOffer,
    specialAssistance: inquiry.specialAssistance,
    customerNotes: inquiry.customerNotes,
    notificationState: inquiry.notificationState
  };
}
