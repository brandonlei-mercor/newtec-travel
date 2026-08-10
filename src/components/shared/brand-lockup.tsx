import { PANEL, PLANE, SUBLINE } from "@/shared/brand-artwork";
import { COMPANY } from "@/shared/company";
import { cn } from "@/shared/utils";

/*
 * The country the agency sells, drawn as its own flag. This one is not off the
 * business card: the outline is Natural Earth's 50m country polygon (public
 * domain), reprojected to Web Mercator so it reads as the Vietnam people know
 * from maps, then simplified until the next point removed would start to show
 * at header size. Mainland only — Phu Quoc and the bay islands come out under
 * a pixel at 48px tall and would only render as dirt. Do not hand-edit it.
 */
const VIETNAM = {
  width: 475,
  height: 1000,
  path: "M379.5 129.0L368.8 129.8L342.9 144.6L339.3 160.6L327.0 168.0L295.8 164.4L300.3 182.8L287.2 197.3L285.0 213.8L262.2 234.3L250.4 237.9L226.8 304.9L244.2 336.7L283.8 374.7L282.5 390.2L275.5 388.3L370.5 485.0L383.1 484.5L398.6 500.8L418.8 534.9L434.6 548.8L451.7 593.3L465.9 650.9L464.9 657.0L462.2 651.0L463.8 689.4L473.7 711.0L475.0 734.7L467.9 724.6L460.4 731.6L465.9 748.5L459.6 746.9L463.0 777.5L459.1 774.6L459.1 792.8L454.8 801.0L448.7 801.5L445.3 818.5L434.5 819.9L398.9 845.1L387.4 847.6L381.3 859.3L333.3 880.5L322.0 873.9L316.8 863.2L312.9 880.4L298.6 871.5L290.7 876.1L299.5 877.5L300.6 887.3L281.5 887.1L302.4 899.1L290.1 916.0L260.3 892.2L284.3 918.6L288.6 930.4L275.9 936.0L240.4 906.8L261.7 933.5L262.3 946.5L219.0 966.5L207.4 985.7L193.9 997.0L171.6 999.1L179.8 989.3L174.7 985.6L176.4 932.7L180.2 918.9L192.6 910.4L173.6 893.4L164.6 895.6L149.2 879.7L158.2 872.8L176.8 871.5L189.5 860.5L189.5 846.6L206.9 851.0L212.8 844.0L235.5 841.4L241.9 849.8L262.0 854.3L261.9 838.3L242.1 821.3L241.8 798.7L251.8 790.6L277.3 795.3L278.3 777.9L296.9 775.9L330.1 754.3L341.9 757.2L349.2 750.3L352.4 738.7L347.2 706.0L355.6 678.8L337.8 632.8L340.0 616.6L351.1 597.7L347.5 575.6L358.7 557.0L327.1 520.2L341.8 510.1L342.1 503.9L311.8 483.0L306.7 472.0L299.4 476.2L294.0 473.5L286.9 462.8L284.0 442.2L231.4 388.9L216.2 360.5L193.9 343.4L196.0 326.5L168.1 316.1L114.5 281.6L125.6 269.4L123.6 256.2L159.7 260.0L181.8 232.5L176.6 219.7L166.9 219.5L161.7 207.8L145.4 203.2L159.4 189.0L128.1 168.2L97.9 185.5L63.4 172.0L47.0 145.9L53.4 116.9L44.7 108.1L39.7 117.2L34.7 117.3L29.5 101.3L0.0 68.1L22.3 41.9L55.5 63.2L77.9 40.6L88.6 53.4L96.9 39.7L117.8 56.8L130.9 38.5L145.7 45.2L166.2 36.9L173.2 30.6L177.7 14.8L204.4 0.0L222.1 19.3L241.2 29.8L261.0 26.5L269.5 34.4L286.6 30.8L302.1 40.0L287.1 59.5L294.5 96.1L314.4 100.0L339.1 122.0L365.6 118.8Z",
  /* The flag's star, sitting where the north has the most room for it, which is
     where a flag-filled map is normally drawn. */
  star: "M215.1 52.6L231.4 102.8L284.3 102.8L241.5 133.9L257.9 184.2L215.1 153.1L172.4 184.2L188.7 133.9L145.9 102.8L198.8 102.8Z"
};

/*
 * Literal colours, not palette tokens: these two belong to the flag, so the
 * site does not get to restyle them the way it restyles its own navy.
 */
const FLAG_RED = "#da251d";
const FLAG_YELLOW = "#ffff00";

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
