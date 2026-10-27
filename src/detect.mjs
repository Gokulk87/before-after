// Looks at a project to pick sensible defaults: package manager, build command, Vite config, static folder.
import fs from "node:fs";
import path from "node:path";

export const LOCKFILES = [
  ["package-lock.json", "npm", ["ci"]],
  ["npm-shrinkwrap.json", "npm", ["ci"]],
  ["pnpm-lock.yaml", "pnpm", ["install", "--frozen-lockfile"]],
  ["yarn.lock", "yarn", ["install", "--frozen-lockfile"]],
  ["bun.lock", "bun", ["install", "--frozen-lockfile"]],
  ["bun.lockb", "bun", ["install", "--frozen-lockfile"]],
];

export const VITE_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"];

/** Folders that commonly hold a hand-written site, in the order they're tried. */
export const STATIC_ROOTS = [".", "public", "site", "www", "docs", "src"];

export function readPackageJson(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** The lockfile nearest to `dir`, walking up to `stopAt`: [file, manager, installArgs], or null. */
export function findLockfile(dir, stopAt = dir) {
  for (let current = dir; ; current = path.dirname(current)) {
    const lock = LOCKFILES.find(([file]) => fs.existsSync(path.join(current, file)));
    if (lock) return { dir: current, file: lock[0], manager: lock[1], installArgs: lock[2] };
    if (current === stopAt || current === path.dirname(current)) return null;
  }
}

export function runScript(manager, script) {
  return manager === "yarn" ? `yarn ${script}` : `${manager} run ${script}`;
}

/** The app's build command, or false when its package.json has no "build" script (or there is none). */
export function detectBuild(appDir, repoRoot) {
  const pkg = readPackageJson(appDir);
  if (!pkg?.scripts?.build) return false;
  return runScript(findLockfile(appDir, repoRoot)?.manager || "npm", "build");
}

export function findViteConfig(dir) {
  const name = VITE_CONFIGS.find((file) => fs.existsSync(path.join(dir, file)));
  return name ? path.join(dir, name) : null;
}

/** The first folder under `dir` with an index.html, or null. */
export function findStaticRoot(dir) {
  return STATIC_ROOTS.find((folder) => fs.existsSync(path.join(dir, folder, "index.html"))) ?? null;
}

/** Which kind of project this is, for `init` and for hints. */
export function detectProject(dir) {
  const pkg = readPackageJson(dir);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const viteConfig = findViteConfig(dir);
  if (viteConfig || deps.vite) return { kind: "vite", pkg, viteConfig };
  if (!pkg?.scripts?.build) return { kind: "static", pkg, root: findStaticRoot(dir) };
  return { kind: "other", pkg, framework: deps.next ? "next" : deps["react-scripts"] ? "cra" : deps["@angular/core"] ? "angular" : null };
}
