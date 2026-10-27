// Config for the `before-after` CLI: defaults ← before-after.config.{mjs,js,json} ← command-line flags.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const CONFIG_FILES = ["before-after.config.mjs", "before-after.config.js", "before-after.config.json"];

export const DEFAULTS = {
  ref: undefined, // the remote's default branch, e.g. origin/main (see resolveDefaultRef)
  fetch: true,
  rebuild: false,
  port: 5174,
  host: "127.0.0.1",
  afterOrigin: "http://localhost:5173",
  dir: undefined, // the app's folder, relative to the repo root; defaults to where you run the CLI
  build: undefined, // a command, or false for no build step; defaults to the "build" script if there is one
  dist: undefined, // relative to `dir`; defaults to "dist", or "." with no build step
  env: {},
  install: undefined, // "ci" | "link" | "none"; defaults to "ci", or "none" with no build step
  copyFiles: undefined, // defaults to .env / .env.local at the repo root and in `dir`, when they exist
  proxy: {},
  mounts: [],
  cacheDir: undefined,
  pill: {},
};

const FLAGS = {
  ref: { type: "string" },
  port: { type: "string", short: "p" },
  host: { type: "string" },
  after: { type: "string" },
  dir: { type: "string" },
  build: { type: "string" },
  dist: { type: "string" },
  install: { type: "string" },
  proxy: { type: "string", multiple: true },
  config: { type: "string", short: "c" },
  "no-fetch": { type: "boolean" },
  "no-build": { type: "boolean" },
  "dry-run": { type: "boolean" },
  rebuild: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

/** `--proxy /api=http://127.0.0.1:3001` → { "/api": "http://127.0.0.1:3001" } */
export function parseProxyFlags(values = []) {
  const proxy = {};
  for (const value of values) {
    const at = value.indexOf("=");
    if (at <= 0) throw new Error(`--proxy expects <path>=<url>, got "${value}"`);
    const prefix = value.slice(0, at);
    const target = value.slice(at + 1);
    if (!prefix.startsWith("/")) throw new Error(`--proxy path must start with "/", got "${prefix}"`);
    new URL(target); // throws on a bad URL
    proxy[prefix] = target;
  }
  return proxy;
}

export const COMMANDS = ["serve", "dev", "init", "clean"];

/** Splits argv into a command (see COMMANDS), its folder argument, and the flags as config keys. */
export function parseCli(argv) {
  const { values, positionals } = parseArgs({ args: argv, options: FLAGS, allowPositionals: true });
  const command = positionals[0] || "serve";
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command "${command}". Try --help.`);
  if (positionals.length > (command === "dev" ? 2 : 1)) throw new Error(`Unexpected argument "${positionals.at(-1)}". Try --help.`);
  const flags = {};
  if (values.ref) flags.ref = values.ref;
  if (values.port) {
    flags.port = Number(values.port);
    if (!Number.isInteger(flags.port)) throw new Error(`--port expects a number, got "${values.port}"`);
  }
  if (values.host) flags.host = values.host;
  if (values.after) flags.afterOrigin = values.after;
  if (values.dir) flags.dir = values.dir;
  if (values.build) flags.build = values.build;
  if (values["no-build"]) flags.build = false;
  if (values.dist) flags.dist = values.dist;
  if (values.install) flags.install = values.install;
  if (values.proxy) flags.proxy = parseProxyFlags(values.proxy);
  if (values["no-fetch"]) flags.fetch = false;
  if (values.rebuild) flags.rebuild = true;
  return {
    command,
    folder: command === "dev" ? positionals[1] : undefined,
    flags,
    configPath: values.config,
    dryRun: Boolean(values["dry-run"]),
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}

/** Defaults, then the file, then the flags. Objects (proxy, env, pill) merge key by key. */
export function mergeConfig(...layers) {
  const merged = { ...DEFAULTS, env: {}, proxy: {}, pill: {} };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      if (["proxy", "env", "pill"].includes(key)) merged[key] = { ...merged[key], ...value };
      else merged[key] = value;
    }
  }
  return validate(merged);
}

function validate(config) {
  if (config.build !== undefined && config.build !== false && (typeof config.build !== "string" || !config.build.trim())) {
    throw new Error(`build must be a command or false (no build step), got ${JSON.stringify(config.build)}`);
  }
  if (config.install !== undefined && !["ci", "link", "none"].includes(config.install)) {
    throw new Error(`install must be "ci", "link" or "none", got "${config.install}"`);
  }
  for (const [prefix, target] of Object.entries(config.proxy)) {
    if (!prefix.startsWith("/")) throw new Error(`proxy path must start with "/", got "${prefix}"`);
    new URL(target);
  }
  for (const mount of config.mounts) {
    if (!mount || typeof mount.path !== "string" || !mount.path.startsWith("/") || !mount.dir) {
      throw new Error(`each mount needs a path starting with "/" and a dir, got ${JSON.stringify(mount)}`);
    }
  }
  new URL(config.afterOrigin);
  return config;
}

/** Finds and loads the config file from `cwd` up to the repo root. */
export async function loadConfigFile(cwd, repoRoot, explicitPath) {
  if (explicitPath) return readConfig(path.resolve(cwd, explicitPath));
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    for (const name of CONFIG_FILES) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return readConfig(file);
    }
    if (dir === repoRoot || dir === path.dirname(dir)) return { file: null, config: {} };
  }
}

async function readConfig(file) {
  if (!fs.existsSync(file)) throw new Error(`Config file not found: ${file}`);
  if (file.endsWith(".json")) return { file, config: JSON.parse(fs.readFileSync(file, "utf8")) };
  const module = await import(pathToFileURL(file).href);
  const config = typeof module.default === "function" ? await module.default() : module.default;
  return { file, config: config || {} };
}

/** Matches a request path against path prefixes, longest first: "/api" matches "/api" and "/api/x", not "/apix". */
export function matchPrefix(pathname, prefixes) {
  return (
    [...prefixes]
      .sort((a, b) => b.length - a.length)
      .find((prefix) => {
        const p = prefix.endsWith("/") && prefix.length > 1 ? prefix.slice(0, -1) : prefix;
        return pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`);
      }) ?? null
  );
}

/** Identity for config files, so `defineConfig` gives editor hints. */
export function defineConfig(config) {
  return config;
}
