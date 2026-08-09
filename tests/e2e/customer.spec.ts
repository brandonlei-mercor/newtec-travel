import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seedOfferCache, type SeededOffer } from "./helpers/offer-cache";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "local-admin-password";

test.describe("customer experience", () => {
  // Match Next's canonical dev origin so interactive client components hydrate reliably.
  test.use({ baseURL: "http://localhost:3000" });

  let seeded: SeededOffer;

  test.beforeAll(async () => {
    seeded = await seedOfferCache();
  });

  test("landing page explains the concierge model", async ({ page }) => {
    await page.goto("/en");

    await expect(
      page.getByRole("banner").getByRole("link", { name: "NEWTEC TRAVEL AND TOURS home" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Let me take care of your trip to Vietnam." })
    ).toBeVisible();
    // The hero is the search: the page has no other job.
    await expect(page.getByRole("button", { name: "Search flights" })).toBeVisible();
    /*
     * Every request starts from a flight, so the closing call to action is the
     * search rather than a blank form. The header carries the same link, but it
     * collapses into the menu on a phone, and this page reads the same on both.
     */
    await expect(page.getByRole("link", { name: "Find your flights" })).toHaveAttribute(
      "href",
      "/en/flights"
    );
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Tel (415) 626 3579" })
    ).toHaveAttribute("href", "tel:+14156263579");
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Reviews" })
    ).toHaveAttribute("href", "https://www.yelp.com/biz/newtec-travel-agency-daly-city");
  });

  test("an unprefixed visit lands in English", async ({ page }) => {
    // English is the front door; Vietnamese is a tap away in the header.
    await page.goto("/");

    await expect(page).toHaveURL(/\/en$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Let me take care of your trip to Vietnam." })
    ).toBeVisible();
  });

  test("a request with no flight behind it goes back to the search", async ({ page }) => {
    // There is no blank request form to land on: without a chosen flight there
    // is nothing to quote, and the customer is sent back to pick one.
    await page.goto("/en/request");
    await expect(page).toHaveURL(/\/en\/flights$/);

    // A reference that was never quoted here is the same dead end.
    await page.goto(`/en/request?${seeded.search}&offerRef=off_never_quoted_here`);
    await expect(page).toHaveURL(/\/en\/flights$/);
  });

  test("the chosen flight stays on screen for the whole request", async ({ page }) => {
    await openCheckout(page, seeded);

    const flightCard = page.getByRole("region", { name: "Your flight" });
    await expect(flightCard).toBeVisible();
    await expect(flightCard).toContainText("Total for 2 travelers");
    // The price covers the whole service, and saying so is not optional.
    await expect(flightCard).toContainText("This is the whole package");
    // Changing the trip means changing the flight, so the only edit is back to search.
    await expect(flightCard.getByRole("link", { name: "Change" })).toBeVisible();

    await fillContactStep(page, "Sticky");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("group", { name: "Review your request" })).toBeVisible();
    // Still there on the last step: this is what is being sent.
    await expect(flightCard).toBeVisible();
    await expect(flightCard).toContainText("Total for 2 travelers");
  });

  test("both contact channels are required even though one is preferred", async ({ page }) => {
    await openCheckout(page, seeded);

    await page.getByLabel("First name").fill("E2E");
    await page.getByLabel("Last name").fill("Traveler");
    await page.getByLabel("Email address").fill("e2e@example.test");
    // Preferring email must not make the phone number optional: the agency
    // calls back, and a filtered mailbox cannot be the only route to a lead.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Please review" })).toBeVisible();
    await expect(page.getByText("Enter a phone number I can call.")).toBeVisible();
  });

  test("Vietnamese locale provides a translated checkout", async ({ page }) => {
    await page.goto(`/vi/request?${seeded.search}&offerRef=${seeded.offerRef}`);
    await page.locator("form[data-hydrated='true']").waitFor();

    await expect(
      page.getByRole("heading", { level: 1, name: "Gửi chuyến bay này cho tôi" })
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Chuyến bay của anh chị" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tiếp tục" })).toBeVisible();
  });

  test("traveler can send a real request for a flight they picked", async ({ page }) => {
    await pickFirstFlight(page, seeded);
    await submitCheckout(page, "Traveler");

    await expect(page).toHaveURL(/\/en\/request\/received/);
    await expect(
      page.getByRole("heading", { level: 1, name: "I’ll take it from here." })
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText(/TV-[A-Z0-9]+/);
    // The confirmation reflects the channel the customer chose.
    await expect(page.getByText("contact you by phone")).toBeVisible();
  });

  test("every page a customer sees prices on points at the agency phone", async ({ page }) => {
    const band =
      "For other flights, or for group travel and business class discounts, send me your request or give me a call and I’ll price them for you.";

    // Above the fold on both, not buried at the bottom of one of them.
    for (const path of ["/en", "/en/flights"]) {
      await page.goto(path);
      await expect(page.getByText(band)).toBeVisible();
      await expect(page.getByRole("link", { name: "(415) 626 3579" }).first()).toBeVisible();
    }
  });

  test("the board refuses anonymous callers", async ({ page }) => {
    const anonymous = await page.request.get("/admin", { maxRedirects: 0 });
    expect(anonymous.status()).toBe(303);
    expect(anonymous.headers()["location"]).toContain("/admin/login");
    // Customer contact details must never reach a shared cache or a crawler.
    expect(anonymous.headers()["cache-control"]).toContain("no-store");
    expect(anonymous.headers()["x-robots-tag"]).toContain("noindex");

    // A fetch gets an answer it can read rather than a page of HTML.
    const statusChange = await page.request.post(
      "/api/v1/admin/inquiries/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status",
      { data: { status: "PROCESSING" }, maxRedirects: 0 }
    );
    expect(statusChange.status()).toBe(401);
  });

  test("the wrong password does not sign anyone in", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Scoped to the form's own alert: Next ships a route announcer with the same role.
    await expect(page.locator("#admin-password-error")).toContainText("Incorrect password");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("staff signs in and sees submitted requests on the board", async ({ page }) => {
    await pickFirstFlight(page, seeded);
    const reference = await submitCheckout(page, "Boardlist");
    await signIn(page);

    await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: reference });
    await expect(card).toBeVisible();
    await expect(card).toContainText("E2E Boardlist");
    await expect(card).toContainText("(415) 555-0142");
    // Whoever calls back needs the flight, not just the customer.
    await expect(card).toContainText("SFO-SGN round trip");

    // A new request starts in New, and the move survives a reload.
    const newColumn = page.getByRole("region", { name: "New" });
    const processingColumn = page.getByRole("region", { name: "Processing" });
    await expect(newColumn).toContainText(reference);
    await card.getByRole("combobox").selectOption("PROCESSING");
    await expect(processingColumn).toContainText(reference);

    await page.reload();
    await expect(processingColumn).toContainText(reference);
    await expect(newColumn).not.toContainText(reference);
  });

  test("signing out puts the board back behind the password", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("@a11y public pages have no serious or critical axe violations", async ({ page }) => {
    const checkout = `/request?${seeded.search}&offerRef=${seeded.offerRef}`;
    for (const path of [
      "/en",
      `/en${checkout}`,
      "/en/flights",
      "/en/privacy",
      "/en/terms",
      "/en/accessibility",
      "/en/photo-credits",
      "/vi",
      `/vi${checkout}`,
      "/vi/flights",
      "/vi/privacy",
      "/vi/terms",
      "/vi/accessibility",
      "/vi/photo-credits"
    ]) {
      await page.goto(path);
      const result = await new AxeBuilder({ page }).analyze();
      const blocking = result.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical"
      );
      expect(
        blocking,
        `${path}: ${blocking.map((violation) => `${violation.id}: ${violation.help}`).join(", ")}`
      ).toEqual([]);
    }
  });

  test("@a11y the sign-in form and the board have no serious or critical violations", async ({
    page
  }) => {
    await page.goto("/admin/login");
    await expectNoBlockingViolations(page, "/admin/login");

    await signIn(page);
    await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
    await expectNoBlockingViolations(page, "/admin");
  });
});

/** Signs in through the form, the way staff does, and lands on the board. */
async function signIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

async function expectNoBlockingViolations(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  );
  expect(
    blocking,
    `${label}: ${blocking.map((violation) => `${violation.id}: ${violation.help}`).join(", ")}`
  ).toEqual([]);
}

/** Jumps straight to the checkout for the seeded flight. */
async function openCheckout(page: Page, offer: SeededOffer) {
  await page.goto(`/en/request?${offer.search}&offerRef=${offer.offerRef}`);
  await page.locator("form[data-hydrated='true']").waitFor();
}

/**
 * The real route in: open the results for the seeded search and press the button
 * on the first card. Proves the reference the browser sends is one the request
 * page can resolve, which a direct visit to the URL would not.
 */
async function pickFirstFlight(page: Page, offer: SeededOffer) {
  await page.goto(`/en/flights?${offer.search}`);
  const select = page.getByRole("button", { name: "Continue with this flight" }).first();
  await select.waitFor();
  await select.click();
  await page.waitForURL(/\/en\/request\?/);
  await page.locator("form[data-hydrated='true']").waitFor();
}

async function fillContactStep(page: Page, familyName: string) {
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill(familyName);
  await page.getByLabel("Email address").fill(`e2e-${Date.now()}@example.test`);
  await page.getByLabel("Phone number").fill("(415) 555-0142");
  await page.getByRole("radio", { name: "Phone" }).check();
}

/**
 * Sends one complete request so a downstream surface has a row to show, and
 * returns the reference the confirmation names.
 */
async function submitCheckout(page: Page, familyName: string): Promise<string> {
  await fillContactStep(page, familyName);
  await page.getByRole("button", { name: "Continue" }).click();

  await page
    .getByLabel(
      "I agree to receive service messages about this request by email and, if provided, phone."
    )
    .check();
  await page
    .getByLabel("I am authorized to provide trip details for every traveler in this request.")
    .check();
  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page).toHaveURL(/\/en\/request\/received/);

  /*
   * The reference, not the name, is what identifies a request afterwards. Both
   * browser projects submit into the same database, and so does every previous
   * run, so a customer name matches several cards while a reference is one.
   */
  const reference = new URL(page.url()).searchParams.get("reference") ?? "";
  expect(reference).toMatch(/^TV-/);
  return reference;
}
