/**
 * Canonical public company identity shared across every product surface.
 */
export const COMPANY = {
  name: "NEWTEC TRAVEL AND TOURS",
  shortName: "NEWTEC",
  owner: {
    name: "Hanh Vong",
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
    address: "newtec@sbcglobal.net",
    href: "mailto:newtec@sbcglobal.net"
  },
  reviewsUrl: "https://www.yelp.com/biz/newtec-travel-agency-daly-city",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=836%20Schwerin%20Street%2C%20Daly%20City%2C%20CA%2094014"
} as const;

export const COMPANY_SMTP_FROM = `${COMPANY.name} <${COMPANY.email.address}>`;
