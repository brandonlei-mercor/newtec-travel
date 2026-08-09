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
  address: {
    line1: "836 Schwerin Street",
    line2: "Daly City, CA 94014",
    formatted: "836 Schwerin Street, Daly City, CA 94014"
  },
  phone: {
    display: "(415) 626 3579",
    href: "tel:+14156263579"
  },
  email: {
    address: "newtectravelagency@gmail.com",
    href: "mailto:newtectravelagency@gmail.com"
  },
  reviewsUrl: "https://www.yelp.com/biz/newtec-travel-agency-daly-city",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=836%20Schwerin%20Street%2C%20Daly%20City%2C%20CA%2094014"
} as const;

export const COMPANY_SMTP_FROM = `${COMPANY.name} <${COMPANY.email.address}>`;
