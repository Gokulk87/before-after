import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULTS, matchPrefix, mergeConfig, parseCli, parseProxyFlags } from "../src/config.mjs";
import { configScript, injectHtml, pickPillOptions } from "../src/inject.mjs";

test("parseCli defaults to serve with no flags", () => {
  const { command, flags } = parseCli([]);
  assert.equal(command, "serve");
  assert.deepEqual(flags, {});
});

test("parseCli maps flags to config keys", () => {
  const { command, flags, configPath } = parseCli([
    "clean", "--ref", "origin/staging", "-p", "6000", "--after", "http://localhost:3000",
    "--proxy", "/api=http://127.0.0.1:3001", "--proxy", "/ws=http://127.0.0.1:3002", "--no-fetch", "--rebuild", "-c", "x.mjs",
  ]);
  assert.equal(command, "clean");
  assert.equal(configPath, "x.mjs");
  assert.deepEqual(flags, {
    ref: "origin/staging", port: 6000, afterOrigin: "http://localhost:3000",
    proxy: { "/api": "http://127.0.0.1:3001", "/ws": "http://127.0.0.1:3002" }, fetch: false, rebuild: true,
  });
});

test("parseCli rejects bad input", () => {
  assert.throws(() => parseCli(["deploy"]), /Unknown command/);
  assert.throws(() => parseCli(["--port", "abc"]), /--port expects a number/);
  assert.throws(() => parseProxyFlags(["api=http://x"]), /must start with/);
  assert.throws(() => parseProxyFlags(["/api"]), /expects <path>=<url>/);
  assert.throws(() => parseProxyFlags(["/api=not a url"]));
});

test("mergeConfig layers defaults, file and flags; objects merge by key", () => {
  const config = mergeConfig(
    { port: 7000, proxy: { "/api": "http://127.0.0.1:1" }, pill: { accent: "red" }, mounts: [{ path: "/cc", dir: "cc" }] },
    { proxy: { "/ws": "http://127.0.0.1:2" }, port: undefined },
  );
  assert.equal(config.port, 7000);
  assert.equal(config.build, DEFAULTS.build);
  assert.deepEqual(config.proxy, { "/api": "http://127.0.0.1:1", "/ws": "http://127.0.0.1:2" });
  assert.deepEqual(config.pill, { accent: "red" });
  assert.equal(config.mounts.length, 1);
});

test("mergeConfig validates", () => {
  assert.throws(() => mergeConfig({ install: "yarn" }), /install must be/);
  assert.throws(() => mergeConfig({ mounts: [{ path: "cc", dir: "cc" }] }), /each mount/);
  assert.throws(() => mergeConfig({ proxy: { "/api": "nope" } }));
});

test("matchPrefix matches whole segments, longest first", () => {
  const prefixes = ["/api", "/api/v2", "/"];
  assert.equal(matchPrefix("/api", prefixes), "/api");
  assert.equal(matchPrefix("/api/users", prefixes), "/api");
  assert.equal(matchPrefix("/api/v2/users", prefixes), "/api/v2");
  assert.equal(matchPrefix("/apix", ["/api"]), null);
  assert.equal(matchPrefix("/anything", prefixes), "/");
  assert.equal(matchPrefix("/cc/x", ["/cc/"]), "/cc/");
  assert.equal(matchPrefix("/cc", ["/cc/"]), "/cc/");
});

test("injectHtml adds config and client before the last </body>", () => {
  const html = injectHtml("<html><body><p>x</p></body></html>", { role: "before", ref: "</script><b>" });
  assert.match(html, /<script>window\.__BEFORE_AFTER__ = .*<\/script><script src="\/__before-after\/client\.js"><\/script><\/body><\/html>$/);
  assert.ok(!html.includes("</script><b>"), "config can't close the script element");
  assert.ok(injectHtml("<p>no body</p>", {}).endsWith('client.js"></script>'));
  assert.equal(configScript({ a: 1 }), 'window.__BEFORE_AFTER__ = {"a":1};');
});

test("pickPillOptions keeps only pill keys", () => {
  assert.deepEqual(pickPillOptions({ accent: "red", beforeOrigin: "x", widths: [1, 2], enabled: true }), { accent: "red", widths: [1, 2] });
});
