"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest, mutationHeaders } from "./api";
import { SelectedFlightCard } from "./selected-flight-card";
import type { ContactMethod, FlightSelection, InquiryPayload, InquiryResponse } from "./types";
import { Field, Notice, inputClassName, textareaClassName } from "@/components/shared/customer-ui";
import type { PassengerType } from "@/shared/contracts/inquiry";
import { isoDate } from "@/shared/dates";
import { cn } from "@/shared/utils";

/** One traveler as their passport spells them. */
type PassengerForm = {
  type: PassengerType;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
};

type FormState = {
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  preferredContactMethod: ContactMethod;
  /** One entry per head in the party, fixed in length by the fare that was quoted. */
  passengers: PassengerForm[];
  specialAssistance: string;
  /** Whether the departure or return could move by a day or two either way. */
  datesFlexible: boolean;
  notes: string;
  transactionalConsent: boolean;
  partyDataAuthority: boolean;
  marketingConsent: boolean;
};

const initialState: FormState = {
  givenName: "",
  familyName: "",
  email: "",
  phone: "",
  preferredContactMethod: "EMAIL",
  passengers: [],
  specialAssistance: "",
  datesFlexible: false,
  notes: "",
  transactionalConsent: false,
  partyDataAuthority: false,
  marketingConsent: false
};

const STEP_COUNT = 3;

const STEPS = [1, 2, 3];

/**
 * A blank line per head in the party, in the order an airline lists a booking.
 * Built from the selection rather than from anything the customer types: the
 * counts are what the fare was quoted for, so the manifest cannot disagree
 * with them without going back to search first.
 */
function blankPassengers(selection: FlightSelection): PassengerForm[] {
  const blank = (type: PassengerType): PassengerForm => ({
    type,
    givenName: "",
    familyName: "",
    dateOfBirth: ""
  });
  return [
    ...Array.from({ length: selection.adults }, () => blank("ADULT")),
    ...Array.from({ length: selection.children }, () => blank("CHILD")),
    ...Array.from({ length: selection.infants }, () => blank("INFANT"))
  ];
}

/**
 * Adult 1, Adult 2, Child 1 — numbered within its own kind rather than across
 * the whole party, because that is how an airline lists a booking and how the
 * agency will read it back over the phone.
 */
function numberPassengers(passengers: PassengerForm[]) {
  const seen: Record<PassengerType, number> = { ADULT: 0, CHILD: 0, INFANT: 0 };
  return passengers.map((passenger, index) => {
    seen[passenger.type] += 1;
    return { passenger, index, number: seen[passenger.type] };
  });
}

/**
 * Only the travelers who were named in full, trimmed and ready to send. A line
 * with a first name and no date of birth holds nothing at an airline, and
 * sending it would leave the agency reading a manifest that looks more complete
 * than it is; those lines are simply left for the callback.
 */
function completedPassengers(passengers: PassengerForm[]) {
  return passengers
    .filter(
      (passenger) =>
        passenger.givenName.trim() && passenger.familyName.trim() && passenger.dateOfBirth
    )
    .map((passenger) => ({
      type: passenger.type,
      givenName: passenger.givenName.trim(),
      familyName: passenger.familyName.trim(),
      dateOfBirth: passenger.dateOfBirth
    }));
}

/** Errors are keyed by field, so a traveler's fields need a key of their own. */
function passengerErrorKey(index: number, field: keyof PassengerForm): string {
  return `passenger-${index}-${field}`;
}

/**
 * Checking out with a flight. The trip is already decided by the time anyone
 * gets here, so the only thing left to collect is who to call and how, and the
 * chosen flight stays on screen from the first field through to sending.
 */
export function FlightCheckout({ selection }: { selection: FlightSelection }) {
  const t = useTranslations("Inquiry");
  const locale = useLocale() as "en" | "vi";
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => ({
    ...initialState,
    passengers: blankPassengers(selection)
  }));
  /** Nobody has been born tomorrow; this caps every date-of-birth picker. */
  const today = useMemo(() => isoDate(new Date()), []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updatePassenger(index: number, field: keyof PassengerForm, value: string) {
    setForm((current) => ({
      ...current,
      passengers: current.passengers.map((passenger, position) =>
        position === index ? { ...passenger, [field]: value } : passenger
      )
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[passengerErrorKey(index, field)];
      return next;
    });
  }

  function validate(currentStep: number) {
    const next: Record<string, string> = {};
    if (currentStep === 1) {
      if (!form.givenName.trim()) next.givenName = t("errors.givenName");
      if (!form.familyName.trim()) next.familyName = t("errors.familyName");
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = t("errors.email");
      // Both channels are mandatory: the agency calls back, and one bad digit or
      // a filtered mailbox must not be the only way to reach a customer.
      if (form.phone.replace(/\D/g, "").length < 7) next.phone = t("errors.phone");
    }
    if (currentStep === 2) {
      /*
       * Nothing here is required. A customer without the passports in front of
       * them still gets to send the request; the names are what let the agency
       * hold seats early, not what lets it take the request at all. The only
       * thing rejected is a date that has not happened, which is a typo rather
       * than a blank.
       */
      form.passengers.forEach((passenger, index) => {
        if (passenger.dateOfBirth && passenger.dateOfBirth > today) {
          next[passengerErrorKey(index, "dateOfBirth")] = t("errors.passengerDateOfBirth");
        }
      });
    }
    if (currentStep === 3) {
      if (!form.transactionalConsent) next.transactionalConsent = t("errors.transactionalConsent");
      if (!form.partyDataAuthority) next.partyDataAuthority = t("errors.partyDataAuthority");
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return false;
    }
    return true;
  }

  function nextStep() {
    if (!validate(step)) return;
    setStep((current) => Math.min(STEP_COUNT, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    setErrors({});
    setStep((current) => Math.max(1, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!validate(1) || !validate(2) || !validate(STEP_COUNT)) return;
    setSubmitting(true);
    setSubmitError("");
    const manifest = completedPassengers(form.passengers);
    const payload: InquiryPayload = {
      origin: selection.origin,
      destination: selection.destination,
      tripType: selection.tripType,
      departureDate: selection.departureDate,
      // Sent only on a round trip: the contract rejects a return date the
      // customer never chose, and the column check rejects it again.
      ...(selection.tripType === "ROUND_TRIP" && selection.returnDate
        ? { returnDate: selection.returnDate }
        : {}),
      // A specific flight was chosen, so the dates are the dates — unless the
      // customer said they could move, in which case the agency is free to
      // price a day or two either side of the flight on screen.
      flexibility: form.datesFlexible ? "PLUS_MINUS_2" : "EXACT",
      cabinPreference: selection.cabin,
      travelers: {
        adults: selection.adults,
        children: selection.children,
        infants: selection.infants
      },
      // Left out entirely when nobody was named: the contract takes a short
      // manifest or none at all, and an empty array says nothing extra.
      ...(manifest.length > 0 ? { passengers: manifest } : {}),
      selectedOffer: selection.summary,
      ...(form.specialAssistance.trim()
        ? { specialAssistance: form.specialAssistance.trim() }
        : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      contact: {
        givenName: form.givenName.trim(),
        familyName: form.familyName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        preferredContactMethod: form.preferredContactMethod,
        preferredLanguage: locale
      },
      // The visa is part of every package now rather than an extra somebody
      // opts into, so every request that reaches the agency is a visa request.
      visaInterest: true,
      transactionalConsent: true,
      partyDataAuthority: true,
      marketingConsent: form.marketingConsent
    };

    try {
      const result = await apiRequest<InquiryResponse>("/api/v1/inquiries", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify(payload)
      });
      const query = new URLSearchParams({
        reference: result.reference,
        method: form.preferredContactMethod
      });
      router.push(`/request/received?${query.toString()}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("errors.submit"));
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  const errorCount = Object.keys(errors).length + (submitError ? 1 : 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <div className="card overflow-hidden">
        <div className="border-b border-[var(--line)] bg-[var(--ivory)] px-5 py-4 sm:px-8 sm:py-5">
          <ol
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
            aria-label={t("progressLabel")}
          >
            {STEPS.map((item) => (
              <li
                className="flex list-none items-center gap-2.5"
                key={item}
                aria-current={step === item ? "step" : undefined}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors",
                    item <= step
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-[var(--line-strong)] text-[color:var(--ink-soft)]"
                  )}
                >
                  {item}
                </span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    item === step ? "text-[color:var(--ink)]" : "muted"
                  )}
                >
                  {t(`steps.${item}`)}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <form
          ref={formRef}
          className="p-5 sm:p-8 lg:p-10"
          onSubmit={(event) => {
            event.preventDefault();
            if (step < STEP_COUNT) nextStep();
            else void submit();
          }}
          noValidate
        >
          {errorCount > 0 ? (
            <div
              ref={errorSummaryRef}
              tabIndex={-1}
              className="mb-8 rounded-[var(--radius-control)] border border-red-200 bg-red-50 p-4"
              role="alert"
            >
              <p className="font-bold text-red-900">{t("errors.summary", { count: errorCount })}</p>
              {submitError ? <p className="mt-1 text-sm text-red-800">{submitError}</p> : null}
            </div>
          ) : null}

          {step === 1 ? <ContactStep form={form} errors={errors} update={update} /> : null}
          {step === 2 ? (
            <TravelersStep
              form={form}
              errors={errors}
              updatePassenger={updatePassenger}
              today={today}
            />
          ) : null}
          {step === 3 ? (
            <ReviewStep form={form} errors={errors} update={update} selection={selection} />
          ) : null}

          <div className="mt-10 flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-7 sm:flex-row sm:justify-between">
            {step > 1 ? (
              <button
                type="button"
                className="button-secondary gap-2"
                onClick={previousStep}
                disabled={submitting}
              >
                <ArrowLeft aria-hidden="true" size={17} />
                {t("back")}
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="button-primary gap-2" disabled={submitting}>
              {submitting ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
              ) : null}
              {step === STEP_COUNT ? t("submit") : t("continue")}
              {!submitting && step < STEP_COUNT ? (
                <ArrowRight aria-hidden="true" size={17} />
              ) : null}
            </button>
          </div>
        </form>
      </div>

      {/* First thing on a phone, alongside every field on a laptop. */}
      <div className="order-first lg:order-none lg:sticky lg:top-24">
        <SelectedFlightCard selection={selection} />
      </div>
    </div>
  );
}

type StepProps = {
  form: FormState;
  errors: Record<string, string>;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
};

function ContactStep({ form, errors, update }: StepProps) {
  const t = useTranslations("Inquiry");
  return (
    <fieldset>
      <legend className="font-display text-3xl leading-none sm:text-4xl">
        {t("contact.title")}
      </legend>
      <p className="muted mt-2 leading-7">{t("contact.description")}</p>
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <Field label={t("contact.givenName")} error={errors.givenName} required>
          <input
            className={inputClassName}
            autoComplete="given-name"
            value={form.givenName}
            onChange={(event) => update("givenName", event.target.value)}
          />
        </Field>
        <Field label={t("contact.familyName")} error={errors.familyName} required>
          <input
            className={inputClassName}
            autoComplete="family-name"
            value={form.familyName}
            onChange={(event) => update("familyName", event.target.value)}
          />
        </Field>
        <Field label={t("contact.email")} error={errors.email} required>
          <input
            className={inputClassName}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
          />
        </Field>
        <Field
          label={t("contact.phone")}
          hint={t("contact.phoneHint")}
          error={errors.phone}
          required
        >
          <input
            className={inputClassName}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </Field>
      </div>
      <fieldset className="mt-8">
        <legend className="text-sm font-bold">{t("contact.contactMethodTitle")}</legend>
        <p className="muted mt-1 text-sm leading-6">{t("contact.contactMethodHint")}</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {(["EMAIL", "PHONE"] as const).map((method) => (
            <label
              key={method}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border p-4 transition-colors",
                form.preferredContactMethod === method
                  ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[inset_0_0_0_1px_var(--brand)]"
                  : "border-[var(--line)] bg-[var(--paper)] hover:border-[var(--brand)]"
              )}
            >
              <input
                className="size-5 accent-[var(--brand)]"
                type="radio"
                name="preferredContactMethod"
                value={method}
                checked={form.preferredContactMethod === method}
                onChange={() => update("preferredContactMethod", method)}
              />
              <span className="font-bold">
                {method === "EMAIL"
                  ? t("contact.contactMethodEmail")
                  : t("contact.contactMethodPhone")}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {/* Dates first, because it is the one thing here that can still change
          what the agency goes looking for, and because the box under it is
          where the detail behind a ticked box gets written. */}
      <label className="mt-8 flex cursor-pointer gap-3.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--ivory)] p-5 transition-colors hover:border-[var(--brand)]">
        <input
          className="mt-1 size-5 accent-[var(--brand)]"
          type="checkbox"
          checked={form.datesFlexible}
          onChange={(event) => update("datesFlexible", event.target.checked)}
        />
        <span>
          <span className="block font-bold">{t("contact.flexibleDatesTitle")}</span>
          <span className="muted mt-1 block text-sm leading-6">
            {t("contact.flexibleDatesBody")}
          </span>
        </span>
      </label>
      <div className="mt-6">
        <Field label={t("travelers.assistance")} hint={t("travelers.assistanceHint")}>
          <textarea
            className={textareaClassName}
            value={form.specialAssistance}
            onChange={(event) => update("specialAssistance", event.target.value)}
            maxLength={1000}
            placeholder={t("travelers.assistancePlaceholder")}
          />
        </Field>
      </div>
      {/* The visa is included in the price rather than asked for, so this says
          what will be needed for it instead of offering a box to tick. The
          documents themselves are collected later, by phone or email — this
          form never takes passport details. */}
      <div className="mt-4">
        <Notice tone="info" title={t("contact.visaNoteTitle")}>
          <span>{t("contact.visaNoteBody")}</span>
        </Notice>
      </div>
    </fieldset>
  );
}

/**
 * The passport manifest. Every other field on this form is about reaching the
 * customer; this one is about the airline, which will hold a seat against a
 * legal name and a date of birth and nothing else. The copy says as much,
 * because a customer asked for a passport spelling with no reason given will
 * reasonably wonder why a callback form wants it.
 */
function TravelersStep({
  form,
  errors,
  updatePassenger,
  today
}: {
  form: FormState;
  errors: Record<string, string>;
  updatePassenger: (index: number, field: keyof PassengerForm, value: string) => void;
  today: string;
}) {
  const t = useTranslations("Inquiry");
  return (
    <fieldset>
      <legend className="font-display text-3xl leading-none sm:text-4xl">
        {t("passengers.title")}
      </legend>
      <p className="muted mt-2 leading-7">{t("passengers.description")}</p>
      {/* Said before the fields rather than after them, so nobody stops at this
          step hunting for passports they do not have to hand. */}
      <p className="muted mt-2 leading-7">{t("passengers.optionalNote")}</p>
      <div className="mt-6">
        <Notice tone="info" title={t("passengers.holdTitle")}>
          <span>{t("passengers.holdBody")}</span>
        </Notice>
      </div>
      {/* The border sits on an inner box rather than on the fieldset itself:
          a legend on a bordered fieldset is drawn through the border, which
          reads as a mistake. Here the label sits cleanly above its own card. */}
      <div className="mt-7 grid gap-7">
        {numberPassengers(form.passengers).map(({ passenger, index, number }) => (
          <fieldset key={`${passenger.type}-${number}`}>
            <legend className="text-sm font-bold">
              {t(`passengers.types.${passenger.type}`, { number })}
            </legend>
            <div className="mt-2 grid gap-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--ivory)] p-5 sm:grid-cols-2">
              <Field
                label={t("passengers.givenName")}
                hint={t("passengers.nameHint")}
                error={errors[passengerErrorKey(index, "givenName")]}
              >
                <input
                  className={inputClassName}
                  /* Never autofilled: this is the traveler's name, and on a
                     family booking it is usually not the person typing. */
                  autoComplete="off"
                  value={passenger.givenName}
                  onChange={(event) => updatePassenger(index, "givenName", event.target.value)}
                />
              </Field>
              <Field
                label={t("passengers.familyName")}
                hint={t("passengers.nameHint")}
                error={errors[passengerErrorKey(index, "familyName")]}
              >
                <input
                  className={inputClassName}
                  autoComplete="off"
                  value={passenger.familyName}
                  onChange={(event) => updatePassenger(index, "familyName", event.target.value)}
                />
              </Field>
              <Field
                label={t("passengers.dateOfBirth")}
                error={errors[passengerErrorKey(index, "dateOfBirth")]}
              >
                <input
                  className={inputClassName}
                  type="date"
                  max={today}
                  value={passenger.dateOfBirth}
                  onChange={(event) => updatePassenger(index, "dateOfBirth", event.target.value)}
                />
              </Field>
            </div>
          </fieldset>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewStep({
  form,
  errors,
  update,
  selection
}: StepProps & { selection: FlightSelection }) {
  const t = useTranslations("Inquiry");
  return (
    <fieldset>
      <legend className="font-display text-3xl leading-none sm:text-4xl">
        {t("review.title")}
      </legend>
      <p className="muted mt-2 leading-7">{t("review.description")}</p>
      <dl className="mt-7 grid gap-x-8 gap-y-6 border-y border-[var(--line)] py-6 sm:grid-cols-2">
        <SummaryItem
          label={t("review.party")}
          value={t("review.partyValue", {
            adults: selection.adults,
            children: selection.children,
            infants: selection.infants
          })}
        />
        <SummaryItem label={t("review.contact")} value={`${form.givenName} ${form.familyName}`} />
        <SummaryItem label={t("contact.email")} value={form.email} />
        <SummaryItem label={t("contact.phone")} value={form.phone} />
      </dl>
      {/* Read back rather than summarised: a misspelled passport name is the
          one thing here that costs money to fix after the fact. Travelers left
          blank are named as blank rather than dropped, so a customer who meant
          to fill them all in can see which one they missed. */}
      <div className="mt-7">
        <p className="eyebrow">{t("passengers.reviewTitle")}</p>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {numberPassengers(form.passengers).map(({ passenger, number }) => {
            const named = passenger.givenName.trim() && passenger.familyName.trim();
            return (
              <li className="flex flex-wrap gap-x-2" key={`${passenger.type}-${number}`}>
                <span className="muted">{t(`passengers.types.${passenger.type}`, { number })}</span>
                {named ? (
                  <>
                    <span className="font-semibold">
                      {passenger.givenName} {passenger.familyName}
                    </span>
                    <span className="muted tabular-nums">{passenger.dateOfBirth}</span>
                  </>
                ) : (
                  <span className="font-semibold">{t("passengers.reviewMissing")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-7">
        <Field label={t("review.notes")} hint={t("review.notesHint")}>
          <textarea
            className={textareaClassName}
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
            maxLength={2000}
          />
        </Field>
      </div>
      <div className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        <Consent
          checked={form.transactionalConsent}
          onChange={(checked) => update("transactionalConsent", checked)}
          label={t("review.transactionalConsent")}
          error={errors.transactionalConsent}
          required
        />
        <Consent
          checked={form.partyDataAuthority}
          onChange={(checked) => update("partyDataAuthority", checked)}
          label={t("review.partyDataAuthority")}
          error={errors.partyDataAuthority}
          required
        />
        <Consent
          checked={form.marketingConsent}
          onChange={(checked) => update("marketingConsent", checked)}
          label={t("review.marketingConsent")}
        />
      </div>
      <div className="mt-7">
        <Notice tone="info" title={t("review.noPurchaseTitle")}>
          <span>{t("review.noPurchaseBody")}</span>
        </Notice>
      </div>
    </fieldset>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}

function Consent({
  checked,
  onChange,
  label,
  error,
  required
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  error?: string | undefined;
  required?: boolean | undefined;
}) {
  return (
    <div>
      <label className="flex cursor-pointer gap-3 py-4 text-sm leading-6">
        <input
          className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          required={required}
        />
        <span>
          {label}
          {required ? <span className="ml-1 text-[color:var(--danger)]">*</span> : null}
        </span>
      </label>
      {error ? (
        <p className="ml-8 mt-1 text-sm font-semibold text-[color:var(--danger)]">{error}</p>
      ) : null}
    </div>
  );
}
