"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_LOGIN_PATH, adminInquiryStatusPath } from "@/shared/admin-routes";
import {
  INQUIRY_STATUSES,
  type ContactMethod,
  type InquiryStatus,
  type PassengerType
} from "@/shared/contracts/inquiry";

export type AdminInquiry = {
  id: string;
  reference: string;
  status: InquiryStatus;
  submittedAt: string;
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  preferredContactMethod: ContactMethod;
  preferredLocale: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  dateFlexibility: string;
  cabin: string;
  adults: number;
  children: number;
  infants: number;
  /** Legal names as the passport spells them, in the order the form collected them. */
  passengers: {
    type: PassengerType;
    givenName: string;
    familyName: string;
  }[];
  visaInterest: boolean;
  selectedOffer: string | null;
  specialAssistance: string | null;
  customerNotes: string | null;
  notificationState: "PENDING" | "SENT" | "FAILED" | null;
};

const COLUMN_LABELS: Record<InquiryStatus, string> = {
  NEW: "New",
  PROCESSING: "Processing",
  DONE: "Done"
};

const COLUMN_HINTS: Record<InquiryStatus, string> = {
  NEW: "Nobody has called yet",
  PROCESSING: "Being worked right now",
  DONE: "Ticketed, or the customer went elsewhere"
};

const COLUMN_ACCENTS: Record<InquiryStatus, string> = {
  NEW: "border-t-amber-400",
  PROCESSING: "border-t-sky-400",
  DONE: "border-t-slate-400"
};

/*
 * PENDING is not an error: the notification job retries with backoff for hours.
 * FAILED after those retries is the case staff need to see, because it means
 * the email never arrived and this board is the only copy of the request.
 */
const NOTIFICATION_LABELS: Record<string, string> = {
  PENDING: "Email queued",
  SENT: "Email sent",
  FAILED: "Email failed"
};

const PASSENGER_LABELS: Record<PassengerType, string> = {
  ADULT: "Adult",
  CHILD: "Child",
  INFANT: "Lap infant"
};

/** The MIME type the card writes its id into, so a stray drop cannot be read as one. */
const DRAG_TYPE = "application/x-newtec-inquiry";

/**
 * A move being shown before the server has confirmed it, remembered together
 * with the status it was made from. That baseline is what makes the override
 * expire on its own: once the server reports anything other than `from` — the
 * move landing, or somebody else moving the same card — the server wins and
 * this is ignored. No effect has to clean it up, and no stale optimism can
 * outlive the fact it was optimistic about.
 */
type Override = { from: InquiryStatus; target: InquiryStatus };

function effectiveStatus(
  inquiry: AdminInquiry,
  overrides: Record<string, Override>
): InquiryStatus {
  const override = overrides[inquiry.id];
  return override?.from === inquiry.status ? override.target : inquiry.status;
}

export function InquiryBoard({
  inquiries,
  showNotificationState
}: {
  inquiries: AdminInquiry[];
  showNotificationState: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  /*
   * A move is shown before the server confirms it, because dragging a card that
   * springs back while a request is in flight feels broken. The override is
   * dropped again if the request fails, and the message says where the card
   * actually is — an optimistic update that lies is worse than a slow one.
   */
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<InquiryStatus | null>(null);

  const columns = useMemo(() => {
    const grouped: Record<InquiryStatus, AdminInquiry[]> = { NEW: [], PROCESSING: [], DONE: [] };
    for (const inquiry of inquiries) {
      grouped[effectiveStatus(inquiry, overrides)].push(inquiry);
    }
    return grouped;
  }, [inquiries, overrides]);

  async function move(inquiry: AdminInquiry, target: InquiryStatus) {
    const currentStatus = effectiveStatus(inquiry, overrides);
    if (currentStatus === target) return;

    setError(null);
    setOverrides((previous) => ({ ...previous, [inquiry.id]: { from: inquiry.status, target } }));

    let response: Response;
    try {
      response = await fetch(adminInquiryStatusPath(inquiry.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target })
      });
    } catch {
      rollback(inquiry, currentStatus, "Could not reach the server.");
      return;
    }

    /* An expired session is not a failed move; it is a sign-in that ran out. */
    if (response.status === 401) {
      router.replace(ADMIN_LOGIN_PATH);
      return;
    }
    if (!response.ok) {
      rollback(inquiry, currentStatus, "The server rejected the change.");
      return;
    }
    startTransition(() => router.refresh());
  }

  function rollback(inquiry: AdminInquiry, currentStatus: InquiryStatus, reason: string) {
    setOverrides((previous) => {
      const next = { ...previous };
      delete next[inquiry.id];
      return next;
    });
    setError(
      `${reason} ${inquiry.reference} is still in ${COLUMN_LABELS[currentStatus]}. Try again.`
    );
  }

  function onDrop(event: DragEvent<HTMLElement>, target: InquiryStatus) {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const inquiry = inquiries.find((candidate) => candidate.id === id);
    if (inquiry) void move(inquiry, target);
  }

  if (inquiries.length === 0) {
    return (
      <p className="card p-8 text-center text-sm text-[color:var(--ink-soft)]">No requests yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {INQUIRY_STATUSES.map((status) => (
          <section
            key={status}
            onDragOver={(event) => {
              /* Without preventDefault the browser refuses the drop outright. */
              event.preventDefault();
              setDropTarget(status);
            }}
            onDragLeave={() => setDropTarget((current) => (current === status ? null : current))}
            onDrop={(event) => onDrop(event, status)}
            aria-labelledby={`column-${status}`}
            className={`rounded-[var(--radius-card)] border-t-4 bg-white/60 p-3 transition-colors ${COLUMN_ACCENTS[status]} ${
              dropTarget === status ? "bg-sky-50 ring-2 ring-sky-300" : ""
            }`}
          >
            <h2 id={`column-${status}`} className="text-sm font-semibold">
              {COLUMN_LABELS[status]}{" "}
              <span className="font-normal text-[color:var(--ink-soft)]">
                ({columns[status].length})
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--ink-soft)]">{COLUMN_HINTS[status]}</p>
            <ul className="mt-3 space-y-3">
              {columns[status].map((inquiry) => (
                <InquiryCard
                  key={inquiry.id}
                  inquiry={inquiry}
                  status={status}
                  showNotificationState={showNotificationState}
                  onMove={move}
                />
              ))}
            </ul>
            {columns[status].length === 0 ? (
              <p className="mt-3 rounded-[var(--radius-control)] border border-dashed border-[var(--line-strong)] p-4 text-center text-xs text-[color:var(--ink-soft)]">
                Drop a request here
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function InquiryCard({
  inquiry,
  status,
  showNotificationState,
  onMove
}: {
  inquiry: AdminInquiry;
  status: InquiryStatus;
  showNotificationState: boolean;
  onMove: (inquiry: AdminInquiry, target: InquiryStatus) => void;
}) {
  const party = [
    `${inquiry.adults} adult${inquiry.adults === 1 ? "" : "s"}`,
    inquiry.children > 0 ? `${inquiry.children} child${inquiry.children === 1 ? "" : "ren"}` : null,
    inquiry.infants > 0 ? `${inquiry.infants} infant${inquiry.infants === 1 ? "" : "s"}` : null
  ]
    .filter(Boolean)
    .join(", ");

  /*
   * Numbered within its own kind, matching the labels the customer filled in
   * and the way the notification email lists them, so a name read off this
   * card and a name read off the email are unambiguously the same traveler.
   */
  const seen: Record<PassengerType, number> = { ADULT: 0, CHILD: 0, INFANT: 0 };
  const manifest = inquiry.passengers.map((passenger) => {
    seen[passenger.type] += 1;
    return {
      label: `${PASSENGER_LABELS[passenger.type]} ${seen[passenger.type]}`,
      name: `${passenger.familyName}, ${passenger.givenName}`
    };
  });

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, inquiry.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="card cursor-grab p-4 active:cursor-grabbing"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-base font-semibold">
          {inquiry.givenName} {inquiry.familyName}
        </h3>
        {showNotificationState && inquiry.notificationState === "FAILED" ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900">
            {NOTIFICATION_LABELS.FAILED}
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-mono text-xs text-[color:var(--ink-soft)]">
        {inquiry.reference} &middot; {formatTimestamp(inquiry.submittedAt)}
        {showNotificationState
          ? ` · ${
              inquiry.notificationState
                ? (NOTIFICATION_LABELS[inquiry.notificationState] ?? inquiry.notificationState)
                : "No email record"
            }`
          : ""}
      </p>

      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-1">
        <Detail label={`Contact (prefers ${inquiry.preferredContactMethod.toLowerCase()})`}>
          <a className="underline" href={`tel:${inquiry.phone.replace(/[^\d+]/g, "")}`}>
            {inquiry.phone}
          </a>
          <br />
          <a className="underline" href={`mailto:${inquiry.email}`}>
            {inquiry.email}
          </a>
        </Detail>
        <Detail label="Trip">
          {inquiry.origin} to {inquiry.destination}
          <br />
          {inquiry.departureDate}
          {inquiry.returnDate ? ` to ${inquiry.returnDate}` : " (one way)"}
        </Detail>
        <Detail label="Details">
          {inquiry.cabin} &middot; {inquiry.dateFlexibility}
          <br />
          {party}
        </Detail>
        {manifest.length > 0 ? (
          <Detail label="Passport names">
            {manifest.map((traveler) => (
              <span className="block" key={traveler.label}>
                {traveler.label}: {traveler.name}
              </span>
            ))}
          </Detail>
        ) : null}
        <Detail label="Language">
          {inquiry.preferredLocale === "vi" ? "Vietnamese" : "English"}
        </Detail>
        {inquiry.selectedOffer ? <Detail label="Flight">{inquiry.selectedOffer}</Detail> : null}
        {inquiry.visaInterest ? <Detail label="Visa">Asked about visa help</Detail> : null}
        {inquiry.specialAssistance ? (
          <Detail label="Assistance">{inquiry.specialAssistance}</Detail>
        ) : null}
        {inquiry.customerNotes ? <Detail label="Notes">{inquiry.customerNotes}</Detail> : null}
      </dl>

      {/*
       * Dragging is the quick way, not the only way. A phone has no drag events
       * to give and a keyboard has nothing to grab, so the same move is always
       * available as a plain select.
       */}
      <label className="mt-3 flex items-center gap-2 text-xs text-[color:var(--ink-soft)]">
        Move to
        <select
          value={status}
          onChange={(event) => onMove(inquiry, event.target.value as InquiryStatus)}
          aria-label={`Move ${inquiry.reference} to another column`}
          className="rounded-[var(--radius-control)] border border-[var(--line-strong)] px-2 py-1 text-xs"
        >
          {INQUIRY_STATUSES.map((option) => (
            <option key={option} value={option}>
              {COLUMN_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles"
  });
}
