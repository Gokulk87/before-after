# Changelog

## 0.2.0

- `npx before-after init` detects the project and sets it up: adds the Vite plugin, writes the config for a site with no build step, or prints the script tags for another dev server.
- `npx before-after dev [folder]` serves a site with no build step with the pill on every page, so plain HTML/CSS/JS sites work without your own server.
- `build: false` (and `--no-build`) serves files as they are. It's the default when there's no `build` script, and `install` then defaults to `none`. The build command comes from the `build` script, run with your package manager.
- The pill is added to every HTML page, not only `index.html`; `/about` serves `about.html` and `/docs` serves `docs/index.html`. Dotfiles are never served.
- Errors say how to fix them: the dev server isn't showing the pill, a port clash (also caught when another server holds the port on IPv6, which used to pass silently), a failed build, a missing output folder, and no git repo or commits.
- `AGENTS.md` ships in the package: setup steps for AI coding assistants.

## 0.1.0

First release.

- `beforeAfter()` Vite plugin: the Before ⇄ After pill and Compare view on your dev server.
- `before-after` CLI: builds another git ref in a worktree and serves it with an SPA fallback, proxying (including WebSockets) and extra apps mounted under a path.
- Compare view: side by side, swipe, width presets, synced scroll and routes, mirrored clicks, typing, dropdown picks and keys.
