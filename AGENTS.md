# Setting up before-after-compare (for AI coding assistants)

This file tells a coding assistant how to set up `before-after-compare` in someone's project. Follow these steps in order.

**Don't write your own server, proxy or HTML injection, and don't copy `client.js` into the project.** Every supported setup is covered by `npx before-after init`, `npx before-after dev` and the Vite plugin. If none fits, stop and tell the user. Don't improvise.

## What it does

It shows two versions of a web app side by side in the browser:

- **"before"**: another git ref, by default origin's default branch, or `HEAD` with no remote. `npx before-after` builds it in a worktree under `~/.cache/before-after/` and serves it on `:5174`.
- **"after"**: the user's working copy, on their dev server (`:5173` by default).

A pill on the "after" page opens the Compare view.

## Steps

1. **Check it's a git repo with at least one commit.** If it isn't, tell the user the "before" side is a commit and suggest `git init && git add -A && git commit -m "before"`. Only run that if they agree.
2. **Install:** `npm install --save-dev before-after-compare`. Use `pnpm add -D` / `yarn add -D` / `bun add -D` to match the lockfile.
3. **Set up:** run `npx before-after init` in the app's folder (the one with `package.json` / `vite.config` / `index.html`). Run it with `--dry-run` first if the user wants to review changes.
4. **Follow the "Next" steps `init` prints.** They depend on the project:

   | Project | Terminal 1 | Terminal 2 |
   | --- | --- | --- |
   | Vite app | the usual dev command (`npm run dev`), restarted after `init` | `npm run compare` (or `npx before-after`) |
   | No build step (plain HTML/CSS/JS, no `build` script) | `npx before-after dev` (instead of any other static server) | `npx before-after` |
   | Other dev server (webpack, Next.js, CRA…) | the user's dev server, after adding the two script tags `init` printed (development only) | `npx before-after --after http://localhost:<dev port>` |

5. **Tell the user to open the dev server URL** and click **Compare** in the pill at the bottom of the page, or press Alt+Shift+C.

## Rules for each kind of project

- **Vite.** The plugin is `import { beforeAfter } from "before-after-compare/vite"` in `plugins`. It only runs in dev. If `init` reports it couldn't edit the config safely, add those two lines by hand. Nothing else is needed.
- **No build step.** Don't add a build script or a bundler to make it work. `"build": false` in `before-after.config.json` (which `init` writes) or `--no-build` serves the files as they are. If the pages are in a subfolder, set `"dist": "public"` (or pass the folder to `dev`, e.g. `npx before-after dev public`).
- **Other dev servers.** Only add the two `<script>` tags `init` prints, in development only, and serve `/__before-after/client.js` from `node_modules/before-after-compare/src/client.js`. Set `"dist"` to the build output folder. For Next.js the "before" side needs `output: "export"` and `"dist": "out"`; if the user doesn't want that, say it isn't supported.
- **Monorepo.** Run from the app's folder, or set `"dir"` (relative to the repo root). `"install": "link"` reuses the checkout's `node_modules` and is much faster.
- **Backend.** If the app calls an API on its own origin (e.g. `/api`), add `"proxy": { "/api": "http://127.0.0.1:<backend port>" }` so the "before" side reaches it too.
- **Another base branch.** Use `--ref origin/<branch>` or `"ref"` in the config.

Put settings in `before-after.config.json` (or `.mjs`) at the app's folder or the repo root. Don't add environment variables or wrapper scripts for them.

## When something fails

`npx before-after` prints what went wrong and the fix. Apply that fix; don't work around it:

- *page doesn't load the pill*: the "after" side isn't set up. Re-run `init` and restart the dev server, or use `npx before-after dev` for a site with no build step.
- *Port … is already in use*: another "before" server is running. Ask the user to stop it, or use `--port <n>` plus `beforeAfter({ beforeOrigin: "http://localhost:<n>" })`.
- *The build failed*: use `--no-build` if there's no build step, `--build "<command>"` if it builds differently, or drop `install: "link"` if the base branch's dependencies differ.
- *no …/index.html*: set `"dist"` to the folder the build writes.

## Don't

- Don't write a custom HTTP server, Express middleware or proxy to serve either side.
- Don't inject the scripts into production builds or commit them into HTML files.
- Don't add a `postinstall` script.
- Don't change the user's git history: no commits, stashes or checkouts. The tool uses its own worktree.
