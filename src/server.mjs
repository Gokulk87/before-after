// The "before" side: checks out another git ref in a worktree outside your repo, builds it (or serves
// it as is, for a site with no build step), and serves it with the pill injected, proxying API paths
// to your local backend.
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectBuild, findLockfile } from "./detect.mjs";
import { createServer, listen, shownHost } from "./http.mjs";
import { CLIENT_URL, pickPillOptions } from "./inject.mjs";

export const log = (message) => console.log(`[before-after] ${message}`);

export function gitRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new Error(
      "This folder isn't in a git repository. before-after compares two versions of your code, so it needs git:\n" +
        '  git init && git add -A && git commit -m "before"\n' +
        "  then make your changes and run npx before-after again.",
    );
  }
}

/** origin/HEAD → "origin/main"; with no remote, HEAD (your last commit vs. your working copy). */
export function resolveDefaultRef(repoRoot) {
  try {
    return execFileSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {}
  for (const candidate of ["origin/main", "origin/master"]) {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", candidate], { cwd: repoRoot, stdio: "ignore" });
      return candidate;
    } catch {}
  }
  return "HEAD";
}

export function worktreeDir(config, repoRoot) {
  if (config.cacheDir) return path.resolve(repoRoot, config.cacheDir);
  const hash = crypto.createHash("sha256").update(repoRoot).digest("hex").slice(0, 8);
  return path.join(os.homedir(), ".cache", "before-after", `${path.basename(repoRoot)}-${hash}`);
}

/** Removes the worktree (the `clean` command). */
export function clean(config, repoRoot) {
  const worktree = worktreeDir(config, repoRoot);
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot, stdio: "ignore" });
  } catch {}
  fs.rmSync(worktree, { recursive: true, force: true });
  log(`removed ${worktree}`);
}

/** Build command and output folder for one app, filling in what the config leaves out. */
export function resolveApp(app, worktree, repoRoot) {
  const appDir = path.join(worktree, app.dir);
  const build = app.build === undefined ? detectBuild(appDir, worktree) : app.build;
  const dist = app.dist ?? (build === false ? "." : "dist");
  return { ...app, build, dist, root: path.resolve(appDir, dist), detected: app.build === undefined };
}

export async function serve(config, { repoRoot, cwd }) {
  const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  const ref = config.ref || resolveDefaultRef(repoRoot);
  const dir = config.dir ?? (path.relative(repoRoot, cwd) || ".");
  const worktree = worktreeDir(config, repoRoot);

  // 1. Check out the ref.
  const remotes = git("remote").split("\n").filter(Boolean);
  const [remote, ...branch] = ref.split("/");
  if (config.fetch && branch.length && remotes.includes(remote)) {
    log(`fetching ${ref}…`);
    git("fetch", remote, branch.join("/"), "--quiet");
  }
  let sha;
  try {
    sha = git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  } catch {
    throw new Error(
      ref === "HEAD"
        ? 'This repository has no commits yet. Commit the "before" version first: git add -A && git commit -m "before"'
        : `Can't find the git ref "${ref}". Pass an existing branch or commit with --ref (e.g. --ref origin/main or --ref HEAD).`,
    );
  }
  const registered = git("worktree", "list", "--porcelain").split("\n").includes(`worktree ${worktree}`);
  if (!registered) {
    fs.rmSync(worktree, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    log(`creating worktree at ${worktree}`);
    git("worktree", "add", "--detach", worktree, sha);
  } else {
    execFileSync("git", ["checkout", "--detach", "--force", sha], { cwd: worktree, stdio: "ignore" });
  }
  log(`${ref} @ ${sha.slice(0, 7)}`);
  if (!fs.existsSync(path.join(worktree, dir))) {
    throw new Error(`"${dir}" doesn't exist at ${ref}. Run from your app's folder, or set "dir" (relative to the repo root).`);
  }

  // 2. What to build: from the config, or worked out from each app's package.json at that ref.
  const apps = [
    { path: "/", dir, build: config.build, dist: config.dist, env: config.env },
    ...config.mounts.map((mount) => ({ ...mount, env: { ...config.env, ...mount.env } })),
  ].map((app) => resolveApp(app, worktree, repoRoot));
  for (const app of apps) {
    if (app.build === false && app.detected) log(`${app.dir}: no "build" script, so serving its files as they are`);
  }

  // 3. Dependencies (none needed when nothing is built) and local files the build needs.
  const install = config.install ?? (apps.every((app) => app.build === false) ? "none" : "ci");
  installDependencies(install, repoRoot, worktree);
  const copyFiles = config.copyFiles ?? [".env", ".env.local", path.join(dir, ".env"), path.join(dir, ".env.local")];
  for (const file of new Set(copyFiles)) {
    const source = path.join(repoRoot, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(worktree, file));
  }

  // 4. Build each app, only when the ref moved (or with --rebuild).
  for (const app of apps) {
    const label = app.path === "/" ? app.dir : `${app.path} (${app.dir})`;
    if (app.build === false) {
      if (!fs.existsSync(path.join(app.root, "index.html"))) {
        log(`note: ${path.relative(worktree, app.root) || "."} has no index.html; open a page by its path, or set "dist" to the folder with your pages`);
      }
      continue;
    }
    const stamp = path.join(app.root, ".before-after-sha");
    const built = fs.existsSync(stamp) ? fs.readFileSync(stamp, "utf8") : "";
    if (built === sha && !config.rebuild) continue;
    log(`building ${label}: ${app.build}`);
    try {
      execSync(app.build, { cwd: path.join(worktree, app.dir), stdio: "inherit", env: { ...process.env, ...app.env } });
    } catch {
      throw new Error(
        `The build failed: \`${app.build}\` in ${app.dir} (output above).\n` +
          `  No build step (plain HTML/CSS/JS)? Pass --no-build, or set "build": false in before-after.config.json.\n` +
          `  Builds another way? Pass --build "<command>", or set "build" in the config.\n` +
          `  Dependencies differ on ${ref}? Drop --install link / "install": "link" so it does a clean install.`,
      );
    }
    if (!fs.existsSync(path.join(app.root, "index.html"))) {
      throw new Error(
        `The build finished but there's no ${path.relative(worktree, path.join(app.root, "index.html"))}.\n` +
          `  Set "dist" (or --dist) to the folder your build writes to, relative to "${app.dir}" (e.g. "build" or "out").`,
      );
    }
    fs.writeFileSync(stamp, sha);
  }

  // 5. Serve.
  const server = createServer({
    apps,
    pageConfig: { ...pickPillOptions(config.pill), role: "before", afterOrigin: config.afterOrigin, ref },
    proxy: config.proxy,
    health: { ref, sha },
  });
  await listen(server, {
    port: config.port,
    host: config.host,
    inUseHint: (next) =>
      `  Probably another "before" server. Stop it, or use another port: npx before-after --port ${next}\n` +
      `  and point the pill at it: beforeAfter({ beforeOrigin: "http://localhost:${next}" }) in vite.config,\n` +
      `  or start your dev server with BEFORE_AFTER_ORIGIN=http://localhost:${next}`,
  });
  log(`serving ${ref} @ ${sha.slice(0, 7)} on http://${shownHost(config.host)}:${config.port}`);
  for (const prefix of Object.keys(config.proxy)) log(`  ${prefix} → ${config.proxy[prefix]}`);
  checkAfterSide(config.afterOrigin);
  return server;
}

/** Tells you when your dev server isn't running yet, or is running without the pill. */
export async function checkAfterSide(afterOrigin) {
  const hint =
    "  Vite app: run npx before-after init (adds the plugin), then restart your dev server.\n" +
    "  No build step: run npx before-after dev in another terminal instead of your own server.\n" +
    "  Other dev servers: run npx before-after init for the two script tags to add.";
  let html;
  try {
    const response = await fetch(afterOrigin, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(3000) });
    html = await response.text();
  } catch {
    log(`waiting for your dev server at ${afterOrigin}. Start it, then open it and click "Compare" (or press Alt+Shift+C).`);
    log(`  (Somewhere else? Pass --after http://localhost:<port>.)`);
    return;
  }
  if (html.includes(CLIENT_URL)) {
    log(`open ${afterOrigin} and click "Compare" in the pill (or press Alt+Shift+C)`);
  } else {
    log(`${afterOrigin} is running, but its page doesn't load the pill, so you won't see "Compare".`);
    console.log(hint);
  }
}

function installDependencies(mode, repoRoot, worktree) {
  if (mode === "none") return;
  const marker = path.join(worktree, "node_modules", ".before-after-install");
  if (mode === "link") {
    if (fs.existsSync(marker)) fs.rmSync(path.join(worktree, "node_modules"), { recursive: true, force: true });
    linkDependencies(repoRoot, worktree);
    return;
  }
  const lock = findLockfile(worktree);
  if (!lock) {
    log("no lockfile found; skipping install");
    return;
  }
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(lock.dir, lock.file))).digest("hex");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === hash) return;
  log(`${lock.manager} ${lock.installArgs.join(" ")}…`);
  // A linked node_modules from an earlier `install: "link"` run must not be installed into.
  removeLinkedModules(worktree);
  execFileSync(lock.manager, lock.installArgs, { cwd: worktree, stdio: "inherit", shell: process.platform === "win32" });
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, hash);
}

function removeLinkedModules(worktree) {
  const modules = path.join(worktree, "node_modules");
  if (fs.existsSync(modules) && !fs.existsSync(path.join(modules, ".before-after-install"))) {
    fs.rmSync(modules, { recursive: true, force: true });
  }
}

/**
 * Fast mode: instead of a fresh install, the worktree's node_modules links to your checkout's.
 * Workspace packages (links that point inside your repo) are re-pointed at the worktree's own copy,
 * so the "before" build really uses the base branch's source for them. Nested node_modules folders
 * (one per workspace, as npm and pnpm create) are linked the same way.
 */
export function linkDependencies(repoRoot, worktree) {
  const workspaces = new Set();
  const linkModules = (from, to) => {
    fs.rmSync(to, { recursive: true, force: true });
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      const source = path.join(from, entry);
      if (entry.startsWith("@") && fs.statSync(source).isDirectory() && !fs.lstatSync(source).isSymbolicLink()) {
        linkModules(source, path.join(to, entry));
        continue;
      }
      let target = source;
      if (fs.lstatSync(source).isSymbolicLink()) {
        const real = fs.realpathSync(source);
        const relative = path.relative(repoRoot, real);
        if (!relative.startsWith("..") && !path.isAbsolute(relative) && !relative.split(path.sep).includes("node_modules")) {
          target = path.join(worktree, relative);
          workspaces.add(relative);
        }
      }
      fs.symlinkSync(target, path.join(to, entry));
    }
  };
  const rootModules = path.join(repoRoot, "node_modules");
  if (!fs.existsSync(rootModules)) throw new Error(`install: "link" needs ${rootModules}; run your install there first.`);
  linkModules(rootModules, path.join(worktree, "node_modules"));
  for (const workspace of workspaces) {
    const source = path.join(repoRoot, workspace, "node_modules");
    const destination = path.join(worktree, workspace, "node_modules");
    if (!fs.existsSync(source) || !fs.existsSync(path.dirname(destination))) continue;
    fs.rmSync(destination, { recursive: true, force: true });
    fs.symlinkSync(source, destination);
  }
}
