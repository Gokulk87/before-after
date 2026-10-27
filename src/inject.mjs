// Shared by the Vite plugin and the CLI: where the client is served and how it is put on a page.
import { fileURLToPath } from "node:url";

export const CLIENT_URL = "/__before-after/client.js";
export const HEALTH_URL = "/__before-after/health";
export const clientFile = fileURLToPath(new URL("./client.js", import.meta.url));

/** Options the in-page client reads from window.__BEFORE_AFTER__. */
export const PILL_KEYS = ["beforeLabel", "afterLabel", "afterDetail", "accent", "widths", "scrollContainer"];

export function pickPillOptions(options = {}) {
  return Object.fromEntries(PILL_KEYS.filter((key) => options[key] !== undefined).map((key) => [key, options[key]]));
}

/** `window.__BEFORE_AFTER__ = …`, safe to put inside a <script> element. */
export function configScript(config) {
  return `window.__BEFORE_AFTER__ = ${JSON.stringify(config).replace(/</g, "\\u003c")};`;
}

/** Adds the config and client scripts before the last </body> (or at the end). */
export function injectHtml(html, config) {
  const tags = `<script>${configScript(config)}</script><script src="${CLIENT_URL}"></script>`;
  const at = html.lastIndexOf("</body>");
  return at === -1 ? html + tags : html.slice(0, at) + tags + html.slice(at);
}
