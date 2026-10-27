export interface PillOptions {
  /** Name of the base side. Default "Before". */
  beforeLabel?: string;
  /** Name of your side. Default "After". */
  afterLabel?: string;
  /** Shown after the "after" name in the pill. Default "working copy". */
  afterDetail?: string;
  /** Any CSS color for the pill's buttons, swipe handle and highlights. Default "#2563eb". */
  accent?: string;
  /** Width presets in the Compare toolbar, in CSS px. Default [1440, 1024, 768, 390]. */
  widths?: number[];
  /** Selector of the element that scrolls, when it isn't the window. Auto-detected otherwise. */
  scrollContainer?: string;
}

export interface MountConfig {
  /** URL prefix the app is served under, e.g. "/admin". */
  path: string;
  /** The app's folder, relative to the repo root. */
  dir: string;
  /** Build command, run in `dir`. Default: the top-level `build`. */
  build?: string;
  /** Build output, relative to `dir`. Default "dist". */
  dist?: string;
  /** Extra environment variables for this build. */
  env?: Record<string, string>;
}

export interface BeforeAfterConfig {
  /** Git ref to compare against. Default: origin's default branch (e.g. origin/main), or HEAD with no remote. */
  ref?: string;
  /** Fetch the ref from its remote first. Default true. */
  fetch?: boolean;
  /** Port for the "before" server. Default 5174. */
  port?: number;
  /** Interface to listen on. Default "127.0.0.1". */
  host?: string;
  /** Your dev server. Default "http://localhost:5173". */
  afterOrigin?: string;
  /** The app's folder, relative to the repo root. Default: the folder you run the CLI from. */
  dir?: string;
  /** Build command, run in `dir`. Default "npm run build". */
  build?: string;
  /** Build output, relative to `dir`. Default "dist". */
  dist?: string;
  /** Extra environment variables for the build. */
  env?: Record<string, string>;
  /** "ci": clean install from the lockfile (default). "link": reuse your checkout's node_modules. "none": skip. */
  install?: "ci" | "link" | "none";
  /** Files copied from your checkout into the worktree before building. Default: .env and .env.local at the repo root and in `dir`. */
  copyFiles?: string[];
  /** Path prefixes forwarded to a backend, e.g. { "/api": "http://127.0.0.1:3001" }. WebSockets included. */
  proxy?: Record<string, string>;
  /** More apps built from the same ref and served under a path prefix. */
  mounts?: MountConfig[];
  /** Where the worktree lives. Default ~/.cache/before-after/<repo>-<hash>. */
  cacheDir?: string;
  /** Options for the pill on the "before" pages. */
  pill?: PillOptions;
}

export function defineConfig(config: BeforeAfterConfig | (() => BeforeAfterConfig | Promise<BeforeAfterConfig>)): typeof config;

export interface BeforeAfterPluginOptions extends PillOptions {
  /** Where `npx before-after` serves the base ref. Default $BEFORE_AFTER_ORIGIN or "http://localhost:5174". */
  beforeOrigin?: string;
  /** Default: true unless BEFORE_AFTER=0. */
  enabled?: boolean;
}
