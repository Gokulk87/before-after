<p align="center">
  <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/hero.svg" width="100%" alt="Pixel-art browser window. A yellow swipe handle slides back and forth, wiping between the old version of a settings screen and the new one.">
</p>

<h3 align="center">Design review, but live.</h3>

<p align="center">
  Your branch and <code>main</code>, side by side in the browser.<br>
  Swipe between them, click through both at once, and catch the 1px shift before your users do.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/before-after-compare"><img src="https://img.shields.io/npm/v/before-after-compare?style=flat-square&color=29ADFF&labelColor=1D2B53" alt="npm version"></a>
  <img src="https://img.shields.io/badge/dependencies-0-00E436?style=flat-square&labelColor=1D2B53" alt="zero dependencies">
  <img src="https://img.shields.io/badge/works_with-Vite_·_plain_HTML-FFA300?style=flat-square&labelColor=1D2B53" alt="works with Vite and plain HTML">
  <img src="https://img.shields.io/npm/l/before-after-compare?style=flat-square&color=FF77A8&labelColor=1D2B53" alt="MIT license">
</p>

<br>

```bash
npm install --save-dev before-after-compare
npx before-after init        # sets your project up, then tells you exactly what to run
```

<br>

## ▸ Why a product designer built this

I was moving screen after screen onto a new design system, and every page went through the same ritual: screenshot the old one, screenshot the new one, put them side by side, squint.

Screenshots lie a little. They freeze one moment and skip everything that makes an interface feel right or wrong: the hover, the focus ring, the menu that opens slightly off, the empty state, the dialog three clicks deep, the phone layout nobody checked.

So I built the review tool I actually wanted. Both versions run for real, next to each other. Scroll one and the other follows. Click a button on one side and it gets clicked on the other. You see what changed while you use it, not in a static diff.

If you design, build or review UI (a redesign, a design-system migration, a "small" CSS refactor), this is for you.

<br>

## ▸ Power-ups

<table>
  <tr>
    <td width="88"><img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/icon-side.svg" width="64" alt=""></td>
    <td><b>Side by side</b><br>Before on the left, after on the right, both fully interactive.</td>
    <td width="88"><img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/icon-swipe.svg" width="64" alt=""></td>
    <td><b>Swipe</b><br>Stack them and drag a divider across. Spacing, color and alignment changes jump out.</td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/icon-widths.svg" width="64" alt=""></td>
    <td><b>Width presets</b><br>1440, 1024, 768 and 390px, scaled to fit. The phone layout gets a review too.</td>
    <td><img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/icon-sync.svg" width="64" alt=""></td>
    <td><b>Synced scroll</b><br>Scroll one side and the other follows, even in app shells with an inner scroller.</td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/icon-mirror.svg" width="64" alt=""></td>
    <td><b>Mirrored actions</b><br>Clicks, typing, dropdown picks and Esc, Enter and arrow keys are repeated on the other side. Controls are matched by name, so it still works when the markup changed.</td>
    <td><img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/icon-routes.svg" width="64" alt=""></td>
    <td><b>Routes follow</b><br>Navigate on one side and the other goes to the same page.</td>
  </tr>
</table>

<br>

## ▸ Press start

**1. Install and set up.** `init` works out what kind of project you have and does the setup for it.

```bash
npm install --save-dev before-after-compare
npx before-after init          # add --dry-run to preview the changes first
```

**2. Run both sides.** Use two terminals:

| Your project | Terminal 1 (after: your work) | Terminal 2 (before: the base) |
| --- | --- | --- |
| **Vite app** | `npm run dev` | `npm run compare` |
| **No build step** (plain HTML, CSS and JS) | `npm run dev:compare` | `npm run compare` |
| **Another dev server** (webpack, Next.js…) | your dev server, with the two tags `init` printed | `npx before-after` |

**3. Compare.** Open your dev server and click **Compare** in the little pill at the bottom of the page, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>.

> **Which "before"?** By default, origin's default branch. With no remote, it's your last commit, which means you can compare uncommitted edits. Pick any branch with `--ref origin/staging`.

<br>

## ▸ How it works

<p align="center">
  <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/how-it-works.svg" width="100%" alt="Four steps: check out the base branch, build it, serve it next to your dev server, compare the two.">
</p>

1. **Checkout.** The base ref is checked out as a git worktree in `~/.cache/before-after/`, outside your repo. Your files, branch and stash stay as they are.
2. **Build.** It installs and runs your `build` script there. With no build step, the files are served as they are. It only rebuilds when the ref moves, so a restart is instant.
3. **Serve.** It serves that build on `localhost:5174` with the pill on every page. Paths you `proxy` (like `/api`) go to your local backend, so both sides show the same data.
4. **Compare.** The pill opens both sides in frames that talk to each other. They only accept messages from your two local servers.

The Vite plugin only runs in `vite dev`. Nothing ships to production.

<br>

## ▸ Review rituals

A few habits that make design QA quick:

- **Swipe slowly over anything with spacing.** Your eye catches movement far better than it compares two static images.
- **Do a 390 pass.** Click the 390 preset and scroll both sides once. Phone regressions hide here.
- **Walk the flow, don't just look at it.** With **Mirror actions** on, open the menu, fill the form, trigger the empty state. Both sides follow you.
- **Watch the status line.** "No match on the other side" means a control's name changed. Sometimes that's a bug, sometimes it's a copy change worth flagging.
- **Turn mirroring off before you save or delete.** Both sides share your backend, so a mirrored action runs twice.
- **Hand it over in two commands.** Reviewers check out your branch, run the same two commands, and see exactly what you saw.

<br>

## ▸ Boss fights

Each message below is printed by `npx before-after`, along with its fix.

| When you see | Do this |
| --- | --- |
| *…is running, but its page doesn't load the pill* | Vite: run `npx before-after init`, then restart the dev server. No build step: use `npx before-after dev` instead of your own server. |
| *Port 5174 is already in use* | Another "before" server is still running. Stop it, or use `--port 5175` with `beforeAfter({ beforeOrigin: "http://localhost:5175" })`. |
| *The build failed* | No build step: `--no-build`. Builds another way: `--build "<command>"`. Base branch has other dependencies: drop `--install link`. |
| *The build finished but there's no …/index.html* | Set `dist` to your build's output folder, e.g. `build` or `out`. |
| *This folder isn't in a git repository* / *no commits yet* | `git init && git add -A && git commit -m "before"`, then make your changes. |

<br>

## ▸ Known glitches

- **Mirroring matches by name.** A control is found on the other side by its accessible name (aria-label, label or visible text). If the name changed, the toolbar says "No match" and you do that step on both sides yourself.
- **Native `<select>` popups can't be opened by script.** Picking an option is still mirrored.
- **One backend, two clicks.** Both sides use the same API and database. Turn off **Mirror actions** before anything that writes data.
- Your dev server must allow being framed by its own origin, which Vite does by default. Don't send `X-Frame-Options: DENY` in development.

<br>

## ▸ Settings menu

<details>
<summary><b>CLI</b></summary>

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

</details>

<details>
<summary><b>Config file</b></summary>

For anything beyond a few flags, add `before-after.config.mjs` (or `.js` / `.json`) at your repo root, or in the folder you run the CLI from. Flags override the file.

```js
// before-after.config.mjs
import { defineConfig } from "before-after-compare";

export default defineConfig({
  ref: "origin/staging",
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
| `install` | `"ci"`, or `"none"` with no build | `"ci"`: clean install from your lockfile (npm, pnpm, yarn or bun), redone only when the lockfile changes. `"link"`: reuse your checkout's `node_modules` (fast). `"none"` |
| `copyFiles` | `.env`, `.env.local` at the root and in `dir` | Untracked files the build needs, copied into the worktree |
| `proxy` | `{}` | Path prefix → backend URL. WebSockets are proxied too |
| `mounts` | `[]` | More apps built from the same ref and served under a path |
| `cacheDir` | `~/.cache/before-after/<repo>-<hash>` | Where the worktree lives |
| `pill` | `{}` | Pill options for the "before" pages |

</details>

<details>
<summary><b>Pill options (make it yours)</b></summary>

Pass these to `beforeAfter({ ... })` in Vite, and under `pill` in the config file so both sides match.

| Option | Default | |
| --- | --- | --- |
| `beforeLabel` / `afterLabel` | `"Before"` / `"After"` | Names of the two sides |
| `afterDetail` | `"working copy"` | Shown after the "after" name in the pill |
| `accent` | `#2563eb` | Color of the buttons, swipe handle and highlights. Use your brand color |
| `widths` | `[1440, 1024, 768, 390]` | Width presets |
| `scrollContainer` | auto | Selector for the element that scrolls, when it isn't the window |

The Vite plugin also takes `beforeOrigin` (default `$BEFORE_AFTER_ORIGIN` or `http://localhost:5174`) and `enabled` (default: on unless `BEFORE_AFTER=0`).

</details>

<details>
<summary><b>Sites with no build step</b></summary>

`npx before-after dev [folder]` serves your working copy on `:5173` with the pill on every page, in place of your usual static server. Reload to see edits. `npx before-after` serves your last commit (or `--ref`) the same way on `:5174`, because a project with no `build` script is served as it is.

Set `"build": false` (or pass `--no-build`) to say so explicitly, and `"dist": "public"` if your pages live in a subfolder.

</details>

<details>
<summary><b>Monorepos</b></summary>

An app in `apps/web`, a second app embedded under `/admin`, and workspace packages consumed from source:

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

`install: "link"` skips a fresh install. The worktree's `node_modules` links to your checkout's, but workspace packages point at the worktree's own copy, so the "before" build really uses the base branch's source for them. If the base branch has different dependencies, use `"ci"`.

</details>

<details>
<summary><b>Other dev servers</b></summary>

`npx before-after init` prints this for your project. For the "after" side without Vite, serve `before-after-compare/client` (the file `src/client.js`) at `/__before-after/client.js` from your dev server, and add this before `</body>`, in development only:

```html
<script>window.__BEFORE_AFTER__ = { role: "after", beforeOrigin: "http://localhost:5174" };</script>
<script src="/__before-after/client.js"></script>
```

</details>

<details>
<summary><b>Using an AI coding assistant?</b></summary>

Point it at [AGENTS.md](https://github.com/Gokulk87/before-after/blob/main/AGENTS.md), which ships inside the package. It has the setup as numbered steps for each kind of project, so the assistant uses `init` and `dev` instead of writing its own server.

</details>

<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/footer.svg" width="100%" alt="Thanks for playing. Press start: npx before-after init.">
</p>

<p align="center">
  Made by <a href="https://github.com/Gokulk87">Gokul Krishnan</a>, a product designer who got tired of screenshot diffs.<br>
  <sub>Pixel art drawn in code (<code>art/build.mjs</code>) with the PICO-8 palette · MIT licensed</sub>
</p>
