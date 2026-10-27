#!/usr/bin/env node
import fs from "node:fs";
import { loadConfigFile, mergeConfig, parseCli } from "../src/config.mjs";
import { dev } from "../src/dev.mjs";
import { init } from "../src/init.mjs";
import { clean, gitRoot, log, serve } from "../src/server.mjs";

const HELP = `before-after: compare your working copy with another git ref, live in the browser.

Set up (once per project)
  npx before-after init                  detects your project and sets it up; --dry-run to preview

Run
  npx before-after                       build and serve the "before" side (another git ref) on :5174
  npx before-after dev [folder]          serve a site with no build step, with the pill, on :5173
  npx before-after clean                 remove the cached worktree

Which setup?
  Vite app          add the plugin to vite.config (init does it), run your dev server + npx before-after
  No build step     npx before-after dev + npx before-after (init writes the config)
  Other dev server  add two script tags in development (init prints them) + npx before-after

Options
  --ref <ref>            git ref to compare against (default: origin's default branch, else HEAD)
  -p, --port <port>      port for the "before" server (default 5174)
  --host <host>          interface to listen on (default 127.0.0.1)
  --after <origin>       your dev server (default http://localhost:5173); \`dev\` serves here
  --dir <path>           the app's folder, relative to the repo root (default: current folder)
  --build <command>      build command, run in --dir (default: the "build" script, if there is one)
  --no-build             serve the files as they are (also the default with no "build" script)
  --dist <path>          what to serve, relative to --dir (default "dist", or "." with no build)
  --install <mode>       ci (clean install) | link (reuse your node_modules) | none
  --proxy <path>=<url>   forward a path prefix to your backend; repeatable
  --no-fetch             don't fetch the ref first
  --rebuild              build even if the ref hasn't moved
  -c, --config <file>    config file (default: before-after.config.{mjs,js,json})
  --dry-run              init only: show what would change
  -h, --help             show this help
  -v, --version          show the version

Docs: https://github.com/Gokulk87/before-after#readme`;

try {
  const { command, folder, flags, configPath, dryRun, help, version } = parseCli(process.argv.slice(2));
  if (help) {
    console.log(HELP);
    process.exit(0);
  }
  if (version) {
    console.log(JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
    process.exit(0);
  }
  const cwd = process.cwd();
  if (command === "init") {
    let inGit = true;
    try {
      gitRoot(cwd);
    } catch {
      inGit = false;
    }
    await init({ cwd, dryRun, inGit });
  } else if (command === "dev") {
    // `dev` serves the working copy, so it works outside git too.
    let repoRoot = cwd;
    try {
      repoRoot = gitRoot(cwd);
    } catch {}
    const { file, config: fileConfig } = await loadConfigFile(cwd, repoRoot, configPath);
    if (file) log(`config: ${file}`);
    await dev(mergeConfig(fileConfig, flags), { cwd, folder });
  } else {
    const repoRoot = gitRoot(cwd);
    const { file, config: fileConfig } = await loadConfigFile(cwd, repoRoot, configPath);
    if (file) log(`config: ${file}`);
    const config = mergeConfig(fileConfig, flags);
    if (command === "clean") clean(config, repoRoot);
    else await serve(config, { repoRoot, cwd });
  }
} catch (error) {
  console.error(`[before-after] ${error.message}`);
  process.exit(1);
}
