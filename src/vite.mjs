// Vite plugin: puts the Before ⇄ After pill on your dev server's pages (the "after" side).
// It only runs under `vite` / `vite dev`; a production build never includes it.
import fs from "node:fs";
import { CLIENT_URL, clientFile, configScript, pickPillOptions } from "./inject.mjs";

/**
 * @param {import("../types/index").BeforeAfterPluginOptions} [options]
 * @returns {import("vite").Plugin}
 */
export function beforeAfter(options = {}) {
  const {
    beforeOrigin = process.env.BEFORE_AFTER_ORIGIN || "http://localhost:5174",
    enabled = process.env.BEFORE_AFTER !== "0",
  } = options;
  const config = { ...pickPillOptions(options), role: "after", beforeOrigin };
  return {
    name: "before-after",
    apply: (_config, env) => Boolean(enabled) && env.command === "serve",
    configureServer(server) {
      server.middlewares.use(CLIENT_URL, (_req, res) => {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(fs.readFileSync(clientFile, "utf8"));
      });
    },
    transformIndexHtml: () => [
      { tag: "script", children: configScript(config), injectTo: "body" },
      { tag: "script", attrs: { src: CLIENT_URL }, injectTo: "body" },
    ],
  };
}

export default beforeAfter;
