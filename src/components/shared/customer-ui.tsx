import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Inbox,
  LoaderCircle,
  RefreshCw
} from "lucide-react";
import { cn } from "@/shared/utils";

export function Notice({
  tone = "info",
  title,
  children
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    danger: "border-red-200 bg-red-50 text-red-950"
  };
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? AlertCircle : CircleAlert;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-[var(--radius-control)] border p-4 text-sm leading-6",
        tones[tone]
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={19} />
      <div>
        {title ? <p className="font-bold">{title}</p> : null}
        <div className={title ? "mt-1" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="card grid min-h-72 place-items-center p-8" role="status" aria-live="polite">
      <div className="text-center">
        <LoaderCircle
          aria-hidden="true"
          className="mx-auto animate-spin text-[color:var(--brand)]"
          size={28}
        />
        <p className="muted mt-4 text-sm font-semibold">{label}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card grid min-h-72 place-items-center p-8 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--brand-soft)] text-[color:var(--brand)]">
          <Inbox aria-hidden="true" size={23} />
        </span>
        <h2 className="mt-5 text-xl font-bold tracking-[-0.02em]">{title}</h2>
        <p className="muted mt-2 leading-7">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry
}: {
  title: string;
  description: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="card grid min-h-72 place-items-center border-red-100 p-8 text-center"
      role="alert"
    >
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-[color:var(--danger)]">
          <AlertCircle aria-hidden="true" size={23} />
        </span>
        <h2 className="mt-5 text-xl font-bold tracking-[-0.02em]">{title}</h2>
        <p className="muted mt-2 leading-7">{description}</p>
        {onRetry ? (
          <button className="button-secondary mt-6 gap-2" type="button" onClick={onRetry}>
            <RefreshCw aria-hidden="true" size={17} />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
        {required ? (
          <span className="ml-1 text-[color:var(--danger)]" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="mt-2 block text-sm font-semibold text-[color:var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="muted mt-2 block text-xs leading-5">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClassName =
  "min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-white px-3.5 text-[color:var(--ink)] outline-none transition placeholder:text-slate-400 hover:border-[var(--brand)] focus:border-[var(--brand)] focus:ring-[3px] focus:ring-[var(--brand-soft)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-slate-50 disabled:text-slate-500";

export const textareaClassName = `${inputClassName} min-h-28 py-3`;

export const selectClassName = `${inputClassName} cursor-pointer appearance-none pr-10`;

/**
 * A <select> that draws its own chevron. The native indicator is positioned by
 * the browser against a control this tall, which puts it off centre in Chrome
 * and somewhere else again in Safari; owning the arrow keeps every dropdown on
 * the site looking like the same control.
 */
export function SelectControl({
  value,
  onChange,
  label,
  children
}: {
  value: string | number;
  onChange: (value: string) => void;
  label?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        className={selectClassName}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[color:var(--ink-soft)]"
        size={17}
      />
    </div>
  );
}
