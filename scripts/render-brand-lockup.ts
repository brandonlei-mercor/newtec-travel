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
import { PANEL, PLANE, SUBLINE } from "../src/shared/brand-artwork";

/** The navy the site draws the lockup in, and the white it sits on in mail. */
const INK = "#1f3a93";
const STOCK = "#ffffff";

/*
 * Displayed at 229px wide in the signature. Rendered at three times that so it
 * stays sharp on a retina screen and on the 2x images Gmail serves; the speed
 * rules under the wordmark are the first thing to turn to mush when it is not.
 */
const SCALE = 3;
const PLANE_HEIGHT = 48;
const WORDMARK_HEIGHT = 46;
const GAP = 12;

const planeWidth = (PLANE.width / PLANE.height) * PLANE_HEIGHT;
const wordmarkWidth = (PANEL.width / SUBLINE.height) * WORDMARK_HEIGHT;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: ${STOCK}; }
  #lockup {
    display: flex; align-items: center; gap: ${GAP}px;
    width: ${Math.ceil(planeWidth + GAP + wordmarkWidth)}px;
    height: ${PLANE_HEIGHT}px; background: ${STOCK};
  }
</style></head>
<body><div id="lockup">
  <svg width="${planeWidth}" height="${PLANE_HEIGHT}" viewBox="0 0 ${PLANE.width} ${PLANE.height}">
    <path d="${PLANE.path}" fill="${INK}" fill-rule="evenodd" />
  </svg>
  <svg width="${wordmarkWidth}" height="${WORDMARK_HEIGHT}" viewBox="0 0 ${PANEL.width} ${SUBLINE.height}">
    <rect width="${PANEL.width}" height="${SUBLINE.height}" fill="${STOCK}" />
    <path d="${PANEL.path}" fill="${INK}" fill-rule="evenodd" />
    <path d="${SUBLINE.path}" fill="${INK}" fill-rule="evenodd" />
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
