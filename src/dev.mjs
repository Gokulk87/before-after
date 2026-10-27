// `before-after dev`: the "after" side for a site without a dev server of its own (plain HTML/CSS/JS).
// Serves your working copy's files with the pill added to every page. Reload the page to see edits.
import path from "node:path";
import fs from "node:fs";
import { findStaticRoot } from "./detect.mjs";
import { createServer, listen, shownHost } from "./http.mjs";
import { pickPillOptions } from "./inject.mjs";
import { log } from "./server.mjs";

export async function dev(config, { cwd, folder }) {
  const rootName = folder ?? (config.dist && config.build === false ? config.dist : null) ?? findStaticRoot(cwd) ?? ".";
  const root = path.resolve(cwd, rootName);
  if (!fs.existsSync(root)) throw new Error(`Folder not found: ${root}`);
  const after = new URL(config.afterOrigin);
  const port = Number(after.port) || 80;
  const beforeOrigin = `http://localhost:${config.port}`;
  const server = createServer({
    apps: [{ path: "/", root }],
    pageConfig: { ...pickPillOptions(config.pill), role: "after", beforeOrigin },
    proxy: config.proxy,
    health: { role: "after" },
  });
  await listen(server, {
    port,
    host: config.host,
    inUseHint: (next) =>
      `  Stop whatever runs there, or serve on another port: npx before-after dev --after http://localhost:${next}\n` +
      `  (and start the "before" side with the same --after, so its pill points back here).`,
  });
  log(`serving ${path.relative(process.cwd(), root) || "."} on http://${shownHost(config.host)}:${port} with the pill`);
  log(`in another terminal, run npx before-after${port === 5173 ? "" : ` --after http://localhost:${port}`} for the "before" side`);
  log(`then open http://localhost:${port} and click "Compare". Edits show when you reload.`);
  return server;
}
