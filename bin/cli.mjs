#!/usr/bin/env node
import fs from "node:fs";
import { loadConfigFile, mergeConfig, parseCli } from "../src/config.mjs";
import { clean, gitRoot, log, serve } from "../src/server.mjs";

const HELP = `before-after: serve another git ref next to your dev server and compare them in the browser.

Usage
  npx before-after [serve] [options]   build and serve the base ref (default command)
  npx before-after clean               remove the cached worktree

Options
  --ref <ref>            git ref to compare against (default: origin's default branch)
  -p, --port <port>      port for the "before" server (default 5174)
  --host <host>          interface to listen on (default 127.0.0.1)
  --after <origin>       your dev server (default http://localhost:5173)
  --dir <path>           the app's folder, relative to the repo root (default: current folder)
  --build <command>      build command, run in --dir (default "npm run build")
  --dist <path>          build output, relative to --dir (default "dist")
  --install <mode>       ci (clean install, default) | link (reuse your node_modules) | none
  --proxy <path>=<url>   forward a path prefix to your backend; repeatable
  --no-fetch             don't fetch the ref first
  --rebuild              build even if the ref hasn't moved
  -c, --config <file>    config file (default: before-after.config.{mjs,js,json})
  -h, --help             show this help
  -v, --version          show the version

Then add the Vite plugin (import { beforeAfter } from "before-after-compare/vite"),
open your dev server and click "Compare" in the pill, or press Alt+Shift+C.`;

try {
  const { command, flags, configPath, help, version } = parseCli(process.argv.slice(2));
  if (help) {
    console.log(HELP);
    process.exit(0);
  }
  if (version) {
    console.log(JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
    process.exit(0);
  }
  const cwd = process.cwd();
  const repoRoot = gitRoot(cwd);
  const { file, config: fileConfig } = await loadConfigFile(cwd, repoRoot, configPath);
  if (file) log(`config: ${file}`);
  const config = mergeConfig(fileConfig, flags);
  if (command === "clean") clean(config, repoRoot);
  else await serve(config, { repoRoot, cwd });
} catch (error) {
  console.error(`[before-after] ${error.message}`);
  process.exit(1);
}
