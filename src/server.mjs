// The "before" side: checks out another git ref in a worktree outside your repo, builds it,
// and serves the build with the pill injected, proxying API paths to your local backend.
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { CLIENT_URL, HEALTH_URL, clientFile, injectHtml, pickPillOptions } from "./inject.mjs";
import { matchPrefix } from "./config.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".wasm": "application/wasm", ".webmanifest": "application/manifest+json",
};

const LOCKFILES = [
  ["package-lock.json", "npm", ["ci"]],
  ["npm-shrinkwrap.json", "npm", ["ci"]],
  ["pnpm-lock.yaml", "pnpm", ["install", "--frozen-lockfile"]],
  ["yarn.lock", "yarn", ["install", "--frozen-lockfile"]],
  ["bun.lock", "bun", ["install", "--frozen-lockfile"]],
  ["bun.lockb", "bun", ["install", "--frozen-lockfile"]],
];

export const log = (message) => console.log(`[before-after] ${message}`);

export function gitRoot(cwd) {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
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
  const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
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

  // 2. Dependencies and local files the build needs.
  installDependencies(config.install, repoRoot, worktree);
  const copyFiles = config.copyFiles ?? [".env", ".env.local", path.join(dir, ".env"), path.join(dir, ".env.local")];
  for (const file of new Set(copyFiles)) {
    const source = path.join(repoRoot, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(worktree, file));
  }

  // 3. Build the app and each mount, only when the ref moved (or with --rebuild).
  const apps = [
    { path: "/", dir, build: config.build, dist: config.dist, env: config.env },
    ...config.mounts.map((mount) => ({ build: config.build, dist: "dist", ...mount, env: { ...config.env, ...mount.env } })),
  ].map((app) => ({ ...app, distDir: path.resolve(worktree, app.dir, app.dist) }));
  for (const app of apps) {
    const stamp = path.join(app.distDir, ".before-after-sha");
    const built = fs.existsSync(stamp) ? fs.readFileSync(stamp, "utf8") : "";
    if (built === sha && !config.rebuild) continue;
    log(`building ${app.path === "/" ? app.dir : `${app.path} (${app.dir})`}: ${app.build}`);
    execSync(app.build, { cwd: path.join(worktree, app.dir), stdio: "inherit", env: { ...process.env, ...app.env } });
    if (!fs.existsSync(path.join(app.distDir, "index.html"))) {
      throw new Error(`The build didn't produce ${path.relative(worktree, path.join(app.distDir, "index.html"))}. Set "dist" (relative to "${app.dir}").`);
    }
    fs.writeFileSync(stamp, sha);
  }

  // 4. Serve.
  const pageConfig = { ...pickPillOptions(config.pill), role: "before", afterOrigin: config.afterOrigin, ref };
  const proxyPrefixes = Object.keys(config.proxy);
  // Longest mount first, so "/a/b" wins over "/a", and "/" last.
  const mounts = [...apps].sort((a, b) => b.path.length - a.path.length);
  const indexOf = new Map(apps.map((app) => [app, injectHtml(fs.readFileSync(path.join(app.distDir, "index.html"), "utf8"), pageConfig)]));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === HEALTH_URL) {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ ref, sha }));
    }
    if (url.pathname === CLIENT_URL) {
      res.writeHead(200, { "Content-Type": TYPES[".js"], "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(clientFile, "utf8"));
    }
    const prefix = matchPrefix(url.pathname, proxyPrefixes);
    if (prefix) return proxyRequest(req, res, new URL(config.proxy[prefix]));

    const app = mounts.find((m) => m.path === "/" || matchPrefix(url.pathname, [m.path]));
    let relative;
    try {
      relative = decodeURIComponent(url.pathname).slice(app.path === "/" ? 1 : app.path.replace(/\/$/, "").length + 1);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    const file = path.join(app.distDir, path.normalize(relative || "index.html"));
    const inside = file.startsWith(app.distDir + path.sep);
    if (inside && !file.endsWith(`${path.sep}index.html`) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(file).pipe(res);
    }
    // A missing asset is a 404; anything else is an app route, answered by the SPA's index.html.
    if (path.extname(url.pathname) && !url.pathname.endsWith(".html")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    res.end(indexOf.get(app));
  });

  // WebSockets on proxied paths (e.g. a live-updates socket under /api).
  server.on("upgrade", (req, socket, head) => {
    const prefix = matchPrefix(new URL(req.url || "/", "http://localhost").pathname, proxyPrefixes);
    if (!prefix) return socket.destroy();
    const target = new URL(config.proxy[prefix]);
    const upstream = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } });
    upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
      const lines = [`HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}`];
      for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) lines.push(`${upstreamRes.rawHeaders[i]}: ${upstreamRes.rawHeaders[i + 1]}`);
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
      upstreamSocket.on("error", () => socket.destroy());
      socket.on("error", () => upstreamSocket.destroy());
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  const shown = config.host === "127.0.0.1" || config.host === "::1" ? "localhost" : config.host;
  log(`serving ${ref} @ ${sha.slice(0, 7)} on http://${shown}:${config.port}`);
  for (const prefix of proxyPrefixes) log(`  ${prefix} → ${config.proxy[prefix]}`);
  log(`open ${config.afterOrigin} and click "Compare" in the pill (or press Alt+Shift+C)`);
  return server;
}

function proxyRequest(req, res, target) {
  const upstream = http.request(
    { host: target.hostname, port: target.port, method: req.method, path: req.url, headers: { ...req.headers, host: target.host } },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`${target.origin} is not reachable (${error.message}). Is your backend running?`);
  });
  req.pipe(upstream);
}

function installDependencies(mode, repoRoot, worktree) {
  if (mode === "none") return;
  const marker = path.join(worktree, "node_modules", ".before-after-install");
  if (mode === "link") {
    if (fs.existsSync(marker)) fs.rmSync(path.join(worktree, "node_modules"), { recursive: true, force: true });
    linkDependencies(repoRoot, worktree);
    return;
  }
  const lock = LOCKFILES.find(([file]) => fs.existsSync(path.join(worktree, file)));
  if (!lock) {
    log("no lockfile found; skipping install");
    return;
  }
  const [file, cmd, args] = lock;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(worktree, file))).digest("hex");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === hash) return;
  log(`${cmd} ${args.join(" ")}…`);
  // A linked node_modules from an earlier `install: "link"` run must not be installed into.
  removeLinkedModules(worktree);
  execFileSync(cmd, args, { cwd: worktree, stdio: "inherit", shell: process.platform === "win32" });
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
