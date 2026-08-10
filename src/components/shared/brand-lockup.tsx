import { FLAG_RED, FLAG_YELLOW, PANEL, PLANE, SUBLINE, VIETNAM } from "@/shared/brand-artwork";
import { COMPANY } from "@/shared/company";
import { cn } from "@/shared/utils";

function PlaneMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 text-[color:var(--brand)]", className)}
      viewBox={`0 0 ${PLANE.width} ${PLANE.height}`}
    >
      <path d={PLANE.path} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

function VietnamMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0", className)}
      viewBox={`0 0 ${VIETNAM.width} ${VIETNAM.height}`}
    >
      <path d={VIETNAM.path} fill={FLAG_RED} fillRule="evenodd" />
      <path d={VIETNAM.star} fill={FLAG_YELLOW} />
    </svg>
  );
}

function Wordmark({ className, stock }: { className?: string; stock: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("text-[color:var(--brand)]", className)}
      viewBox={`0 0 ${PANEL.width} ${SUBLINE.height}`}
    >
      {/* The card stock the letters are cut out of. Without it they would take
          the colour of whatever the lockup happens to be sitting on, so it has
          to be told which surface it is printed on. */}
      <rect width={PANEL.width} height={SUBLINE.height} fill={stock} />
      <path d={PANEL.path} fill="currentColor" fillRule="evenodd" />
      <path d={SUBLINE.path} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function BrandLockup({
  compact = false,
  className,
  // The footer surface, since that is where the full lockup sits; anywhere on
  // another background has to say so, or the wordmark shows as a cream block.
  stock = "var(--sand-soft)"
}: {
  compact?: boolean;
  className?: string;
  stock?: string;
}) {
  return (
    <span
      aria-label={COMPANY.name}
      className={cn("inline-flex items-center gap-3", className)}
      role="img"
    >
      {/* On the card the airliner towers over the wordmark. A horizontal lockup
          cannot carry that, so it keeps the taller of the two heights. */}
      <PlaneMark className={compact ? "h-12 w-auto" : "h-[72px] w-auto"} />
      {/*
       * The agency's name is all four words, so the header carries the subline
       * too rather than reading as a company called NEWTEC. That costs height:
       * the subline makes the artwork 281 units tall instead of 188, so at a
       * fixed CSS height the NEWTEC panel renders at two thirds of it. 46px
       * leaves the panel around 31px, just clear of the roughly 30px where the
       * speed rules stop resolving, and the whole lockup still sits inside the
       * header's 64px row.
       */}
      <Wordmark className={compact ? "h-[46px] w-auto" : "h-14 w-auto"} stock={stock} />
      {/* Closing the lockup where the plane opens it: the name sits between the
          aircraft and the country, which is the whole of what the agency does.
          It takes the plane's height rather than the wordmark's, so the two
          ends of the lockup carry the same weight. */}
      <VietnamMark className={compact ? "h-12 w-auto" : "h-[72px] w-auto"} />
    </span>
  );
}
