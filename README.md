# before-after-compare

See your branch next to another git ref, live in the browser.

`before-after-compare` builds the base branch (or any ref) in a separate worktree and serves it next to your dev server. A small pill on your page opens a **Compare** view with:

- **Side by side** or **Swipe** (drag a divider across the two)
- **Width presets** (1440 / 1024 / 768 / 390 px, scaled to fit)
- **Synced scroll and routes**: scroll or navigate one side and the other follows
- **Mirrored actions**: clicks, typing, dropdown picks and Esc/Enter/arrow keys on one side are repeated on the other, matched by accessible name, so it still works when the two sides use different markup

It's made for UI refactors, design-system migrations and visual reviews, where screenshots don't show hover, focus, open menus and dialogs, or state you have to click through to reach.

<!-- TODO: add a GIF of the Compare view here -->

## Quick start (Vite)

```bash
npm install --save-dev before-after-compare
```

```js
// vite.config.js
import { defineConfig } from "vite";
import { beforeAfter } from "before-after-compare/vite";

export default defineConfig({
  plugins: [beforeAfter()],
});
```

```bash
npm run dev              # your branch, as usual (http://localhost:5173)
npx before-after         # in a second terminal: builds origin/main and serves it on :5174
```

Open your dev server and click **Compare** in the pill at the bottom of the page, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>.

The plugin only runs under `vite` / `vite dev`. A production build never includes it.

## How it works

1. `npx before-after` checks out the ref as a detached `git worktree` under `~/.cache/before-after/`, outside your repo, so nothing in your checkout changes.
2. It installs dependencies, runs your build there, and serves the output on `127.0.0.1:5174` with an SPA fallback. Paths you list under `proxy` go to your local backend, so both sides use the same API and data.
3. It rebuilds only when the ref moves. Restarting is instant if nothing changed.
4. Both servers inject the same small script. The Compare view loads each side in an iframe, and the two talk over `postMessage`. Messages are only accepted from the two dev servers' origins.

With no git remote, the base is `HEAD`, so you compare your last commit with your uncommitted changes.

## CLI

```
npx before-after [serve] [options]   build and serve the base ref (default)
npx before-after clean               remove the cached worktree

--ref <ref>            git ref to compare against (default: origin's default branch)
-p, --port <port>      port for the "before" server (default 5174)
--host <host>          interface to listen on (default 127.0.0.1)
--after <origin>       your dev server (default http://localhost:5173)
--dir <path>           the app's folder, relative to the repo root (default: current folder)
--build <command>      build command, run in --dir (default "npm run build")
--dist <path>          build output, relative to --dir (default "dist")
--install <mode>       ci (clean install, default) | link (reuse your node_modules) | none
--proxy <path>=<url>   forward a path prefix to your backend; repeatable
--no-fetch             don't fetch the ref first
--rebuild              build even if the ref hasn't moved
-c, --config <file>    config file
```

## Config file

For anything beyond a few flags, add `before-after.config.mjs` (or `.js` / `.json`) at your repo root, or in the folder you run the CLI from. Flags override the file.

```js
// before-after.config.mjs
import { defineConfig } from "before-after-compare";

export default defineConfig({
  ref: "origin/staging",
  build: "npm run build",
  dist: "dist",
  proxy: { "/api": "http://127.0.0.1:3001" },
  pill: { accent: "#ff5000" },
});
```

| Option | Default | |
| --- | --- | --- |
| `ref` | origin's default branch, else `HEAD` | Git ref to compare against |
| `fetch` | `true` | Fetch the ref from its remote first |
| `port` / `host` | `5174` / `127.0.0.1` | Where the "before" server listens |
| `afterOrigin` | `http://localhost:5173` | Your dev server |
| `dir` | folder you run the CLI from | The app's folder, relative to the repo root |
| `build` / `dist` | `npm run build` / `dist` | Build command (run in `dir`) and its output (relative to `dir`) |
| `env` | `{}` | Extra environment variables for the build |
| `install` | `"ci"` | `"ci"`: clean install from your lockfile (npm, pnpm, yarn or bun), redone only when the lockfile changes. `"link"`: reuse your checkout's `node_modules` (fast; see below). `"none"` |
| `copyFiles` | `.env`, `.env.local` at the root and in `dir` | Untracked files the build needs, copied into the worktree |
| `proxy` | `{}` | Path prefix → backend URL. WebSockets are proxied too |
| `mounts` | `[]` | More apps built from the same ref and served under a path (see below) |
| `cacheDir` | `~/.cache/before-after/<repo>-<hash>` | Where the worktree lives |
| `pill` | `{}` | Pill options for the "before" pages (see below) |

### Pill options

Pass these to `beforeAfter({ ... })` in Vite, and under `pill` in the config file so both sides match.

| Option | Default | |
| --- | --- | --- |
| `beforeLabel` / `afterLabel` | `"Before"` / `"After"` | Names of the two sides |
| `afterDetail` | `"working copy"` | Shown after the "after" name in the pill |
| `accent` | `#2563eb` | Color of the buttons, swipe handle and highlights |
| `widths` | `[1440, 1024, 768, 390]` | Width presets |
| `scrollContainer` | auto | Selector for the element that scrolls, when it isn't the window. Without it, the window is used when it scrolls, otherwise the largest scrollable element |

The Vite plugin also takes `beforeOrigin` (default `$BEFORE_AFTER_ORIGIN` or `http://localhost:5174`) and `enabled` (default: on unless `BEFORE_AFTER=0`).

### Monorepos

For a monorepo with an app in `apps/web`, a second app embedded under `/admin`, and workspace packages consumed from source:

```js
export default defineConfig({
  ref: "origin/staging",
  dir: "apps/web",
  build: "npx vite build",          // skip type-checking for a faster "before" build
  install: "link",
  proxy: { "/api": "http://127.0.0.1:3001" },
  mounts: [
    { path: "/admin", dir: "apps/admin", build: "npx vite build", env: { VITE_EMBEDDED: "true" } },
  ],
});
```

`install: "link"` skips a fresh install. The worktree's `node_modules` links to your checkout's, but workspace packages are re-pointed at the worktree's own copy, so the "before" build really uses the base branch's source for them. If the base branch has different dependencies, use `"ci"`.

## Other dev servers

The CLI side works with any static build. For the "after" side without Vite, serve `before-after-compare/client` (the file `src/client.js`) at `/__before-after/client.js` from your dev server, and add this before `</body>`:

```html
<script>window.__BEFORE_AFTER__ = { role: "after", beforeOrigin: "http://localhost:5174" };</script>
<script src="/__before-after/client.js"></script>
```

## Limits

- **Mirroring is by name.** A control is found on the other side by its accessible name (aria-label, label or text). If the name changed between branches, the status line in the toolbar says "No match", and you do that step on both sides yourself.
- **Native `<select>` popups aren't mirrored when opened.** Browsers don't let scripts open them, but picking an option is mirrored.
- **Shared backend.** Both sides talk to the same API and database, so an action mirrored on both sides runs twice. Turn off **Mirror actions** before anything that writes data.
- Your dev server must allow being framed by its own origin, which Vite does by default. Don't send `X-Frame-Options: DENY` in development.

## License

MIT
