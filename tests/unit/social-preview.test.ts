import { describe, expect, it } from "vitest";
import messagesEn from "../../messages/en.json";
import messagesVi from "../../messages/vi.json";
import { COMPANY } from "../../src/shared/company";
import { SOCIAL_PREVIEW_IMAGE } from "../../src/shared/social-preview";

/*
 * These tags are the whole of a link preview, and nothing in the product breaks
 * when one goes missing: the site keeps working while every pasted link shows
 * the reader's guess instead of the agency. Asserted here because the only
 * other way to notice is to paste the URL somewhere and look at it.
 */

const LOCALE_MESSAGES = { en: messagesEn, vi: messagesVi } as const;

describe("social preview image", () => {
  it("is served over https or from our own origin", () => {
    const { url } = SOCIAL_PREVIEW_IMAGE;
    expect(url.startsWith("https://") || url.startsWith("/")).toBe(true);
  });

  it("clears the size a large summary card needs", () => {
    expect(SOCIAL_PREVIEW_IMAGE.width).toBeGreaterThanOrEqual(600);
    expect(SOCIAL_PREVIEW_IMAGE.height).toBeGreaterThanOrEqual(315);
  });

  it("carries alternative text, which is read aloud in place of the image", () => {
    expect(SOCIAL_PREVIEW_IMAGE.alt.trim().length).toBeGreaterThan(0);
  });
});

describe("canonical site URL", () => {
  it("is an absolute https origin with no trailing slash or path", () => {
    const url = new URL(COMPANY.siteUrl);
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/");
    expect(COMPANY.siteUrl.endsWith("/")).toBe(false);
  });
});

describe("preview text, per language", () => {
  /*
   * A title long enough to be cut off mid-word is worse than a short one: the
   * agency's name has to survive the truncation, and it leads both titles.
   */
  it.each(Object.entries(LOCALE_MESSAGES))(
    "%s names the agency and describes the site",
    (_locale, messages) => {
      expect(messages.Metadata.title).toContain(COMPANY.name);
      expect(messages.Metadata.description.length).toBeGreaterThan(50);
    }
  );
});
