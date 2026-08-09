import type { PassengerType } from "@/shared/contracts/inquiry";
import type { FlightOffer, SearchDestination, SearchOrigin } from "@/shared/contracts/search";

/** Where a request can be for: any airport the search sells, or "help me pick". */
export type Destination = SearchDestination | "FLEXIBLE";

export type ContactMethod = "EMAIL" | "PHONE";

export type InquiryPayload = {
  origin: SearchOrigin;
  destination: Destination;
  tripType: "ROUND_TRIP" | "ONE_WAY";
  departureDate: string;
  /** Absent on a one-way request; the server contract rejects it there. */
  returnDate?: string;
  flexibility: "EXACT" | "PLUS_MINUS_1" | "PLUS_MINUS_2" | "PLUS_MINUS_3";
  cabinPreference: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "NO_PREFERENCE";
  travelers: { adults: number; children: number; infants: number };
  /**
   * Whichever travelers the customer named, as their passports spell them, in
   * the order the form asked. Absent when nobody was named — the names are
   * optional and the rest are collected by phone — and the server rejects a
   * manifest that names more heads than `travelers` was quoted for.
   */
  passengers?: {
    type: PassengerType;
    givenName: string;
    familyName: string;
    dateOfBirth: string;
  }[];
  /** One line describing the flight the customer checked out with. */
  selectedOffer?: string;
  specialAssistance?: string;
  notes?: string;
  contact: {
    givenName: string;
    familyName: string;
    email: string;
    /* Both channels are collected so a wrong digit or a bounced email is not a lost lead. */
    phone: string;
    preferredContactMethod: ContactMethod;
    preferredLanguage: "en" | "vi";
  };
  visaInterest: boolean;
  transactionalConsent: true;
  partyDataAuthority: true;
  marketingConsent: boolean;
};

/**
 * The flight a customer chose, resolved on the server from our own offer cache
 * and handed to the request form. The form never lets these change: they are
 * what the shown price was quoted for, so editing them here would make the
 * price a lie. Changing any of them means going back to search.
 */
export type FlightSelection = {
  offer: FlightOffer;
  origin: SearchOrigin;
  /** Never FLEXIBLE: a priced offer flies to exactly one airport. */
  destination: SearchDestination;
  tripType: "ROUND_TRIP" | "ONE_WAY";
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  infants: number;
  cabin: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS";
  /** The one-line summary written into the agency's notification email. */
  summary: string;
  /** Back to the search that produced this flight, with the same query. */
  searchQuery: string;
};

export type InquiryResponse = {
  inquiryId: string;
  reference: string;
};
