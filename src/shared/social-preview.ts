/**
 * The card a pasted link turns into: iMessage, WhatsApp, Slack, Facebook, and
 * X all read the same Open Graph tags, so one description here covers every
 * place somebody shares the site.
 *
 * Without these tags Apple's link preview falls back to guessing, and its guess
 * is the domain name plus whatever image it finds first or has cached from
 * whatever answered that hostname before. A domain that used to serve a parked
 * page therefore keeps previewing that parked page.
 */

/*
 * Hotlinked from TripAdvisor's CDN at the owner's request. Two things to know
 * before relying on it: the photo is a TripAdvisor member upload rather than
 * anything licensed for reuse here, and the path is theirs to rotate, which
 * would empty the preview without any error on our side. `hoi-an-night.jpg` in
 * public/images/travel is the same subject under CC BY 4.0 and already credited
 * in that folder's ATTRIBUTION.md, so switching is a one-line edit:
 *
 *   url: "/images/travel/hoi-an-night.jpg"
 *
 * A path works in place of a full URL because the metadata below sets
 * metadataBase, which Next resolves relative image paths against.
 */
export const SOCIAL_PREVIEW_IMAGE = {
  url: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/28/62/03/7a/caption.jpg?w=900&h=500&s=1",
  /*
   * Stated so a scraper can reserve the right shape before the bytes arrive.
   * At 900x500 this clears the 600x315 floor for a large summary card, so the
   * preview renders as a wide image rather than a thumbnail beside the title.
   */
  width: 900,
  height: 500,
  alt: "Lantern-lit streets of Hoi An old town at night"
} as const;

/*
 * A preview image is fetched by the recipient's device, not by us, so an
 * http: URL would have a stranger's phone make a cleartext request on our
 * behalf and a javascript: or data: URL is never a legitimate image source.
 * Checked at import rather than trusted, because the constant above is edited
 * by hand and a bad scheme is invisible until somebody pastes the link.
 */
if (!SOCIAL_PREVIEW_IMAGE.url.startsWith("/") && !SOCIAL_PREVIEW_IMAGE.url.startsWith("https://")) {
  throw new Error("SOCIAL_PREVIEW_IMAGE.url must be an https: URL or a site-relative path");
}
