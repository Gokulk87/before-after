#!/usr/bin/env node
// Captures the README's screenshots from the real tool: `node art/capture.mjs`.
// The showcase pages are served by the real CLI (see showcase.mjs), and each view is shot in light
// and dark, then framed as a Mac window. Not shipped in the npm package.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameShot, startShowcase } from "./showcase.mjs";

const art = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(art, "shots");

/** Frames a screenshot as a Mac window, transparent around it so only the window and its shadow sit on GitHub's page. */
async function frame(browser, shot, theme, { file, ...options }) {
  fs.writeFileSync(path.join(out, file), await frameShot(browser, shot, theme, options));
  console.log(`art/shots/${file}`);
}

const { after: AFTER, stop } = await startShowcase({ afterPort: 5343, beforePort: 5344 });
try {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const views = [
    { name: "side", mode: "side" },
    { name: "stack", mode: "stack" },
    { name: "swipe-x", mode: "swipe", axis: "x", swipe: 50 },
    { name: "swipe-y", mode: "swipe", axis: "y", swipe: 46 },
  ];
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2, colorScheme: theme });
    const tile = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2, colorScheme: theme });
    const open = async (view, page) => {
      await page.goto(AFTER);
      await page.evaluate((v) => {
        localStorage.setItem("before-after:view", JSON.stringify({ mode: v.mode, width: "fit", axis: v.axis || "x", sync: true, mirror: true }));
        localStorage.removeItem("before-after:collapsed");
      }, view);
      await page.reload();
      await page.locator("[data-before-after] .open-compare").click();
      await page.waitForTimeout(1200);
      if (view.swipe) {
        // Drag the handle to a resting spot that shows both versions of the page's busiest parts.
        const knob = await page.locator("[data-before-after] .knob").boundingBox();
        const stage = await page.locator("[data-before-after] .stage").boundingBox();
        const x = view.axis === "x" ? stage.x + (stage.width * view.swipe) / 100 : knob.x + knob.width / 2;
        const y = view.axis === "y" ? stage.y + (stage.height * view.swipe) / 100 : knob.y + knob.height / 2;
        await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
        await page.mouse.down();
        await page.mouse.move(x, y, { steps: 8 });
        await page.mouse.up();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(300);
      }
      return page.screenshot();
    };

    for (const view of views) {
      await frame(browser, await open(view, tile), theme, { width: 1180, pad: 36, file: `${view.name}-${theme}.png` });
    }
    await tile.close();

    // The pill on the page, close up.
    await page.goto(AFTER);
    await page.evaluate(() => localStorage.removeItem("before-after:collapsed"));
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(900);
    const pill = await page.locator("[data-before-after] .pill").boundingBox();
    const clip = { x: Math.round(pill.x - 100), y: Math.round(pill.y - 44), width: Math.round(pill.width + 200), height: Math.round(pill.height + 88) };
    await frame(browser, await page.screenshot({ clip }), theme, { width: clip.width * 2, pad: 48, file: `pill-${theme}.png`, chrome: false });
    await page.close();
  }
  await browser.close();
} finally {
  stop();
}
