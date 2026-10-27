// Shared by capture.mjs and record.mjs: puts the showcase pages in a throwaway git repo
// (before.html committed, after.html as the working copy) and serves both sides with the CLI.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const art = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(art, "..", "bin", "cli.mjs");

export async function startShowcase({ afterPort, beforePort }) {
  const after = `http://localhost:${afterPort}`;
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ba-showcase-"));
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  fs.copyFileSync(path.join(art, "showcase", "before.html"), path.join(repo, "index.html"));
  fs.writeFileSync(path.join(repo, "before-after.config.json"), JSON.stringify({ build: false, cacheDir: path.join(repo, ".cache") }));
  fs.writeFileSync(path.join(repo, ".gitignore"), ".cache\n");
  git("add", "-A");
  git("-c", "user.name=a", "-c", "user.email=a@a", "commit", "-qm", "before");
  fs.copyFileSync(path.join(art, "showcase", "after.html"), path.join(repo, "index.html"));

  const children = [
    spawn(process.execPath, [cli, "dev", "--after", after, "--port", String(beforePort)], { cwd: repo, stdio: "ignore" }),
    spawn(process.execPath, [cli, "--after", after, "--port", String(beforePort)], { cwd: repo, stdio: "ignore" }),
  ];
  const stop = () => {
    for (const child of children) child.kill();
    fs.rmSync(repo, { recursive: true, force: true });
  };
  try {
    for (const url of [after, `http://localhost:${beforePort}/__before-after/health`]) {
      let up = false;
      for (let i = 0; i < 100 && !up; i++) {
        try {
          up = (await fetch(url)).ok;
        } catch {}
        if (!up) await new Promise((r) => setTimeout(r, 200));
      }
      if (!up) throw new Error(`nothing at ${url}`);
    }
  } catch (error) {
    stop();
    throw error;
  }
  return { after, stop };
}

const THEMES = {
  light: { chrome: "#f6f6f8", line: "rgba(0,0,0,.08)", url: "rgba(0,0,0,.05)", urlText: "#6e6e73", shadow: "0 40px 80px -20px rgba(0,0,0,.25), 0 12px 24px -8px rgba(0,0,0,.12), 0 0 0 .5px rgba(0,0,0,.12)" },
  dark: { chrome: "#28282c", line: "rgba(255,255,255,.08)", url: "rgba(255,255,255,.07)", urlText: "#a1a1a6", shadow: "0 40px 80px -20px rgba(0,0,0,.8), 0 0 0 .5px rgba(255,255,255,.14)" },
};

/**
 * Frames a screenshot as a Mac browser window and returns the PNG. With `background` the area around
 * the window is that color (GIF frames can't be transparent); without it, it's transparent.
 */
export async function frameShot(browser, shot, theme, { width, pad, url = "localhost:5173/settings", chrome = true, background }) {
  const t = THEMES[theme];
  const page = await browser.newPage({ viewport: { width: width + pad * 2, height: 400 }, deviceScaleFactor: 1 });
  const bar = chrome
    ? `<div style="height:44px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid ${t.line}">
        <i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i>
        <div style="flex:1;display:flex;justify-content:center"><span style="font:500 12.5px -apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,system-ui,sans-serif;color:${t.urlText};background:${t.url};padding:5px 60px;border-radius:7px">${url}</span></div>
        <span style="width:52px"></span>
      </div>`
    : "";
  await page.setContent(`<!doctype html><body style="margin:0">
    <div id="c" style="padding:${pad}px;display:inline-block;${background ? `background:${background}` : ""}">
      <div style="width:${width}px;border-radius:14px;overflow:hidden;box-shadow:${t.shadow};background:${t.chrome}">
        ${bar}<img src="data:image/png;base64,${shot.toString("base64")}" style="display:block;width:${width}px">
      </div>
    </div></body>`);
  const png = await page.locator("#c").screenshot({ omitBackground: !background });
  await page.close();
  return png;
}
