// The HTTP side shared by the "before" server and `before-after dev`: static files with the pill
// injected into every HTML page, an SPA fallback, and path prefixes proxied to a backend.
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { matchPrefix } from "./config.mjs";
import { CLIENT_URL, HEALTH_URL, clientFile, injectHtml } from "./inject.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".map": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".pdf": "application/pdf",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".wasm": "application/wasm", ".webmanifest": "application/manifest+json",
};
const isHtml = (file) => /\.html?$/i.test(file);

/**
 * Finds the file for a request path inside `root`: the exact file, then `<path>.html`, then
 * `<path>/index.html`. Returns null outside `root` and for dotfiles (.git, .env…).
 */
export function resolveFile(root, relative) {
  const clean = path.normalize(relative || ".").replace(/^[/\\]+/, "");
  if (clean.split(path.sep).some((segment) => segment.startsWith(".") && segment !== "." && segment !== ".well-known")) return null;
  const base = path.join(root, clean);
  if (base !== root && !base.startsWith(root + path.sep)) return null;
  for (const candidate of [base, `${base}.html`, path.join(base, "index.html")]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

/**
 * @param {object} options
 * @param {{ path: string, root: string, spa?: boolean }[]} options.apps  served folders by URL prefix
 * @param {object} options.pageConfig  window.__BEFORE_AFTER__ for every page
 * @param {Record<string, string>} [options.proxy]
 * @param {object} [options.health]  answered at /__before-after/health
 */
export function createServer({ apps, pageConfig, proxy = {}, health = {} }) {
  const proxyPrefixes = Object.keys(proxy);
  // Longest prefix first, so "/a/b" wins over "/a", and "/" last.
  const mounts = [...apps].sort((a, b) => b.path.length - a.path.length);
  const sendHtml = (res, file, status = 200) => {
    res.writeHead(status, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    res.end(injectHtml(fs.readFileSync(file, "utf8"), pageConfig));
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === HEALTH_URL) {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(health));
    }
    if (url.pathname === CLIENT_URL) {
      res.writeHead(200, { "Content-Type": TYPES[".js"], "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(clientFile, "utf8"));
    }
    const prefix = matchPrefix(url.pathname, proxyPrefixes);
    if (prefix) return proxyRequest(req, res, new URL(proxy[prefix]));

    const app = mounts.find((m) => m.path === "/" || matchPrefix(url.pathname, [m.path]));
    if (!app) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    let relative;
    try {
      relative = decodeURIComponent(url.pathname).slice(app.path === "/" ? 1 : app.path.replace(/\/$/, "").length + 1);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    const file = resolveFile(app.root, relative);
    if (file) {
      // "/docs" served from docs/index.html needs the trailing slash, or its relative links break.
      if (relative && !relative.endsWith("/") && file === path.join(app.root, path.normalize(relative), "index.html")) {
        res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
        return res.end();
      }
      if (isHtml(file)) return sendHtml(res, file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(file).pipe(res);
    }
    // A missing asset is a 404; anything else is an app route, answered by the SPA's index.html.
    const index = path.join(app.root, "index.html");
    if (app.spa !== false && !(path.extname(url.pathname) && !isHtml(url.pathname)) && fs.existsSync(index)) {
      return sendHtml(res, index);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  // WebSockets on proxied paths (e.g. a live-updates socket under /api).
  server.on("upgrade", (req, socket, head) => {
    const prefix = matchPrefix(new URL(req.url || "/", "http://localhost").pathname, proxyPrefixes);
    if (!prefix) return socket.destroy();
    const target = new URL(proxy[prefix]);
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

  return server;
}

/**
 * Listens on host:port, refusing a port something else already answers on. (A server on [::]:port
 * doesn't stop us binding 127.0.0.1:port, but the browser's "localhost" may then reach that other
 * server instead, so the pill would silently talk to the wrong app.)
 */
export async function listen(server, { port, host, inUseHint }) {
  const inUse = () =>
    new Error(`Port ${port} is already in use (see \`lsof -i :${port}\`).${inUseHint ? `\n${inUseHint(port + 1)}` : ""}`);
  const taken = await Promise.all(["127.0.0.1", "::1"].map((address) => isListening(address, port)));
  if (taken.some(Boolean)) throw inUse();
  await new Promise((resolve, reject) => {
    server.once("error", (error) => reject(error.code === "EADDRINUSE" ? inUse() : error));
    server.listen(port, host, resolve);
  });
}

/** True when something accepts connections at address:port. */
export function isListening(address, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export const shownHost = (host) => (["127.0.0.1", "::1", "localhost"].includes(host) ? "localhost" : host);

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
