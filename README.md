<h1 align="center">before-after</h1>

<p align="center">
  <b>Your branch and <code>main</code>, side by side. Live.</b><br>
  Scroll, click and type in one and the other follows.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/before-after-compare"><img src="https://img.shields.io/npm/v/before-after-compare?style=flat-square&label=npm&color=1d1d1f&labelColor=6e6e73" alt="npm version"></a>
  <img src="https://img.shields.io/badge/dependencies-0-1d1d1f?style=flat-square&labelColor=6e6e73" alt="zero dependencies">
  <img src="https://img.shields.io/npm/l/before-after-compare?style=flat-square&color=1d1d1f&labelColor=6e6e73" alt="MIT license">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/demo-dark.gif">
    <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/demo-light.gif" width="100%" alt="Demo: the Compare window opens an old settings page next to its redesign, switches to stacked, then a cursor drags the swipe divider left and right and up and down.">
  </picture>
</p>

```bash
npm install --save-dev before-after-compare
npx before-after init
```

<br>

## Screenshots freeze a moment. Interfaces don't.

Reviewing a redesign usually means two screenshots and a lot of squinting. But the things that make an interface feel right never show up in a screenshot: the hover, the focus ring, the menu that opens slightly off, the empty state three clicks deep, the phone layout.

before-after runs both versions for real, next to each other. Your working copy on one side, the base branch on the other. You review the change by using it.

<br>

## Four ways to look

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/side-dark.png">
        <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/side-light.png" alt="Side by side view">
      </picture>
      <p><b>Side by side.</b> Both versions at once, fully interactive.</p>
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/stack-dark.png">
        <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/stack-light.png" alt="Stacked view">
      </picture>
      <p><b>Stacked.</b> Before on top, after below. Made for wide layouts.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/swipe-x-dark.png">
        <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/swipe-x-light.png" alt="Swipe view, left and right">
      </picture>
      <p><b>Swipe across.</b> Drag the divider and every shift in spacing, color and alignment moves under your cursor.</p>
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/swipe-y-dark.png">
        <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/swipe-y-light.png" alt="Swipe view, up and down">
      </picture>
      <p><b>Swipe down.</b> The same, top to bottom, for headers, lists and vertical rhythm.</p>
    </td>
  </tr>
</table>

<br>

## It lives in your page

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/pill-dark.png">
    <img src="https://raw.githubusercontent.com/Gokulk87/before-after/main/art/shots/pill-light.png" width="640" alt="A small floating pill at the bottom of the page, with After, Before and a Compare button.">
  </picture>
</p>

<p align="center">A small pill floats at the bottom of your dev server.<br>Click <b>Compare</b>, or press <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>C</kbd>.</p>

<br>

## Made for real review

- **Synced scroll and routes.** Scroll or navigate on one side and the other follows, even in app shells with an inner scroller.
- **Mirrored actions.** Clicks, typing, dropdown picks and Esc, Enter and the arrow keys are repeated on the other side. Controls are matched by their accessible name, so it still works when the markup changed underneath.
- **Every width.** Fit, 1440, 1024, 768 and 390, scaled to the pane. The phone layout gets reviewed too.
- **Remembers your setup.** View, width, swipe direction, Sync and Mirror come back the way you left them.
- **Light and dark.** Follows your system, with your brand color as the accent.
- **Out of the way.** Zero dependencies, its own shadow DOM so it never touches your styles, and nothing ships to production.

<br>

## Get started

**1. Install and set up.** `init` recognises your project and configures it. Add `--dry-run` to preview the changes.

```bash
npm install --save-dev before-after-compare
npx before-after init
```

**2. Run both sides,** in two terminals:

| Your project | Your work (after) | The base (before) |
| --- | --- | --- |
| Vite app | `npm run dev` | `npm run compare` |
| Plain HTML, CSS and JS | `npm run dev:compare` | `npm run compare` |
| Another dev server | your dev server, with the two tags `init` prints | `npx before-after` |

**3. Open your dev server** and click **Compare**.

The base is origin's default branch, or your last commit when there's no remote, which lets you compare uncommitted edits. Choose another with `--ref origin/staging`.

<br>

## How it works

1. **Check out.** The base branch is checked out as a git worktree in `~/.cache/before-after/`. Your files, branch and stash are never touched.
2. **Build.** It runs your `build` script there, or serves the files as they are when there's no build step. It rebuilds only when the branch moves.
3. **Serve.** The base is served on `localhost:5174` with the same pill. Paths you `proxy`, like `/api`, reach your local backend, so both sides show the same data.
4. **Compare.** Both sides load in frames that talk to each other, and they only accept messages from your two local servers.

<br>

## Review like a designer

- **Swipe slowly over spacing.** Your eye catches movement far better than it compares two still images.
- **Do a 390 pass.** Pick the phone width and scroll once. That's where regressions hide.
- **Walk the flow.** With Mirror on, open the menu, fill in the form, reach the empty state. Both sides follow.
- **Read the status.** "No match" means a control's name changed. Sometimes it's a bug, sometimes it's a copy change worth flagging.
- **Turn Mirror off before saving or deleting.** Both sides share your backend, so a mirrored action runs twice.

<br>

## Troubleshooting

`npx before-after` explains what went wrong and how to fix it. The common ones:

| Message | Fix |
| --- | --- |
| *…is running, but its page doesn't load the pill* | Vite: run `npx before-after init` and restart the dev server. No build step: use `npx before-after dev` instead of your own server. |
| *Port 5174 is already in use* | Another "before" server is running. Stop it, or use `--port 5175` with `beforeAfter({ beforeOrigin: "http://localhost:5175" })`. |
| *The build failed* | No build step: `--no-build`. Builds another way: `--build "<command>"`. Different dependencies on the base: drop `--install link`. |
| *The build finished but there's no …/index.html* | Set `dist` to your build's output folder, such as `build` or `out`. |
| *This folder isn't in a git repository* | `git init && git add -A && git commit -m "before"`, then make your changes. |

**Limitations.** Mirroring matches controls by name, so a renamed control needs doing on both sides. Scripts can't open native `<select>` menus, though picking an option is mirrored. Your dev server must allow being framed by its own origin, which Vite does by default.

<br>

## Reference

<details>
<summary><b>CLI</b></summary>

```
npx before-after init                set the project up; --dry-run to preview
npx before-after [serve] [options]   build and serve the base on :5174 (default)
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

Add `before-after.config.mjs` (or `.js` / `.json`) at your repo root, or in the folder you run the CLI from. Flags override the file.

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
<summary><b>Pill options</b></summary>

Pass these to `beforeAfter({ ... })` in Vite, and under `pill` in the config file so both sides match.

| Option | Default | |
| --- | --- | --- |
| `beforeLabel` / `afterLabel` | `"Before"` / `"After"` | Names of the two sides |
| `afterDetail` | `"working copy"` | Shown after the "after" name in the pill |
| `accent` | `#007AFF` | Color of the primary button, swipe line and highlights. Use your brand color |
| `widths` | `[1440, 1024, 768, 390]` | Width presets |
| `scrollContainer` | auto | Selector for the element that scrolls, when it isn't the window |

The Vite plugin also takes `beforeOrigin` (default `$BEFORE_AFTER_ORIGIN` or `http://localhost:5174`) and `enabled` (default: on unless `BEFORE_AFTER=0`).

</details>

<details>
<summary><b>Sites with no build step</b></summary>

`npx before-after dev [folder]` serves your working copy on `:5173` with the pill on every page, in place of your usual static server. Reload to see edits. `npx before-after` serves the base the same way on `:5174`, because a project with no `build` script is served as it is.

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
<summary><b>AI coding assistants</b></summary>

Point your assistant at [AGENTS.md](https://github.com/Gokulk87/before-after/blob/main/AGENTS.md), which ships inside the package. It has the setup as numbered steps for each kind of project, so the assistant uses `init` and `dev` instead of writing its own server.

</details>

<br>

<p align="center">
  <sub>Designed and built by <a href="https://github.com/Gokulk87">Gokul Krishnan</a>, a product designer who got tired of screenshot diffs. MIT licensed.</sub>
</p>
