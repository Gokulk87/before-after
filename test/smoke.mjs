// End-to-end check: a fixture Vite app in a throwaway git repo. The last commit is "before" (served by
// the CLI), the uncommitted working copy is "after" (vite dev with the plugin). Drives the Compare view
// in Chromium and checks both sides load, scroll syncs, clicks mirror and routes follow.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(pkgRoot, "test", ".tmp");
const app = path.join(tmp, "app");
const cache = path.join(tmp, "cache");
const AFTER = "http://localhost:5273";
const BEFORE = "http://localhost:5274";

fs.rmSync(tmp, { recursive: true, force: true });
fs.cpSync(path.join(pkgRoot, "test", "fixture"), app, { recursive: true });
const write = (version) => {
  const file = path.join(app, "index.html");
  fs.writeFileSync(file, fs.readFileSync(path.join(pkgRoot, "test", "fixture", "index.html"), "utf8").replace("VERSION", version));
};
// node_modules: vite from this package, and this package itself, as an install would link them.
fs.mkdirSync(path.join(app, "node_modules"));
fs.symlinkSync(path.join(pkgRoot, "node_modules", "vite"), path.join(app, "node_modules", "vite"));
fs.symlinkSync(pkgRoot, path.join(app, "node_modules", "before-after-compare"));
fs.symlinkSync(path.join(pkgRoot, "node_modules", ".bin"), path.join(app, "node_modules", ".bin"));
fs.writeFileSync(path.join(app, ".gitignore"), "node_modules\ndist\n");
fs.writeFileSync(path.join(app, "before-after.config.json"), JSON.stringify({ cacheDir: cache, install: "link" }));
const git = (...args) => execFileSync("git", args, { cwd: app, stdio: "ignore" });
git("init", "-q", "-b", "main");
write("Before");
git("add", ".");
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "before");
write("After");

const children = [];
const start = (cmd, args, env = {}) => {
  const child = spawn(cmd, args, { cwd: app, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  children.push(child);
  return { child, output: () => output };
};
const waitFor = async (url, what) => {
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${what} didn't start at ${url}`);
};

let browser;
try {
  const cli = start(process.execPath, [path.join(pkgRoot, "bin", "cli.mjs"), "--port", "5274", "--after", AFTER]);
  const vite = start(process.execPath, [path.join(pkgRoot, "node_modules", "vite", "bin", "vite.js"), "--port", "5273", "--strictPort"], {
    BEFORE_AFTER_ORIGIN: BEFORE,
  });
  await waitFor(`${BEFORE}/__before-after/health`, "before-after CLI").catch((e) => { console.error(cli.output()); throw e; });
  await waitFor(AFTER, "vite").catch((e) => { console.error(vite.output()); throw e; });

  // Server behavior.
  const health = await (await fetch(`${BEFORE}/__before-after/health`)).json();
  assert.equal(health.ref, "HEAD", "with no remote, the base is HEAD");
  const spa = await (await fetch(`${BEFORE}/some/route`)).text();
  assert.match(spa, /Before heading/);
  assert.match(spa, /__BEFORE_AFTER__ = \{[^<]*"role":"before"/);
  assert.equal((await fetch(`${BEFORE}/missing.js`)).status, 404);

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(AFTER);
  await page.locator("[data-before-after] .open-compare").click();
  const before = page.frameLocator("iframe.before");
  const after = page.frameLocator("iframe.after");
  await before.locator("h1", { hasText: "Before heading" }).waitFor();
  await after.locator("h1", { hasText: "After heading" }).waitFor();
  console.log("✔ Compare shows both sides");

  const frameOf = (cls) => page.frames().find((f) => f.url().startsWith(cls === "before" ? BEFORE : AFTER) && f !== page.mainFrame());
  await page.waitForTimeout(300); // the hello handshake
  await frameOf("after").evaluate(() => window.scrollTo(0, 800));
  await assert.doesNotReject(async () => {
    for (let i = 0; i < 25; i++) {
      if (Math.abs((await frameOf("before").evaluate(() => window.scrollY)) - 800) < 2) return;
      await page.waitForTimeout(100);
    }
    throw new Error("before frame didn't follow the scroll");
  });
  console.log("✔ Scroll syncs");

  await frameOf("after").evaluate(() => window.scrollTo(0, 0));
  await after.getByRole("button", { name: "Show details" }).click();
  await before.getByText("Details are visible").waitFor({ timeout: 5000 });
  console.log("✔ Clicks mirror");

  await after.getByRole("link", { name: "Second page" }).click();
  await page.waitForFunction(() => document.querySelector("[data-before-after]").shadowRoot.querySelector("input.path").value === "/second");
  await page.waitForFunction((origin) => [...document.querySelector("[data-before-after]").shadowRoot.querySelectorAll("iframe")].some((f) => f.src === `${origin}/second`), BEFORE);
  console.log("✔ Routes follow");

  // A page on any other origin can embed the "before" app, but can't drive it.
  const { createServer } = await import("node:http");
  const OTHER = "http://localhost:5275";
  const other = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<iframe id="f" src="${BEFORE}/" style="width:800px;height:600px"></iframe><script>
      f.onload = () => {
        const send = (data) => f.contentWindow.postMessage({ "before-after": true, ...data }, "*");
        send({ type: "hello" });
        send({ type: "do-action", action: "click", target: { name: "Show details", nth: 0 } });
      };
    </script>`);
  }).listen(5275, "127.0.0.1");
  children.push({ kill: () => other.close() });
  const probe = await browser.newPage();
  await probe.goto(OTHER);
  const embedded = probe.frameLocator("#f");
  await embedded.locator("h1", { hasText: "Before heading" }).waitFor();
  await probe.waitForTimeout(800);
  assert.equal(await embedded.getByText("Details are visible").isVisible(), false, "another origin drove the frame");
  console.log("✔ Other origins can't drive a frame");

  console.log("\nAll smoke checks passed.");
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
