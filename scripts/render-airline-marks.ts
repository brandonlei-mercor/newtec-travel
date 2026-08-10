/*
 * Rasterises the airline marks into public/brand/airlines/<IATA>.png.
 *
 * The site draws these as SVG, which the welcome email cannot: Gmail strips
 * <svg> and Outlook renders nothing at all. The email attaches a PNG per
 * carrier instead, and this is how those PNGs are made rather than a set of
 * files someone once exported by hand. Run it again if a mark is replaced or a
 * carrier is added:
 *
 *   pnpm brand:airlines
 *
 * The background is left transparent so a mark sits on whatever the mail client
 * paints behind it, dark mode included.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { EMAIL_AIRLINE_MARK } from "../src/shared/brand-artwork";
import { SEARCH_SHOWN_CARRIERS } from "../src/shared/contracts/search";

const SOURCE = path.join(process.cwd(), "public", "images", "airlines");
const OUT = path.join(process.cwd(), "public", "brand", "airlines");

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: EMAIL_AIRLINE_MARK.scale });
    const tab = await context.newPage();
    await mkdir(OUT, { recursive: true });

    for (const carrier of SEARCH_SHOWN_CARRIERS) {
      const svg = await readFile(path.join(SOURCE, `${carrier}.svg`), "utf8");
      /*
       * Inlined as a data URI rather than loaded from disk: the page has no
       * origin of its own, and this keeps the mark and the height it is drawn
       * at in one place the screenshot can bound exactly.
       */
      const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      await tab.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>
           html, body { margin: 0; padding: 0; background: transparent; }
           img { display: block; height: ${EMAIL_AIRLINE_MARK.height}px; width: auto; }
         </style></head><body><img id="mark" src="${source}" /></body></html>`,
        { waitUntil: "load" }
      );
      const png = await tab.locator("#mark").screenshot({ type: "png", omitBackground: true });
      await writeFile(path.join(OUT, `${carrier}.png`), png);
      console.log(`Wrote public/brand/airlines/${carrier}.png (${png.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
