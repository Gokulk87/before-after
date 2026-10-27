// `before-after init`: looks at the project and sets it up, so nobody has to work out the setup by hand.
//   Vite app        → adds the plugin to vite.config and a "compare" script
//   no build step   → writes before-after.config.json (build: false) and "dev:compare" / "compare" scripts
//   anything else   → prints the two script tags to add to your dev server, and a config to start from
import fs from "node:fs";
import path from "node:path";
import { CONFIG_FILES } from "./config.mjs";
import { detectProject, findLockfile, readPackageJson } from "./detect.mjs";
import { CLIENT_URL } from "./inject.mjs";

const PACKAGE = "before-after-compare";
const IMPORT_LINE = `import { beforeAfter } from "${PACKAGE}/vite";`;

/**
 * Adds the import and `beforeAfter()` to a Vite config's source.
 * @returns {{ status: "changed", source: string } | { status: "already" } | { status: "manual", reason: string }}
 */
export function addPluginToViteConfig(source) {
  if (source.includes(`${PACKAGE}/vite`)) return { status: "already" };
  const imports = [...source.matchAll(/^import\s[^;]*?['"][^'"\n]+['"];?[ \t]*$/gm)];
  if (!imports.length) return { status: "manual", reason: "it doesn't use `import` statements" };

  let out = source;
  const plugins = /plugins\s*:\s*\[/.exec(out);
  if (plugins) {
    const open = plugins.index + plugins[0].length - 1;
    const close = matchingBracket(out, open);
    if (close === -1) return { status: "manual", reason: "couldn't find the end of the plugins list" };
    const inner = out.slice(open + 1, close);
    const body = inner.replace(/\s+$/, "");
    const trailing = inner.slice(body.length);
    let next;
    if (!body.trim()) next = "beforeAfter()";
    else if (trailing.includes("\n")) {
      const indent = /\n([ \t]*)\S[^\n]*$/.exec(body)?.[1] ?? "    ";
      next = `${body}${body.endsWith(",") ? "" : ","}\n${indent}beforeAfter(),${trailing}`;
    } else next = `${body}${body.endsWith(",") ? " " : ", "}beforeAfter()${trailing}`;
    out = out.slice(0, open + 1) + next + out.slice(close);
  } else {
    const object = /(defineConfig\(\s*\{|export\s+default\s+\{)/.exec(out);
    if (!object) return { status: "manual", reason: "couldn't find the config object" };
    const at = object.index + object[0].length;
    out = `${out.slice(0, at)}\n  plugins: [beforeAfter()],${out.slice(at)}`;
  }
  // The import goes after the last import (found again: the edit above is always further down).
  const lastImport = [...out.matchAll(/^import\s[^;]*?['"][^'"\n]+['"];?[ \t]*$/gm)].at(-1);
  const end = lastImport.index + lastImport[0].length;
  out = `${out.slice(0, end)}\n${IMPORT_LINE}${out.slice(end)}`;
  return { status: "changed", source: out };
}

/** Index of the bracket closing the one at `open`, skipping strings, template literals and comments. */
function matchingBracket(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
      if (i === -1) return -1;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i);
      if (i === -1) return -1;
      i++;
    } else if ("[({".includes(c)) depth++;
    else if ("])}".includes(c) && --depth === 0) return c === "]" ? i : -1;
  }
  return -1;
}

/** Adds scripts to package.json without replacing ones that exist. Returns the names added. */
function addScripts(dir, scripts, dryRun) {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const pkg = JSON.parse(text);
  pkg.scripts ??= {};
  const added = Object.entries(scripts).filter(([name]) => !(name in pkg.scripts));
  if (!added.length) return [];
  for (const [name, command] of added) pkg.scripts[name] = command;
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
  if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`);
  return added.map(([name, command]) => `"${name}": "${command}"`);
}

export async function init({ cwd, dryRun = false, inGit = true }) {
  const say = (line = "") => console.log(line);
  const verb = dryRun ? "would" : "";
  const done = (what) => say(`  ✔ ${dryRun ? `would ${what}` : what}`);
  const project = detectProject(cwd);
  const pkg = readPackageJson(cwd);
  const manager = findLockfile(cwd)?.manager || "npm";
  const installed = Boolean(pkg && ({ ...pkg.dependencies, ...pkg.devDependencies })[PACKAGE]);
  const installCmd = manager === "npm" ? `npm install --save-dev ${PACKAGE}` : `${manager} add -D ${PACKAGE}`;
  const run = (script) => (manager === "npm" ? `npm run ${script}` : `${manager} ${script}`);
  const existingConfig = CONFIG_FILES.find((name) => fs.existsSync(path.join(cwd, name)));
  const steps = [];
  if (!inGit) steps.push('This folder isn\'t a git repository yet. The "before" side is your last commit, so: git init && git add -A && git commit -m "before"');

  say(`before-after init${dryRun ? " (dry run: nothing is written)" : ""}`);
  say();

  if (project.kind === "vite") {
    say("Found a Vite app.");
    if (!installed && pkg) steps.unshift(`Install the package: ${installCmd}`);
    if (!project.viteConfig) {
      say("  No vite.config file, so add one:");
      say(`    ${IMPORT_LINE}`);
      say("    export default { plugins: [beforeAfter()] };");
    } else {
      const name = path.basename(project.viteConfig);
      const result = addPluginToViteConfig(fs.readFileSync(project.viteConfig, "utf8"));
      if (result.status === "already") say(`  ✔ ${name} already uses the plugin`);
      else if (result.status === "changed") {
        if (!dryRun) fs.writeFileSync(project.viteConfig, result.source);
        done(`added beforeAfter() to ${name}`);
      } else {
        say(`  ! Couldn't edit ${name} safely (${result.reason}). Add these two lines yourself:`);
        say(`    ${IMPORT_LINE}`);
        say("    plugins: [/* your plugins */, beforeAfter()],");
      }
    }
    const scripts = addScripts(cwd, { compare: "before-after" }, dryRun);
    if (scripts.length) done(`added the script ${scripts.join(", ")} to package.json`);
    steps.push(`Start your dev server as usual (restart it if it was running), e.g. ${run("dev")}`);
    steps.push(`In a second terminal: ${scripts.length || pkg?.scripts?.compare ? run("compare") : "npx before-after"}`);
  } else if (project.kind === "static") {
    say("Found a site with no build step (no \"build\" script), so its files are served as they are.");
    const dist = project.root ?? ".";
    if (!project.root) say("  ! No index.html found in ., public, site, www, docs or src. Pages still work by their path.");
    if (existingConfig) say(`  ✔ ${existingConfig} already exists; left as it is (it needs "build": false for this kind of site)`);
    else {
      const config = { build: false, ...(dist !== "." && { dist }) };
      if (!dryRun) fs.writeFileSync(path.join(cwd, "before-after.config.json"), `${JSON.stringify(config, null, 2)}\n`);
      done(`wrote before-after.config.json ${JSON.stringify(config)}`);
    }
    const scripts = addScripts(cwd, { "dev:compare": "before-after dev", compare: "before-after" }, dryRun);
    if (scripts.length) done(`added the scripts ${scripts.join(", ")} to package.json`);
    const hasScripts = scripts.length || pkg?.scripts?.["dev:compare"];
    if (!installed && pkg) steps.unshift(`Install the package (or keep using npx): ${installCmd}`);
    steps.push(`Serve your working copy with the pill: ${hasScripts ? run("dev:compare") : "npx before-after dev"}  (instead of your usual server)`);
    steps.push(`In a second terminal, serve the "before" side: ${hasScripts ? run("compare") : "npx before-after"}`);
  } else {
    const hints = {
      next: 'Next.js: the "before" side needs a static export. Set output: "export" in next.config, and "dist": "out".',
      cra: 'Create React App: the build goes to build/, so set "dist": "build".',
      angular: 'Angular: set "dist" to your build folder, e.g. "dist/<project>/browser".',
    };
    say("Found an app that builds, but not with Vite. init can't edit its dev server, so:");
    say();
    say("  1. Make your dev server add these two tags before </body> (in development only):");
    say(`       <script>window.__BEFORE_AFTER__ = { role: "after", beforeOrigin: "http://localhost:5174" };</script>`);
    say(`       <script src="${CLIENT_URL}"></script>`);
    say(`     and serve ${CLIENT_URL} from this file:`);
    say(`       node_modules/${PACKAGE}/src/client.js   (import.meta.resolve("${PACKAGE}/client"))`);
    say("  2. Tell the \"before\" side where your build goes, in before-after.config.json:");
    say('       { "dist": "<your build output folder>" }');
    if (hints[project.framework]) say(`     ${hints[project.framework]}`);
    if (!installed && pkg) steps.unshift(`Install the package: ${installCmd}`);
    steps.push(`Start your dev server, then in a second terminal: npx before-after --after http://localhost:<your dev port>`);
  }

  steps.push('Open your dev server and click "Compare" in the pill at the bottom, or press Alt+Shift+C.');
  steps.push('Compares against origin\'s default branch (or your last commit, with no remote). Another branch: --ref origin/<branch>. Backend at /api: --proxy /api=http://127.0.0.1:<port>.');
  say();
  say(`Next${verb ? " (after a real run)" : ""}:`);
  steps.forEach((step, i) => say(`  ${i + 1}. ${step}`));
}
