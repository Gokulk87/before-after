#!/usr/bin/env node
// Records the README's demo GIF from the real tool: `node art/record.mjs`.
// Drives the Compare view with a visible cursor (open, stacked, swipe across, swipe down, back to side
// by side), frames every shot as a Mac window, and encodes a looping GIF per theme. Unchanged pixels
// are left transparent from frame to frame, which keeps the file small. Not shipped in the npm package.
import { chromium } from "@playwright/test";
import gifenc from "gifenc";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const { GIFEncoder, applyPalette, quantize } = gifenc;
import { frameShot, startShowcase } from "./showcase.mjs";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
const W = 960, H = 600;
const BACKGROUND = { light: "#ffffff", dark: "#0d1117" }; // GitHub's page colors: GIFs can't be transparent
const CURSOR = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M4 2.5 17.5 12l-6 1.2 3.4 6.6-2.7 1.3-3.3-6.7L4 18.6z" fill="#000" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

const { after, stop } = await startShowcase({ afterPort: 5353, beforePort: 5354 });
const browser = await chromium.launch();
try {
  fs.mkdirSync(out, { recursive: true });
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: theme });
    await page.goto(after);
    await page.evaluate(() => {
      localStorage.setItem("before-after:view", JSON.stringify({ mode: "side", width: "fit", axis: "x", sync: true, mirror: true }));
      localStorage.removeItem("before-after:collapsed");
    });
    await page.reload();
    await page.waitForTimeout(700);
    // A cursor drawn into the page (screenshots don't include the real one), kept above the Compare
    // window by re-showing it as a popover after the window opens.
    await page.evaluate((svg) => {
      const cursor = document.createElement("div");
      cursor.popover = "manual";
      cursor.style.cssText = "position:fixed;inset:auto;left:0;top:0;margin:0;padding:0;border:0;background:none;overflow:visible;pointer-events:none;width:22px;height:22px;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))";
      cursor.innerHTML = svg;
      document.body.append(cursor);
      cursor.showPopover();
      window.__cursorTo = (x, y) => (cursor.style.translate = `${x - 4}px ${y - 2}px`);
      window.__raiseCursor = () => (cursor.hidePopover(), cursor.showPopover());
    }, CURSOR);

    const frames = [];
    const snap = async (delay) => frames.push({ png: await page.screenshot(), delay });
    // Films real time (pane animations) for `ms`, one frame per screenshot.
    const film = async (ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const start = Date.now();
        frames.push({ png: await page.screenshot(), delay: 0 });
        frames.at(-1).delay = Math.max(40, Date.now() - start);
      }
    };
    let at = { x: W * 0.62, y: H * 0.5 };
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const move = async (x, y, steps = 9) => {
      const from = at;
      for (let i = 1; i <= steps; i++) {
        const t = ease(i / steps);
        const p = { x: from.x + (x - from.x) * t, y: from.y + (y - from.y) * t };
        await page.mouse.move(p.x, p.y);
        await page.evaluate(([px, py]) => window.__cursorTo(px, py), [p.x, p.y]);
        await snap(40);
      }
      at = { x, y };
    };
    const center = async (selector) => {
      const box = await page.locator(selector).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const clickOn = async (selector) => {
      const c = await center(selector);
      await move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.up();
    };
    const stageAt = async (rx, ry) => {
      const box = await page.locator("[data-before-after] .stage").boundingBox();
      return { x: box.x + box.width * rx, y: box.y + box.height * ry };
    };

    await page.evaluate(([x, y]) => window.__cursorTo(x, y), [at.x, at.y]);
    await snap(900);
    await clickOn("[data-before-after] .open-compare");
    await page.evaluate(() => window.__raiseCursor());
    await film(450);
    await snap(1300);

    await clickOn('[data-before-after] button[data-mode="stack"]');
    await film(550);
    await snap(1300);

    await clickOn('[data-before-after] button[data-mode="swipe"]');
    await film(500);
    const knobX = await center("[data-before-after] .knob");
    await move(knobX.x, knobX.y);
    await page.mouse.down();
    for (const [rx, steps] of [[0.22, 12], [0.8, 18], [0.5, 10]]) {
      const p = await stageAt(rx, 0);
      await move(p.x, knobX.y, steps);
    }
    await page.mouse.up();
    await snap(500);

    await clickOn('[data-before-after] button[data-axis="y"]');
    await film(250);
    const knobY = await center("[data-before-after] .knob");
    await move(knobY.x, knobY.y);
    await page.mouse.down();
    for (const [ry, steps] of [[0.25, 12], [0.8, 18], [0.5, 10]]) {
      const p = await stageAt(0, ry);
      await move(knobY.x, p.y, steps);
    }
    await page.mouse.up();
    await snap(600);

    await clickOn('[data-before-after] button[data-mode="side"]');
    await film(550);
    await snap(1600);
    await page.close();

    // Frame every shot as a Mac window on GitHub's page color, then encode.
    const framed = [];
    for (const { png, delay } of frames) {
      const image = PNG.sync.read(await frameShot(browser, png, theme, { width: W, pad: 24, background: BACKGROUND[theme] }));
      framed.push({ image, delay });
    }
    const file = path.join(out, `demo-${theme}.gif`);
    fs.writeFileSync(file, encode(framed));
    console.log(`art/shots/demo-${theme}.gif  ${frames.length} frames  ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
  }
} finally {
  await browser.close();
  stop();
}

/** One global palette from a sample of frames, plus a reserved transparent index for unchanged pixels. */
function encode(framed) {
  const { width, height } = framed[0].image;
  const sample = [];
  const step = Math.max(1, Math.floor(framed.length / 12));
  for (let i = 0; i < framed.length; i += step) {
    const data = framed[i].image.data;
    for (let p = 0; p < data.length; p += 4 * 7) sample.push(data[p], data[p + 1], data[p + 2], 255);
  }
  const palette = quantize(new Uint8Array(sample), 255);
  const transparentIndex = palette.length;
  palette.push([255, 0, 255]);

  const gif = GIFEncoder();
  let previous = null;
  framed.forEach(({ image, delay }, i) => {
    const index = applyPalette(image.data, palette.slice(0, transparentIndex));
    let pixels = index;
    if (previous) {
      pixels = new Uint8Array(index);
      for (let p = 0; p < pixels.length; p++) if (index[p] === previous[p]) pixels[p] = transparentIndex;
    }
    gif.writeFrame(pixels, width, height, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: i === 0 ? 0 : undefined,
      transparent: i > 0,
      transparentIndex,
      dispose: 1,
    });
    previous = index;
  });
  gif.finish();
  return gif.bytes();
}
