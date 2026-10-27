# before-after-compare

See your branch next to another git ref, live in the browser.

`before-after-compare` builds the base branch (or any ref) in a separate worktree and serves it next to your dev server. A small pill on your page opens a **Compare** view with:

- **Side by side** or **Swipe** (drag a divider across the two)
- **Width presets** (1440 / 1024 / 768 / 390 px, scaled to fit)
- **Synced scroll and routes**: scroll or navigate one side and the other follows
- **Mirrored actions**: clicks, typing, dropdown picks and Esc/Enter/arrow keys on one side are repeated on the other, matched by accessible name, so it still works when the two sides use different markup

It's made for UI refactors, design-system migrations and visual reviews, where screenshots don't show hover, focus, open menus and dialogs, or state you have to click through to reach.

<!-- TODO: add a GIF of the Compare view here -->

## Quick start

```bash
npm install --save-dev before-after-compare
npx before-after init
```

`init` works out what kind of project you have, sets it up, and prints the next steps. Use `--dry-run` to see what it would change first.

| Your project | What `init` does | Then run |
| --- | --- | --- |
| **Vite app** | Adds `beforeAfter()` to `vite.config` and a `compare` script | `npm run dev`, and `npm run compare` in a second terminal |
| **No build step** (plain HTML/CSS/JS) | Writes `before-after.config.json` with `"build": false`, plus `dev:compare` and `compare` scripts | `npm run dev:compare`, and `npm run compare` in a second terminal |
| **Another dev server** (webpack, Next.js…) | Prints the two script tags to add in development, and the config to set | Your dev server, and `npx before-after` in a second terminal |

Open your dev server and click **Compare** in the pill at the bottom of the page, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>.

You need git: the "before" side is another commit. With no remote it's `HEAD`, so you compare your last commit with your uncommitted changes. Otherwise it's origin's default branch; pick another with `--ref origin/<branch>`.

> **Using an AI coding assistant?** Point it at [AGENTS.md](AGENTS.md), which ships inside the package. It has the setup as numbered steps, so the assistant doesn't improvise its own server.

### Vite by hand

```js
// vite.config.js
import { defineConfig } from "vite";
import { beforeAfter } from "before-after-compare/vite";

export default defineConfig({
  plugins: [beforeAfter()],
});
```

The plugin only runs under `vite` / `vite dev`. A production build never includes it.

### Sites with no build step

`npx before-after dev [folder]` serves your working copy on `:5173` with the pill added to every page, in place of your usual static server. Reload to see edits. `npx before-after` serves your last commit (or `--ref`) the same way on `:5174`, because a project with no `build` script is served as it is. Set `"build": false` (or pass `--no-build`) to say so explicitly, and `"dist"` if your pages live in a subfolder such as `public`.

## How it works

1. `npx before-after` checks out the ref as a detached `git worktree` under `~/.cache/before-after/`, outside your repo, so nothing in your checkout changes.
2. It installs dependencies, runs your `build` script there (or serves the files as they are, when there's no build step), and serves the output on `127.0.0.1:5174`, with the pill on every HTML page and an SPA fallback. Paths you list under `proxy` go to your local backend, so both sides use the same API and data.
3. It rebuilds only when the ref moves. Restarting is instant if nothing changed.
4. Both servers inject the same small script. The Compare view loads each side in an iframe, and the two talk over `postMessage`. Messages are only accepted from the two dev servers' origins.

## CLI

```
npx before-after init                set the project up; --dry-run to preview
npx before-after [serve] [options]   build and serve the "before" ref on :5174 (default)
npx before-after dev [folder]        serve a site with no build step, with the pill, on :5173
npx before-after clean               remove the cached worktree

--ref <ref>            git ref to compare against (default: origin's default branch, else HEAD)
-p, --port <port>      port for the "before" server (default 5174)
--host <host>          interface to listen on (default 127.0.0.1)
--after <origin>       your dev server (default http://localhost:5173); `dev` serves here
--dir <path>           the app's folder, relative to the repo root (default: current folder)
--build <command>      build command, run in --dir (default: the "build" script, if there is one)
--no-build             serve the files as they are (default with no "build" script)
--dist <path>          what to serve, relative to --dir (default "dist", or "." with no build)
--install <mode>       ci (clean install) | link (reuse your node_modules) | none
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
| `build` | the `build` script, if there is one, else `false` | Build command, run in `dir`. `false` serves the files as they are |
| `dist` | `dist`, or `.` with no build | What to serve, relative to `dir` |
| `env` | `{}` | Extra environment variables for the build |
| `install` | `"ci"`, or `"none"` with no build | `"ci"`: clean install from your lockfile (npm, pnpm, yarn or bun), redone only when the lockfile changes. `"link"`: reuse your checkout's `node_modules` (fast; see below). `"none"` |
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

`npx before-after init` prints this for your project. The CLI side works with any static build. For the "after" side without Vite, serve `before-after-compare/client` (the file `src/client.js`) at `/__before-after/client.js` from your dev server, and add this before `</body>`:

```html
<script>window.__BEFORE_AFTER__ = { role: "after", beforeOrigin: "http://localhost:5174" };</script>
<script src="/__before-after/client.js"></script>
```

## Troubleshooting

Each message below is printed by `npx before-after`, with the fix.

| Message | Fix |
| --- | --- |
| *…is running, but its page doesn't load the pill* | Vite: `npx before-after init`, then restart the dev server. No build step: use `npx before-after dev` instead of your own server |
| *Port 5174 is already in use* | Another "before" server is running. Stop it, or use `--port 5175` and `beforeAfter({ beforeOrigin: "http://localhost:5175" })` |
| *The build failed* | No build step: `--no-build`. Builds another way: `--build "<command>"`. Base branch has other dependencies: drop `--install link` |
| *The build finished but there's no …/index.html* | Set `dist` to your build's output folder (e.g. `build`, `out`) |
| *This folder isn't in a git repository* / *no commits yet* | `git init && git add -A && git commit -m "before"`, then make your changes |

## Limits

- **Mirroring is by name.** A control is found on the other side by its accessible name (aria-label, label or text). If the name changed between branches, the status line in the toolbar says "No match", and you do that step on both sides yourself.
- **Native `<select>` popups aren't mirrored when opened.** Browsers don't let scripts open them, but picking an option is mirrored.
- **Shared backend.** Both sides talk to the same API and database, so an action mirrored on both sides runs twice. Turn off **Mirror actions** before anything that writes data.
- Your dev server must allow being framed by its own origin, which Vite does by default. Don't send `X-Frame-Options: DENY` in development.

## License

MIT
