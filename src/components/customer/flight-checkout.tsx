"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest, mutationHeaders } from "./api";
import { SelectedFlightCard } from "./selected-flight-card";
import type { ContactMethod, FlightSelection, InquiryPayload, InquiryResponse } from "./types";
import { Field, Notice, inputClassName, textareaClassName } from "@/components/shared/customer-ui";
import { cn } from "@/shared/utils";

type FormState = {
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  preferredContactMethod: ContactMethod;
  specialAssistance: string;
  visaInterest: boolean;
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
  specialAssistance: "",
  visaInterest: false,
  notes: "",
  transactionalConsent: false,
  partyDataAuthority: false,
  marketingConsent: false
};

const STEP_COUNT = 2;

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
  const [form, setForm] = useState<FormState>(initialState);
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
    if (!validate(1) || !validate(STEP_COUNT)) return;
    setSubmitting(true);
    setSubmitError("");
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
      // A specific flight was chosen, so the dates are the dates.
      flexibility: "EXACT",
      cabinPreference: selection.cabin,
      travelers: {
        adults: selection.adults,
        children: selection.children,
        infants: selection.infants
      },
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
      visaInterest: form.visaInterest,
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
            {[1, 2].map((item) => (
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
      <div className="mt-8">
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
      <label className="mt-6 flex cursor-pointer gap-3.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--ivory)] p-5 transition-colors hover:border-[var(--brand)]">
        <input
          className="mt-1 size-5 accent-[var(--brand)]"
          type="checkbox"
          checked={form.visaInterest}
          onChange={(event) => update("visaInterest", event.target.checked)}
        />
        <span>
          <span className="block font-bold">{t("contact.visaTitle")}</span>
          <span className="muted mt-1 block text-sm leading-6">{t("contact.visaBody")}</span>
        </span>
      </label>
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
