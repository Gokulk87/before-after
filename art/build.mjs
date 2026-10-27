#!/usr/bin/env node
// Draws the README's pixel art as SVG: `node art/build.mjs`. Everything is rects on a grid, in the
// PICO-8 palette, with a 5×7 bitmap font. Not shipped in the npm package.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.dirname(fileURLToPath(import.meta.url));
const U = 4; // px per pixel-art cell

const C = {
  ink: "#000000", navy: "#1D2B53", plum: "#7E2553", green: "#008751", brown: "#AB5236", shade: "#5F574F",
  grey: "#C2C3C7", cream: "#FFF1E8", red: "#FF004D", orange: "#FFA300", yellow: "#FFEC27", lime: "#00E436",
  blue: "#29ADFF", lilac: "#83769C", pink: "#FF77A8", peach: "#FFCCAA",
};

// ---------------------------------------------------------------- 5×7 font
const FONT = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110", D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10001 10011 10101 11001 10001 01110", 1: "00100 01100 00100 00100 00100 00100 01110",
  2: "01110 10001 00001 00010 00100 01000 11111", 3: "11111 00010 00100 00010 00001 10001 01110",
  4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000",
  8: "01110 10001 10001 01110 10001 10001 01110", 9: "01110 10001 10001 01111 00001 00010 01100",
  ".": "00000 00000 00000 00000 00000 01100 01100", ",": "00000 00000 00000 00000 01100 00100 01000",
  "!": "00100 00100 00100 00100 00100 00000 00100", "?": "01110 10001 00001 00010 00100 00000 00100",
  "-": "00000 00000 00000 11111 00000 00000 00000", ":": "00000 01100 01100 00000 01100 01100 00000",
  "/": "00001 00010 00010 00100 01000 01000 10000", ">": "01000 00100 00010 00001 00010 00100 01000",
  "<": "00010 00100 01000 10000 01000 00100 00010", "'": "00100 00100 01000 00000 00000 00000 00000",
  "+": "00000 00100 00100 11111 00100 00100 00000", "=": "00000 00000 11111 00000 11111 00000 00000",
  " ": "00000 00000 00000 00000 00000 00000 00000",
};
const textWidth = (str, s = 1) => (str.length * 6 - 1) * s;

// ---------------------------------------------------------------- canvas
function canvas(w, h) {
  const layers = [[]];
  let current = layers[0];
  const c = {
    w, h,
    /** A rect in cells. */
    r(x, y, rw, rh, fill) {
      if (rw > 0 && rh > 0) current.push(`<rect x="${x * U}" y="${y * U}" width="${rw * U}" height="${rh * U}" fill="${fill}"/>`);
    },
    raw(markup) {
      current.push(markup);
    },
    /** Draws into a <g> with extra attributes and children (animations); returns to the base layer after `fn`. */
    group(attrs, fn, children = "") {
      const before = current;
      current = [];
      fn();
      before.push(`<g ${attrs}>${current.join("")}${children}</g>`);
      current = before;
    },
    text(str, x, y, fill, s = 1, shadow) {
      if (shadow) c.text(str, x + s, y + s, shadow, s);
      [...str.toUpperCase()].forEach((ch, i) => {
        const rows = (FONT[ch] ?? FONT["?"]).split(" ");
        rows.forEach((row, ry) => {
          // merge horizontal runs so the SVG stays small
          for (let rx = 0; rx < 5; rx++) {
            if (row[rx] !== "1") continue;
            let len = 1;
            while (row[rx + len] === "1") len++;
            c.r(x + (i * 6 + rx) * s, y + ry * s, len * s, s, fill);
            rx += len - 1;
          }
        });
      });
    },
    /** A sprite from rows of palette keys ("." is transparent). */
    map(rows, x, y, palette, s = 1) {
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const key = row[rx];
          if (key === ".") continue;
          let len = 1;
          while (row[rx + len] === key) len++;
          c.r(x + rx * s, y + ry * s, len * s, s, palette[key]);
          rx += len - 1;
        }
      });
    },
    /** A 1-cell outlined box with pixel-cut corners. */
    box(x, y, bw, bh, fill, border = C.ink) {
      c.r(x + 1, y, bw - 2, bh, border);
      c.r(x, y + 1, bw, bh - 2, border);
      c.r(x + 1, y + 1, bw - 2, bh - 2, fill);
    },
    save(name, label) {
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w * U}" height="${h * U}" viewBox="0 0 ${w * U} ${h * U}" shape-rendering="crispEdges" role="img" aria-label="${label}">` +
        `<title>${label}</title>${layers[0].join("")}</svg>\n`;
      fs.writeFileSync(path.join(out, name), svg);
      console.log(`art/${name}  ${(svg.length / 1024).toFixed(1)} kB`);
    },
  };
  return c;
}

/** Scaled drawing helper for 16×16 icons at (ox, oy). */
const at = (c, ox, oy, s) => (x, y, w, h, fill) => c.r(ox + x * s, oy + y * s, w * s, h * s, fill);

const CURSOR = [
  "k.......", "kk......", "kwk.....", "kwwk....", "kwwwk...", "kwwwwk..",
  "kwwwwwk.", "kwwwwwwk", "kwwwkkkk", "kwkwk...", "kk.kwk..", "k...kk..",
];

// ---------------------------------------------------------------- icons (16×16)
const ICONS = {
  side(p) {
    p(0, 2, 7, 12, C.ink); p(1, 3, 5, 10, C.cream); p(1, 3, 5, 2, C.orange);
    p(2, 7, 3, 1, C.grey); p(2, 9, 2, 1, C.grey); p(2, 11, 3, 1, C.grey);
    p(9, 2, 7, 12, C.ink); p(10, 3, 5, 10, C.cream); p(10, 3, 5, 2, C.blue);
    p(11, 7, 3, 1, C.grey); p(11, 9, 3, 1, C.grey); p(11, 11, 2, 1, C.grey);
  },
  swipe(p) {
    p(1, 2, 14, 12, C.ink); p(2, 3, 12, 10, C.cream);
    p(2, 3, 6, 2, C.orange); p(8, 3, 6, 2, C.blue);
    p(3, 7, 3, 1, C.grey); p(3, 9, 4, 1, C.grey); p(3, 11, 2, 1, C.grey);
    p(10, 7, 3, 1, C.grey); p(10, 9, 3, 1, C.grey); p(10, 11, 3, 1, C.grey);
    p(7, 1, 2, 14, C.yellow); p(6, 6, 4, 4, C.yellow); p(7, 7, 2, 2, C.navy);
  },
  widths(p) {
    p(0, 3, 8, 6, C.ink); p(1, 4, 6, 4, C.blue); p(3, 9, 2, 2, C.shade); p(2, 11, 4, 1, C.shade);
    p(9, 5, 4, 7, C.ink); p(10, 6, 2, 5, C.orange);
    p(13, 7, 3, 5, C.ink); p(14, 8, 1, 3, C.lime);
    p(0, 14, 16, 1, C.lilac);
  },
  sync(p) {
    p(0, 2, 7, 12, C.ink); p(1, 3, 5, 10, C.cream); p(5, 3, 1, 10, C.grey); p(5, 6, 1, 3, C.orange);
    p(2, 5, 2, 1, C.grey); p(2, 8, 2, 1, C.grey); p(2, 11, 2, 1, C.grey);
    p(9, 2, 7, 12, C.ink); p(10, 3, 5, 10, C.cream); p(14, 3, 1, 10, C.grey); p(14, 6, 1, 3, C.blue);
    p(11, 5, 2, 1, C.grey); p(11, 8, 2, 1, C.grey); p(11, 11, 2, 1, C.grey);
    p(6, 7, 4, 1, C.yellow);
  },
  mirror(p, c, ox, oy, s) {
    c.map(CURSOR, ox + 1 * s, oy + 3 * s, { k: C.ink, w: C.cream }, s);
    c.map(CURSOR, ox + 8 * s, oy + 3 * s, { k: C.blue, w: C.cream }, s);
    p(13, 0, 1, 3, C.yellow); p(12, 1, 3, 1, C.yellow);
    p(6, 14, 1, 1, C.yellow); p(8, 14, 1, 1, C.yellow); p(10, 14, 1, 1, C.yellow);
  },
  routes(p) {
    p(7, 4, 2, 11, C.shade);
    p(2, 3, 10, 3, C.orange); p(12, 4, 1, 1, C.orange);
    p(4, 8, 10, 3, C.blue); p(3, 9, 1, 1, C.blue);
    p(3, 15, 10, 1, C.green);
  },
  branch(p) {
    p(4, 1, 2, 14, C.grey); p(3, 1, 4, 4, C.orange); p(3, 11, 4, 4, C.orange);
    p(10, 1, 4, 4, C.blue);
    p(11, 5, 2, 2, C.grey); p(10, 6, 2, 2, C.grey); p(9, 7, 2, 2, C.grey); p(8, 8, 2, 2, C.grey); p(7, 9, 2, 2, C.grey); p(6, 10, 2, 1, C.grey);
  },
  box(p) {
    p(1, 5, 14, 10, C.ink); p(2, 6, 12, 8, C.brown); p(1, 4, 14, 3, C.ink); p(2, 5, 12, 1, C.peach);
    p(7, 4, 2, 11, C.yellow); p(3, 9, 3, 1, C.peach);
    p(12, 0, 1, 3, C.yellow); p(11, 1, 3, 1, C.yellow);
  },
  server(p) {
    p(3, 1, 10, 14, C.ink);
    for (const y of [2, 6, 10]) {
      p(4, y, 8, 3, C.shade); p(5, y + 1, 3, 1, C.grey); p(10, y + 1, 1, 1, C.lime);
    }
  },
};

function icon(name, label) {
  const c = canvas(20, 20);
  c.box(0, 0, 20, 20, C.navy, C.navy);
  const s = 1;
  const draw = ICONS[name];
  draw(at(c, 2, 2, s), c, 2, 2, s);
  c.save(`icon-${name}.svg`, label);
}

// ---------------------------------------------------------------- hero (animated)
function hero() {
  const c = canvas(240, 124);
  c.r(0, 0, 240, 124, C.navy);
  // stars
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rand() * 240);
    const y = Math.floor(rand() * 124);
    if (x > 26 && x < 214 && y > 26 && y < 110) continue;
    c.r(x, y, 1, 1, rand() > 0.8 ? C.yellow : rand() > 0.5 ? C.lilac : C.shade);
  }

  // title: BEFORE ⇄ AFTER
  const s = 2;
  const arrowW = 14;
  const total = textWidth("BEFORE", s) + 6 + arrowW + 6 + textWidth("AFTER", s);
  let x = Math.floor((240 - total) / 2);
  c.text("BEFORE", x, 7, C.orange, s, C.ink);
  x += textWidth("BEFORE", s) + 6;
  const arrows = ["..y....", ".yy....", "yyyyyyy", ".yy....", "..y....", "....y..", "....yy.", "yyyyyyy", "....yy.", "....y.."];
  c.map(arrows, x + 1, 8, { y: C.ink }, s);
  c.map(arrows, x, 7, { y: C.yellow }, s);
  x += arrowW + 6;
  c.text("AFTER", x, 7, C.blue, s, C.ink);

  // window
  const wx = 30, wy = 30, ww = 180, wh = 77;
  c.r(wx + 2, wy + 2, ww, wh, C.ink); // drop shadow
  c.r(wx, wy, ww, wh, C.ink);
  c.r(wx + 1, wy + 1, ww - 2, 9, C.grey);
  c.r(wx + 3, wy + 4, 3, 3, C.red); c.r(wx + 8, wy + 4, 3, 3, C.orange); c.r(wx + 13, wy + 4, 3, 3, C.lime);
  c.r(wx + 21, wy + 2, 62, 7, C.cream);
  c.text("/SETTINGS", wx + 25, wy + 2, C.shade);
  c.r(wx + ww - 12, wy + 4, 8, 3, C.shade);
  const cx = wx + 1, cy = wy + 10, cw = ww - 2, ch = wh - 11;

  const screen = (after) => {
    c.r(cx, cy, cw, ch, C.cream);
    // header
    c.r(cx, cy, cw, 11, after ? C.navy : C.grey);
    c.r(cx + 6, cy + 3, 5, 5, after ? C.blue : C.orange);
    for (const [nx, nw] of [[16, 14], [34, 10], [48, 12]]) c.r(cx + nx, cy + 5, nw, 1, after ? C.lilac : C.shade);
    if (after) c.r(cx + 16, cy + 7, 14, 1, C.blue);
    c.r(cx + cw - 12, cy + 2, 7, 7, after ? C.pink : C.shade);
    if (after) c.r(cx + cw - 11, cy + 2, 5, 1, C.navy), c.r(cx + cw - 11, cy + 8, 5, 1, C.navy), c.r(cx + cw - 12, cy + 2, 1, 1, C.navy), c.r(cx + cw - 6, cy + 2, 1, 1, C.navy), c.r(cx + cw - 12, cy + 8, 1, 1, C.navy), c.r(cx + cw - 6, cy + 8, 1, 1, C.navy);

    // title + text
    c.text("SETTINGS", cx + 6, cy + 15, after ? C.navy : C.shade);
    if (after) c.r(cx + 6, cy + 23, 18, 1, C.blue);
    const lines = after ? [[64, 27], [64, 30], [40, 33]] : [[60, 26], [47, 30], [71, 33]];
    for (const [lw, ly] of lines) c.r(cx + 6, cy + ly, lw, 1, C.grey);

    // controls
    if (after) {
      c.box(cx + 6, cy + 38, 30, 11, C.blue, C.blue);
      c.text("SAVE", cx + 10, cy + 40, C.cream);
      c.box(cx + 42, cy + 41, 11, 5, C.lime, C.lime);
      c.r(cx + 48, cy + 42, 4, 3, C.cream);
      c.text("AUTO", cx + 56, cy + 40, C.shade);
    } else {
      c.r(cx + 6, cy + 38, 28, 11, C.ink);
      c.r(cx + 7, cy + 39, 26, 9, C.grey);
      c.text("SAVE", cx + 9, cy + 40, C.ink);
      c.r(cx + 42, cy + 40, 6, 6, C.ink); c.r(cx + 43, cy + 41, 4, 4, C.cream);
      c.text("AUTO", cx + 51, cy + 40, C.ink);
    }

    // profile panel (right column)
    const px = cx + 96, py = cy + 14;
    if (after) {
      c.r(px + 1, py + 1, 76, 34, C.lilac);
      c.box(px, py, 76, 34, C.cream, C.grey);
      c.box(px + 5, py + 5, 12, 12, C.pink, C.pink);
      c.r(px + 8, py + 8, 2, 2, C.navy); c.r(px + 12, py + 8, 2, 2, C.navy); c.r(px + 8, py + 13, 6, 1, C.navy);
      c.text("PIXEL", px + 22, py + 5, C.navy);
      c.r(px + 22, py + 14, 30, 1, C.grey);
      c.box(px + 58, py + 5, 13, 9, C.lime, C.lime);
      c.text("ON", px + 59, py + 6, C.navy);
      c.box(px + 5, py + 23, 66, 6, C.grey, C.grey);
      c.box(px + 5, py + 23, 44, 6, C.blue, C.blue);
    } else {
      c.r(px, py, 74, 36, C.ink);
      c.r(px + 1, py + 1, 72, 34, C.cream);
      c.r(px + 4, py + 4, 12, 12, C.shade);
      c.text("PIXEL", px + 20, py + 4, C.ink);
      c.r(px + 20, py + 13, 41, 1, C.grey);
      c.r(px + 20, py + 16, 23, 1, C.grey);
      c.r(px + 4, py + 23, 66, 7, C.ink);
      c.r(px + 5, py + 24, 40, 5, C.orange);
      c.text("ON", px + 60, py + 4, C.red);
    }

    // cards
    const tops = after ? [C.blue, C.pink, C.lime] : [C.orange, C.orange, C.orange];
    [6, 64, 122].forEach((kx, i) => {
      if (after) {
        c.r(cx + kx + 1, cy + 54, 50, 10, C.lilac);
        c.r(cx + kx, cy + 53, 50, 10, C.cream);
        c.r(cx + kx, cy + 53, 50, 1, C.grey); c.r(cx + kx, cy + 62, 50, 1, C.grey);
        c.r(cx + kx, cy + 53, 1, 10, C.grey); c.r(cx + kx + 49, cy + 53, 1, 10, C.grey);
        c.r(cx + kx, cy + 53, 50, 2, tops[i]);
        c.r(cx + kx + 4, cy + 58, 26, 1, C.grey);
      } else {
        const kh = [10, 8, 11][i];
        const kw = [46, 52, 44][i];
        c.r(cx + kx, cy + 53, kw, kh, C.ink);
        c.r(cx + kx + 1, cy + 54, kw - 2, kh - 2, C.cream);
        c.r(cx + kx + 1, cy + 54, kw - 2, 1, tops[i]);
        c.r(cx + kx + 3, cy + 57, 20 + i * 6, 1, C.grey);
      }
    });
  };
  screen(false);

  // swipe animation: stepped (8 fps), eased back and forth
  const frames = 48;
  const min = 22, max = cw - 22;
  const positions = Array.from({ length: frames }, (_, i) => {
    const t = (1 - Math.cos((i / frames) * Math.PI * 2)) / 2;
    return Math.round(min + (max - min) * t);
  });
  const keyTimes = positions.map((_, i) => (i / frames).toFixed(4)).join(";");
  const dur = "6s";
  const anim = (attr, values) =>
    `<animate attributeName="${attr}" values="${values}" keyTimes="${keyTimes}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>`;
  c.raw(
    `<defs><clipPath id="reveal"><rect x="${(cx + positions[0]) * U}" y="${cy * U}" width="${(cw - positions[0]) * U}" height="${ch * U}">` +
      anim("x", positions.map((p) => (cx + p) * U).join(";")) +
      anim("width", positions.map((p) => (cw - p) * U).join(";")) +
      `</rect></clipPath></defs>`,
  );
  c.group(`clip-path="url(#reveal)"`, () => screen(true));
  c.group(
    `transform="translate(${positions[0] * U} 0)"`,
    () => {
      c.r(cx - 1, cy, 2, ch, C.yellow);
      c.r(cx - 4, cy + 26, 8, 12, C.yellow);
      c.r(cx - 3, cy + 27, 6, 10, C.ink);
      c.map(["..y.y..", ".yy.yy.", "yyy.yyy", ".yy.yy.", "..y.y.."], cx - 3, cy + 29, { y: C.yellow });
      c.map(CURSOR, cx + 1, cy + 34, { k: C.ink, w: C.cream });
    },
    `<animateTransform attributeName="transform" type="translate" values="${positions.map((p) => `${p * U} 0`).join(";")}" keyTimes="${keyTimes}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>`,
  );

  // labels under the window
  c.text("< MAIN", wx, 112, C.orange);
  c.text("YOUR BRANCH >", wx + ww - textWidth("YOUR BRANCH >"), 112, C.blue);
  c.save("hero.svg", "Pixel-art browser window. A yellow swipe handle slides back and forth, wiping between the old version of a settings screen and the new one.");
}

// ---------------------------------------------------------------- how it works
function pipeline() {
  const c = canvas(240, 70);
  const steps = [
    ["branch", "CHECKOUT"],
    ["box", "BUILD"],
    ["server", "SERVE"],
    ["swipe", "COMPARE"],
  ];
  steps.forEach(([name, label], i) => {
    const tx = 12 + i * 60;
    c.text(String(i + 1), tx + 18, 1, C.yellow);
    c.box(tx, 10, 40, 40, C.navy, C.navy);
    ICONS[name](at(c, tx + 4, 14, 2), c, tx + 4, 14, 2);
    c.text(label, tx + 20 - Math.floor(textWidth(label) / 2), 56, C.shade);
    if (i < steps.length - 1) c.map(["y...", "yy..", "yyy.", "yyyy", "yyy.", "yy..", "y..."], tx + 46, 25, { y: C.yellow }, 2);
  });
  c.save("how-it-works.svg", "Four steps: check out the base branch, build it, serve it next to your dev server, compare the two.");
}

// ---------------------------------------------------------------- footer
function footer() {
  const c = canvas(240, 34);
  c.r(0, 0, 240, 34, C.navy);
  const title = "THANKS FOR PLAYING";
  c.text(title, Math.floor((240 - textWidth(title, 2)) / 2), 5, C.cream, 2, C.ink);
  const press = "PRESS START: NPX BEFORE-AFTER INIT";
  c.group(
    "",
    () => c.text(press, Math.floor((240 - textWidth(press)) / 2), 24, C.yellow),
    `<animate attributeName="opacity" values="1;0" dur="1.2s" calcMode="discrete" repeatCount="indefinite"/>`,
  );
  c.save("footer.svg", "Thanks for playing. Press start: npx before-after init.");
}

hero();
pipeline();
footer();
icon("side", "Two browser panes side by side");
icon("swipe", "One pane split by a yellow swipe handle");
icon("widths", "A monitor, a tablet and a phone");
icon("sync", "Two panes with linked scrollbars");
icon("mirror", "A cursor and its echo");
icon("routes", "A signpost pointing both ways");
