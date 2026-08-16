/*
 * Rasterises the traced lockup into public/brand/lockup.png.
 *
 * The site draws the artwork as inline SVG, which no email client can be
 * trusted with: Gmail strips <svg> entirely and Outlook renders it as nothing.
 * The welcome email therefore carries a PNG, and this script is how that PNG
 * is made rather than a binary someone once exported by hand and cannot
 * reproduce. Run it again after any change to src/shared/brand-artwork.ts:
 *
 *   pnpm brand:lockup
 *
 * Chromium comes from the Playwright install the end-to-end tests already
 * need, so this adds no dependency of its own.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { EMAIL_LOCKUP, PANEL, PLANE, SUBLINE, VIETNAM } from "../src/shared/brand-artwork";

/** The navy the site draws the lockup in, and the white it sits on in mail. */
const INK = "#1f3a93";
const STOCK = "#ffffff";

/*
 * Rendered at three times its displayed size so it stays sharp on a retina
 * screen and on the 2x images Gmail serves; the speed rules under the wordmark
 * are the first thing to turn to mush when it is not. Every dimension comes
 * from EMAIL_LOCKUP, which the email also sizes its <img> by, so the picture
 * and the box it is drawn into cannot drift apart.
 */
const SCALE = 3;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: ${STOCK}; }
  #lockup {
    display: flex; align-items: center; gap: ${EMAIL_LOCKUP.gap}px;
    width: ${EMAIL_LOCKUP.width}px;
    height: ${EMAIL_LOCKUP.height}px; background: ${STOCK};
  }
</style></head>
<body><div id="lockup">
  <svg width="${EMAIL_LOCKUP.planeWidth}" height="${EMAIL_LOCKUP.markHeight}" viewBox="0 0 ${PLANE.width} ${PLANE.height}">
    <path d="${PLANE.path}" fill="${INK}" fill-rule="evenodd" />
  </svg>
  <svg width="${EMAIL_LOCKUP.wordmarkWidth}" height="${EMAIL_LOCKUP.wordmarkHeight}" viewBox="0 0 ${PANEL.width} ${SUBLINE.height}">
    <rect width="${PANEL.width}" height="${SUBLINE.height}" fill="${STOCK}" />
    <path d="${PANEL.path}" fill="${INK}" fill-rule="evenodd" />
    <path d="${SUBLINE.path}" fill="${INK}" fill-rule="evenodd" />
  </svg>
  <!-- The country closes the lockup in the signature exactly as it does in the
       site header, in the same ink as the plane and the wordmark. -->
  <svg width="${EMAIL_LOCKUP.vietnamWidth}" height="${EMAIL_LOCKUP.markHeight}" viewBox="0 0 ${VIETNAM.width} ${VIETNAM.height}">
    <path d="${VIETNAM.path}" fill="${INK}" fill-rule="evenodd" />
  </svg>
</div></body></html>`;

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: SCALE });
    const tab = await context.newPage();
    await tab.setContent(page, { waitUntil: "load" });
    const lockup = tab.locator("#lockup");
    const png = await lockup.screenshot({ type: "png" });
    const out = path.join(process.cwd(), "public", "brand");
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "lockup.png"), png);
    console.log(`Wrote public/brand/lockup.png (${png.length} bytes)`);
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
