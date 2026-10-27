// End-to-end check for a site with no build step (plain HTML), set up only by `init`:
// `before-after dev` serves the working copy, `before-after` serves the last commit.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(pkgRoot, "bin", "cli.mjs");
const tmp = path.join(pkgRoot, "test", ".tmp-static");
const site = path.join(tmp, "site");
const AFTER = "http://localhost:5283";
const BEFORE = "http://localhost:5284";

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
const page = (title, version) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><h1>${version} ${title}</h1><a href="about.html">About</a> <a href="/">Home</a></body></html>`;
const write = (version) => {
  fs.writeFileSync(path.join(site, "index.html"), page("home", version));
  fs.writeFileSync(path.join(site, "about.html"), page("about", version));
  fs.writeFileSync(path.join(site, "style.css"), version === "Before" ? "h1 { color: red }" : "h1 { color: green }");
};
const git = (...args) => execFileSync("git", args, { cwd: site, stdio: "ignore" });
git("init", "-q", "-b", "main");
write("Before");
fs.writeFileSync(path.join(site, "package.json"), JSON.stringify({ name: "site", private: true }, null, 2));

const initOut = execFileSync(process.execPath, [cli, "init"], { cwd: site, encoding: "utf8" });
assert.match(initOut, /no build step/);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(site, "before-after.config.json"), "utf8")), { build: false });
assert.equal(JSON.parse(fs.readFileSync(path.join(site, "package.json"), "utf8")).scripts["dev:compare"], "before-after dev");
console.log("✔ init sets up a static site");

fs.writeFileSync(path.join(site, "before-after.config.json"), JSON.stringify({ build: false, cacheDir: path.join(tmp, "cache") }));
git("add", "-A");
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "before");
write("After");

const children = [];
const start = (args) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd: site, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  children.push(child);
  return () => output;
};
const waitFor = async (url, output) => {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`nothing at ${url}:\n${output()}`);
};

let browser;
try {
  const devOut = start(["dev", "--after", AFTER, "--port", "5284"]);
  await waitFor(AFTER, devOut);
  const beforeOut = start(["--after", AFTER, "--port", "5284"]);
  await waitFor(`${BEFORE}/__before-after/health`, beforeOut);
  await new Promise((r) => setTimeout(r, 500));
  assert.doesNotMatch(beforeOut(), /building|npm ci/, "nothing is installed or built");
  assert.match(beforeOut(), /click "Compare"/, "sees the pill on the dev side");
  assert.match(await (await fetch(`${BEFORE}/about.html`)).text(), /Before about.*__BEFORE_AFTER__/s, "pill on every page");
  assert.doesNotMatch(await (await fetch(`${BEFORE}/.git`)).text(), /gitdir/, "dotfiles are never served");
  assert.equal((await fetch(`${BEFORE}/missing.css`)).status, 404);
  console.log("✔ dev and before servers start, every page gets the pill");

  // A second "before" server on the same port refuses to start and says why.
  const clash = spawn(process.execPath, [cli, "--after", AFTER, "--port", "5284"], { cwd: site });
  let clashOut = "";
  clash.stderr.on("data", (d) => (clashOut += d));
  const code = await new Promise((r) => clash.on("exit", r));
  assert.equal(code, 1);
  assert.match(clashOut, /Port 5284 is already in use[\s\S]*--port 5285/);
  console.log("✔ a port clash is refused with the fix");

  browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await tab.goto(AFTER);
  await tab.locator("[data-before-after] .open-compare").click();
  const before = tab.frameLocator("iframe.before");
  const after = tab.frameLocator("iframe.after");
  await before.locator("h1", { hasText: "Before home" }).waitFor();
  await after.locator("h1", { hasText: "After home" }).waitFor();
  console.log("✔ Compare shows both versions");

  await tab.waitForTimeout(300);
  await after.getByRole("link", { name: "About" }).click();
  await after.locator("h1", { hasText: "After about" }).waitFor();
  await before.locator("h1", { hasText: "Before about" }).waitFor({ timeout: 5000 });
  console.log("✔ Following a link moves both sides to the new page");
  console.log("\nAll static-site checks passed.");
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
