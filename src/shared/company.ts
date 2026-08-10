/**
 * Canonical public company identity shared across every product surface.
 */
export const COMPANY = {
  name: "NEWTEC TRAVEL AND TOURS",
  shortName: "NEWTEC",
  /*
   * Where the site lives, for the canonical link and for the URL a shared
   * preview card names. Deliberately a constant rather than APP_URL: the pages
   * are prerendered, so their metadata is written during the image build, where
   * APP_URL is still its localhost default. Reading it from the environment
   * would bake "http://localhost:3000" into production's og:url. This is one
   * fixed public fact about the business, not per-environment configuration.
   */
  siteUrl: "https://newtectravel.com",
  owner: {
    name: "Hanh Newtec",
    title: "Travel Specialist"
  },
  /*
   * The city, and no further. The office is a room in Hanh's own building and
   * the business runs by appointment, so a street address on a public page
   * invites walk-ins to a door nobody is watching. Daly City is enough to place
   * the agency for the families who care that it is local.
   */
  locality: "Daly City, CA",
  /*
   * Email is the only inbound channel the site publishes. Hanh is on the phone
   * with the airlines most of the day, so a number on the page promises a pickup
   * that often cannot happen; a request in the inbox is answered either way.
   */
  email: {
    address: "newtectravelagency@gmail.com",
    href: "mailto:newtectravelagency@gmail.com"
  },
  reviewsUrl: "https://www.yelp.com/biz/newtec-travel-agency-daly-city"
} as const;

export const COMPANY_SMTP_FROM = `${COMPANY.name} <${COMPANY.email.address}>`;
