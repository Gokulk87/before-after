import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergeConfig, parseCli } from "../src/config.mjs";
import { detectBuild, detectProject, findStaticRoot } from "../src/detect.mjs";
import { isListening, listen, resolveFile } from "../src/http.mjs";
import { addPluginToViteConfig } from "../src/init.mjs";

const tmp = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-test-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
};

test("addPluginToViteConfig: create-vite's React config", () => {
  const source = `import react from '@vitejs/plugin-react'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`;
  const result = addPluginToViteConfig(source);
  assert.equal(result.status, "changed");
  assert.equal(
    result.source,
    `import react from '@vitejs/plugin-react'\nimport { defineConfig } from 'vite'\nimport { beforeAfter } from "before-after-compare/vite";\n\nexport default defineConfig({\n  plugins: [react(), beforeAfter()],\n})\n`,
  );
  assert.equal(addPluginToViteConfig(result.source).status, "already");
});

test("addPluginToViteConfig: multi-line plugins with nested calls and strings", () => {
  const source = `import { defineConfig } from "vite";\nimport a from "a";\n\nexport default defineConfig({\n  plugins: [\n    a({ paths: ["]", "x"] }),\n    // a comment with ]\n    b(),\n  ],\n});\n`;
  const result = addPluginToViteConfig(source);
  assert.equal(result.status, "changed");
  assert.match(result.source, /    b\(\),\n    beforeAfter\(\),\n  \],/);
  assert.match(result.source, /import a from "a";\nimport \{ beforeAfter \}/);
});

test("addPluginToViteConfig: no plugins key, empty list, and CommonJS", () => {
  assert.match(addPluginToViteConfig(`import { defineConfig } from "vite";\nexport default defineConfig({ base: "/" });\n`).source, /defineConfig\(\{\n  plugins: \[beforeAfter\(\)\],/);
  assert.match(addPluginToViteConfig(`import x from "x";\nexport default { plugins: [] };\n`).source, /plugins: \[beforeAfter\(\)\]/);
  assert.equal(addPluginToViteConfig(`module.exports = { plugins: [] };\n`).status, "manual");
});

test("detectProject tells Vite, static and other apps apart", () => {
  assert.equal(detectProject(tmp({ "vite.config.js": "", "package.json": "{}" })).kind, "vite");
  assert.equal(detectProject(tmp({ "package.json": JSON.stringify({ devDependencies: { vite: "8" } }) })).kind, "vite");
  const site = detectProject(tmp({ "public/index.html": "<p>" }));
  assert.deepEqual([site.kind, site.root], ["static", "public"]);
  const cra = detectProject(tmp({ "package.json": JSON.stringify({ scripts: { build: "react-scripts build" }, dependencies: { "react-scripts": "5" } }) }));
  assert.deepEqual([cra.kind, cra.framework], ["other", "cra"]);
});

test("detectBuild uses the build script and the right package manager, or false", () => {
  assert.equal(detectBuild(tmp({ "index.html": "" })), false);
  assert.equal(detectBuild(tmp({ "package.json": JSON.stringify({ scripts: { dev: "x" } }) })), false);
  assert.equal(detectBuild(tmp({ "package.json": JSON.stringify({ scripts: { build: "x" } }) })), "npm run build");
  assert.equal(detectBuild(tmp({ "package.json": JSON.stringify({ scripts: { build: "x" } }), "pnpm-lock.yaml": "" })), "pnpm run build");
  assert.equal(detectBuild(tmp({ "package.json": JSON.stringify({ scripts: { build: "x" } }), "yarn.lock": "" })), "yarn build");
  assert.equal(findStaticRoot(tmp({ "index.html": "" })), ".");
});

test("resolveFile: exact, .html, folder index; never outside the root or dotfiles", () => {
  const root = tmp({ "index.html": "", "about.html": "", "docs/index.html": "", "a.css": "", ".env": "SECRET", ".git/config": "" });
  assert.equal(resolveFile(root, ""), path.join(root, "index.html"));
  assert.equal(resolveFile(root, "about"), path.join(root, "about.html"));
  assert.equal(resolveFile(root, "docs"), path.join(root, "docs", "index.html"));
  assert.equal(resolveFile(root, "a.css"), path.join(root, "a.css"));
  assert.equal(resolveFile(root, ".env"), null);
  assert.equal(resolveFile(root, ".git/config"), null);
  assert.equal(resolveFile(root, "../etc/passwd"), null);
  assert.equal(resolveFile(root, "missing"), null);
});

test("parseCli: dev folder, --no-build, --dry-run; build must be a command or false", () => {
  const parsed = parseCli(["dev", "public", "--no-build", "--dry-run"]);
  assert.deepEqual([parsed.command, parsed.folder, parsed.flags.build, parsed.dryRun], ["dev", "public", false, true]);
  assert.throws(() => parseCli(["serve", "extra"]), /Unexpected argument/);
  assert.equal(mergeConfig({ build: false }).build, false);
  assert.throws(() => mergeConfig({ build: true }), /build must be a command or false/);
});

test("listen refuses a port another server already answers on", async () => {
  const other = http.createServer().listen(0, "127.0.0.1");
  await new Promise((r) => other.once("listening", r));
  const { port } = other.address();
  assert.equal(await isListening("127.0.0.1", port), true);
  await assert.rejects(listen(http.createServer(), { port, host: "127.0.0.1", inUseHint: (n) => `try ${n}` }), new RegExp(`Port ${port} is already in use[\\s\\S]*try ${port + 1}`));
  other.close();
});
