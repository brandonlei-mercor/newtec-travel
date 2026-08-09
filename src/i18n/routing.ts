import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "vi"],
  /*
   * English is the front door and Vietnamese is one tap away in the header.
   * Accept-Language detection stays off deliberately: which language a visitor
   * reads the site in is their choice to make, not a guess from a browser
   * setting that a shared or borrowed device gets wrong.
   */
  defaultLocale: "en",
  localeDetection: false
});
