import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/*
 * The Google tag is the one third party the browser may talk to, pinned to
 * the exact hosts Google documents for conversion tracking: the loader, the
 * ping endpoints, and the linker iframe. Everything else is still this origin
 * only. Duffel is called from the server, so it belongs in none of these.
 */
/*
 * googleads.g.doubleclick.net appears in both lists because the tag sends the
 * same ping over whichever transport survives: fetch, image, or a script
 * element. ad.doubleclick.net joined in a September 2026 tag revision.
 */
const googleTagScript = "https://www.googletagmanager.com https://googleads.g.doubleclick.net";
const googleTagPings =
  "https://www.googletagmanager.com https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://ad.doubleclick.net";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${googleTagScript}${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${googleTagPings}`,
  "font-src 'self' data:",
  `connect-src 'self' ws: wss: ${googleTagPings}`,
  "frame-src https://td.doubleclick.net https://www.googletagmanager.com",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join("; ");

export default withNextIntl({
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy }
        ]
      }
    ];
  }
});
