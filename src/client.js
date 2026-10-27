// before-after-compare: the in-page "Before ⇄ After" pill and Compare view.
//
// Served at /__before-after/client.js by two dev servers, never by a production build:
//   - the `beforeAfter()` Vite plugin (role "after", your normal dev server)
//   - the `before-after` CLI, a build of another git ref (role "before")
// Each server sets window.__BEFORE_AFTER__ = { role, beforeOrigin | afterOrigin, ref, ... } first.
//
// Top-level page: shows the pill (open the other side, or the Compare view).
// Inside a Compare iframe: no pill, only scroll + route + action sync with the parent.
// Everything lives in a shadow root and the browser top layer (popover / modal
// dialog), so it can't leak styles into the app or need a z-index.
(() => {
  if (window.__beforeAfterLoaded) return;
  window.__beforeAfterLoaded = true;

  const config = window.__BEFORE_AFTER__ || {};
  const role = config.role === "before" ? "before" : "after";
  const MSG = "before-after";
  const accent = config.accent || "#007AFF";
  const widths = Array.isArray(config.widths) && config.widths.length ? config.widths : [1440, 1024, 768, 390];
  const labels = {
    before: config.beforeLabel || "Before",
    after: config.afterLabel || "After",
    afterDetail: config.afterDetail || "working copy",
  };

  // localhost, 127.0.0.1 and [::1] on the same port are the same dev server.
  const normalizeOrigin = (origin) => {
    try {
      const url = new URL(origin);
      if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.hostname = "localhost";
      return url.origin;
    } catch {
      return "";
    }
  };
  const trusted = new Set([location.origin, config.beforeOrigin, config.afterOrigin].filter(Boolean).map(normalizeOrigin));
  const isTrusted = (origin) => trusted.has(normalizeOrigin(origin));

  if (window.top !== window) {
    setupFrameSync();
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPill, { once: true });
  } else {
    mountPill();
  }

  // ---------------------------------------------------------------- iframe side

  function setupFrameSync() {
    let lastApplied = null;
    // The parent introduces itself with a "hello" once the frame loads; until then nothing is sent,
    // and afterwards messages go to that exact origin only.
    let parentOrigin = null;

    const scrollable = (el) =>
      el.scrollHeight > el.clientHeight + 1 && /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY);
    // The window scrolls on most pages; app shells that pin a header scroll an inner element instead.
    // `scrollContainer` names it (used while it actually scrolls); otherwise the largest scrollable
    // element outside a dialog is used.
    let cached = null;
    let cachedAt = 0;
    const scroller = () => {
      if (config.scrollContainer) {
        const el = [...document.querySelectorAll(config.scrollContainer)].find(scrollable);
        if (el) return el;
      }
      const root = document.scrollingElement || document.documentElement;
      if (root.scrollHeight > root.clientHeight + 1) return root;
      if (cached && cached.isConnected && performance.now() - cachedAt < 500) return cached;
      let best = null;
      let bestArea = 0;
      for (const el of document.body.querySelectorAll("*")) {
        if (!scrollable(el) || el.closest('dialog, [role="dialog"], [role="listbox"], [role="menu"]')) continue;
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          best = el;
          bestArea = area;
        }
      }
      cached = best || root;
      cachedAt = performance.now();
      return cached;
    };
    const currentPath = () => location.pathname + location.search + location.hash;
    const post = (data) => {
      if (parentOrigin) window.parent.postMessage({ [MSG]: true, ...data }, parentOrigin);
    };

    document.addEventListener(
      "scroll",
      () => {
        const el = scroller();
        if (lastApplied !== null && Math.abs(el.scrollTop - lastApplied) < 2) return;
        lastApplied = null;
        post({ type: "scroll", top: el.scrollTop, left: el.scrollLeft });
      },
      { capture: true, passive: true },
    );

    // Report SPA route changes so the parent can follow them on the other side.
    const reportPath = () => post({ type: "path", path: currentPath() });
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        reportPath();
        return result;
      };
    }
    window.addEventListener("popstate", reportPath);
    reportPath();

    // ---- Mirror actions (clicks, typing, Esc/Enter/arrows) to the other side.
    // The two builds may use different markup, so a control is described by what it is called
    // (aria-label, its label, or its visible text) plus which occurrence of that name it is, and the
    // other side finds its own control with the same name. Only real (trusted) events are sent, so a
    // replayed action never echoes back.
    const ACTIONABLE =
      'button, a[href], summary, select, input, textarea, label, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="option"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="combobox"], [role="link"]';
    const clean = (text) => (text || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const nameOf = (el) => {
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
        if (clean(text)) return clean(text);
      }
      if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (label && clean(label.textContent)) return clean(label.textContent);
        }
        return clean(el.closest("label")?.textContent) || clean(el.getAttribute("placeholder")) || clean(el.getAttribute("name"));
      }
      // innerText follows layout, so "Inbox" + a "3" badge reads "Inbox 3", not "Inbox3".
      return clean(el.innerText || el.textContent);
    };
    // Loosest key: letters only, so counts and spacing differences between the two builds don't matter.
    const letters = (text) => text.toLowerCase().replace(/[^a-z]+/g, "");
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const candidates = (name) =>
      [...document.querySelectorAll(ACTIONABLE)].filter((el) => visible(el) && nameOf(el).toLowerCase() === name.toLowerCase());
    const describe = (el) => {
      const name = nameOf(el);
      if (!name) return null;
      return { name, nth: Math.max(0, candidates(name).indexOf(el)) };
    };
    const find = ({ name, nth }) => {
      let list = candidates(name);
      if (!list.length) {
        // Fall back to a looser match ("Invite member" vs "+ Invite member").
        const needle = name.toLowerCase();
        list = [...document.querySelectorAll(ACTIONABLE)].filter((el) => visible(el) && nameOf(el).toLowerCase().includes(needle));
      }
      if (!list.length && letters(name)) {
        const key = letters(name);
        list = [...document.querySelectorAll(ACTIONABLE)].filter((el) => visible(el) && letters(nameOf(el)) === key);
      }
      return list[Math.min(nth, list.length - 1)] || null;
    };
    const sameText = (a, b) => a.toLowerCase() === b.toLowerCase() || letters(a) === letters(b);
    const setNative = (select, text) => {
      const option = [...select.options].find((o) => sameText(clean(o.textContent), text));
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    // Radix-style components open menus and selects on pointerdown, tabs on mousedown, the rest on
    // click: send the whole sequence a real click produces.
    const press = (el) => {
      const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: "mouse", isPrimary: true, view: window };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
      el.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
      el.dispatchEvent(new MouseEvent("click", { ...opts, buttons: 0 }));
    };
    // An option picked on the other side: a native <select> on this side is set directly; a custom
    // dropdown is opened and its option clicked.
    const choose = async (control, text) => {
      if (control instanceof HTMLSelectElement) return setNative(control, text);
      const findOption = () =>
        [...document.querySelectorAll('[role="option"], [role="menuitemradio"], [role="menuitem"]')].find((o) => visible(o) && sameText(nameOf(o), text));
      let option = findOption();
      let opened = false;
      if (!option) {
        press(control);
        opened = true;
        for (let i = 0; i < 10 && !option; i++) {
          await new Promise((r) => setTimeout(r, 60));
          option = findOption();
        }
      }
      if (!option) return false;
      // Radix Select ignores the first pointer release after it opens (so press-and-hold doesn't pick by
      // accident); spend that release on the document, then pick. Enter is the fallback.
      if (opened) document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
      press(option);
      await new Promise((r) => setTimeout(r, 60));
      if (option.isConnected && visible(option)) {
        option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      }
      return true;
    };
    // A custom option clicked on the other side may be a native <option> here.
    const nativeOptionOwner = (text) =>
      [...document.querySelectorAll("select")].find((s) => visible(s) && [...s.options].some((o) => sameText(clean(o.textContent), text)));
    const flash = (el) => {
      const prev = el.style.outline;
      el.style.outline = `2px solid ${accent}`;
      setTimeout(() => (el.style.outline = prev), 600);
    };

    document.addEventListener(
      "click",
      (event) => {
        if (!event.isTrusted) return;
        const el = event.target instanceof Element ? event.target.closest(ACTIONABLE) : null;
        if (!el || /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|button|submit)$/.test(el.type)) return;
        // A label click is followed by the browser's own click on its control; mirror only that one.
        if (el instanceof HTMLLabelElement && el.control) return;
        // A native <select> opens an OS popup that closes as soon as this frame loses focus, and opening
        // the other side's dropdown would take focus. Leave native dropdowns to be opened by hand.
        if (el instanceof HTMLSelectElement) return;
        const target = describe(el);
        if (target) post({ type: "action", action: "click", target });
      },
      true,
    );
    document.addEventListener(
      "input",
      (event) => {
        if (!event.isTrusted) return;
        const el = event.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || /^(checkbox|radio)$/.test(el.type)) return;
        const target = describe(el);
        if (target) post({ type: "action", action: "input", target, value: el.value });
      },
      true,
    );
    document.addEventListener(
      "change",
      (event) => {
        if (!event.isTrusted || !(event.target instanceof HTMLSelectElement)) return;
        const el = event.target;
        const target = describe(el);
        const option = clean(el.selectedOptions[0]?.textContent);
        if (target && option) post({ type: "action", action: "choose", target, value: option });
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (!event.isTrusted || !["Escape", "Enter", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        if (event.key === "Enter" && event.target instanceof HTMLTextAreaElement) return;
        post({ type: "action", action: "key", key: event.key });
      },
      true,
    );

    window.addEventListener("message", (event) => {
      const data = event.data;
      // Only the Compare view that embeds this frame, served by one of the two dev servers, may drive it.
      if (!data || !data[MSG] || event.source !== window.parent || !isTrusted(event.origin)) return;
      if (data.type === "hello") {
        parentOrigin = event.origin;
        reportPath();
        return;
      }
      if (data.type === "scroll-to") {
        const el = scroller();
        lastApplied = data.top;
        el.scrollTo({ top: data.top, left: data.left, behavior: "instant" });
        return;
      }
      if (data.type !== "do-action") return;
      if (data.action === "key") {
        const el = document.activeElement || document.body;
        for (const type of ["keydown", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key: data.key, bubbles: true, cancelable: true }));
        return;
      }
      if (data.action === "choose") {
        const control = find(data.target);
        Promise.resolve(control ? choose(control, data.value) : false).then((ok) =>
          post({ type: "action-result", found: Boolean(ok), name: `${data.target?.name}: ${data.value}` }),
        );
        if (control) flash(control);
        return;
      }
      let el = find(data.target);
      if (!el && data.action === "click") {
        const owner = nativeOptionOwner(data.target?.name || "");
        if (owner) {
          const ok = setNative(owner, data.target.name);
          flash(owner);
          post({ type: "action-result", found: ok, name: data.target.name });
          return;
        }
      }
      post({ type: "action-result", found: Boolean(el), name: data.target?.name || "" });
      if (!el) return;
      flash(el);
      // Never move focus here: focusing this frame takes it from the one you're using, which closes its
      // open dropdown and interrupts typing.
      if (data.action === "input") {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, data.value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      if (el instanceof HTMLSelectElement) {
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
        return; // a script can't open a native dropdown
      }
      press(el);
    });
  }

  // ------------------------------------------------------------- top-level side

  function mountPill() {
    const otherOrigin =
      role === "after" ? config.beforeOrigin || "http://localhost:5174" : config.afterOrigin || "http://localhost:5173";
    const afterOrigin = role === "after" ? location.origin : otherOrigin;
    const beforeOrigin = role === "after" ? otherOrigin : location.origin;
    const currentPath = () => location.pathname + location.search + location.hash;

    const host = document.createElement("div");
    host.setAttribute("data-before-after", "");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${css()}</style>${html(role, new URL(beforeOrigin).host)}`;

    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => [...root.querySelectorAll(sel)];
    const pill = $(".pill");
    const dialog = $("dialog");
    const stage = $(".stage");
    const frames = { before: $("iframe.before"), after: $("iframe.after") };
    const panes = { before: $(".pane.before"), after: $(".pane.after") };
    const frameOrigin = { before: beforeOrigin, after: afterOrigin };
    const pathInput = $("input.path");
    const handle = $(".handle");

    const state = { mode: "side", width: "fit", axis: "x", sync: true, mirror: true, swipe: 50, path: currentPath() };
    // The view, width, swipe direction and toggles you last picked, remembered per browser.
    const viewKey = "before-after:view";
    const modes = ["side", "stack", "swipe", "before", "after"];
    try {
      const saved = JSON.parse(localStorage.getItem(viewKey) || "{}");
      if (modes.includes(saved.mode)) state.mode = saved.mode;
      if (saved.width === "fit" || widths.map(String).includes(saved.width)) state.width = saved.width;
      if (saved.axis === "x" || saved.axis === "y") state.axis = saved.axis;
      if (typeof saved.sync === "boolean") state.sync = saved.sync;
      if (typeof saved.mirror === "boolean") state.mirror = saved.mirror;
    } catch {}
    const saveView = () => {
      try {
        const { mode, width, axis, sync, mirror } = state;
        localStorage.setItem(viewKey, JSON.stringify({ mode, width, axis, sync, mirror }));
      } catch {}
    };
    const send = (side, data) => frames[side].contentWindow?.postMessage({ [MSG]: true, ...data }, frameOrigin[side]);

    const showPill = () => pill.showPopover?.();
    const hidePill = () => pill.hidePopover?.();
    if (!pill.showPopover) pill.classList.add("no-popover");
    showPill();

    // Collapse to a dot; remembered per browser.
    const collapsedKey = "before-after:collapsed";
    const setCollapsed = (value) => {
      pill.classList.toggle("collapsed", value);
      $(".dot").setAttribute("aria-expanded", String(!value));
      try {
        localStorage.setItem(collapsedKey, value ? "1" : "0");
      } catch {}
    };
    try {
      setCollapsed(localStorage.getItem(collapsedKey) === "1");
    } catch {}
    $(".dot").addEventListener("click", () => setCollapsed(!pill.classList.contains("collapsed")));

    $(".open-other").addEventListener("click", () => {
      window.open(otherOrigin + currentPath(), role === "after" ? "before-after:before" : "before-after:after");
    });
    if (role === "before" && config.ref) $(".pill .detail").textContent = config.ref;

    // ---- Compare view
    const compareButton = $(".open-compare");
    if (compareButton) compareButton.addEventListener("click", openCompare);
    document.addEventListener("keydown", (event) => {
      if (role === "after" && event.altKey && event.shiftKey && event.code === "KeyC") {
        event.preventDefault();
        dialog.open ? dialog.close() : openCompare();
      }
    });

    function openCompare() {
      state.path = currentPath();
      pathInput.value = state.path;
      loadFrames();
      hidePill();
      stage.classList.remove("ready");
      dialog.showModal();
      // Start with focus on the window, not the route field: Esc and Tab work, and no field lights up.
      dialog.focus();
      layout();
      // Animate later layout changes, not the first one.
      requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add("ready")));
      checkBefore();
    }
    dialog.addEventListener("close", () => {
      // Unload the frames so two copies of the app don't keep polling the API.
      frames.before.src = "about:blank";
      frames.after.src = "about:blank";
      showPill();
    });
    for (const side of ["before", "after"]) {
      frames[side].addEventListener("load", () => send(side, { type: "hello" }));
    }
    $(".close").addEventListener("click", () => dialog.close());
    $(".reload").addEventListener("click", () => loadFrames());
    for (const button of $$("[data-open]")) {
      button.addEventListener("click", () => window.open(frameOrigin[button.dataset.open] + state.path, `before-after:${button.dataset.open}`));
    }
    const copy = $(".copy");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText("npx before-after");
        copy.textContent = "Copied";
        setTimeout(() => (copy.textContent = "Copy"), 1500);
      } catch {}
    });

    pathInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const value = pathInput.value.trim() || "/";
      state.path = value.startsWith("/") ? value : `/${value}`;
      loadFrames();
    });

    function loadFrames() {
      frames.before.src = beforeOrigin + state.path;
      frames.after.src = afterOrigin + state.path;
    }

    const choose = (attr, key) => {
      for (const button of $$(`button[data-${attr}]`)) {
        button.addEventListener("click", () => {
          state[key] = button.dataset[attr];
          saveView();
          layout();
        });
      }
    };
    choose("mode", "mode");
    choose("width", "width");
    choose("axis", "axis");
    for (const key of ["sync", "mirror"]) {
      $(`.toggle.${key}`).addEventListener("click", () => {
        state[key] = !state[key];
        saveView();
        layout();
      });
    }

    // ---- Swipe handle: drag it, or use the arrow keys (Shift for bigger steps)
    handle.addEventListener("pointerdown", (event) => {
      handle.setPointerCapture(event.pointerId);
      stage.classList.add("dragging");
    });
    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const box = panes.after.getBoundingClientRect();
      const ratio = state.axis === "x" ? (event.clientX - box.left) / box.width : (event.clientY - box.top) / box.height;
      state.swipe = Math.min(100, Math.max(0, ratio * 100));
      layout();
    });
    const endDrag = () => stage.classList.remove("dragging");
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    handle.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 10 : 2;
      const [back, forward] = state.axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      if (event.key === back) state.swipe = Math.max(0, state.swipe - step);
      else if (event.key === forward) state.swipe = Math.min(100, state.swipe + step);
      else return;
      event.preventDefault();
      layout();
    });

    // ---- Sync scroll + route between the two frames
    const status = $(".mirror-status");
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || !data[MSG]) return;
      const from = event.source === frames.before.contentWindow ? "before" : event.source === frames.after.contentWindow ? "after" : null;
      if (!from || normalizeOrigin(event.origin) !== normalizeOrigin(frameOrigin[from])) return;
      const to = from === "before" ? "after" : "before";
      if (data.type === "scroll" && state.sync) {
        send(to, { type: "scroll-to", top: data.top, left: data.left });
      }
      if (data.type === "action-result") {
        status.textContent = data.found ? `Mirrored: ${data.name}` : `No match for “${data.name}”`;
        status.dataset.miss = data.found ? "" : "1";
        status.dataset.show = "1";
        clearTimeout(status._t);
        status._t = setTimeout(() => {
          status.dataset.show = "";
          // Give the space back once it has faded out.
          status._t = setTimeout(() => (status.textContent = ""), 300);
        }, 3500);
      }
      if (data.type === "action" && state.mirror) {
        send(to, { type: "do-action", action: data.action, target: data.target, value: data.value, key: data.key });
      }
      if (data.type === "path" && typeof data.path === "string" && data.path.startsWith("/") && data.path !== state.path && state.sync) {
        state.path = data.path;
        pathInput.value = data.path;
        frames[to].src = frameOrigin[to] + data.path;
      }
    });

    // ---- Is the "before" server running?
    let beforeTimer = null;
    async function checkBefore() {
      clearTimeout(beforeTimer);
      let ok = false;
      try {
        const response = await fetch(beforeOrigin + "/__before-after/health", { cache: "no-store" });
        const info = await response.json();
        ok = response.ok;
        const ref = info.ref ? `${info.ref} · ${String(info.sha || "").slice(0, 7)}` : "base";
        for (const el of $$(".before-ref")) el.textContent = ref;
      } catch {}
      panes.before.classList.toggle("offline", !ok);
      if (!ok && dialog.open) beforeTimer = setTimeout(checkBefore, 2000);
    }

    // ---- Layout: side by side, stacked, swipe (either direction), or one side, at a chosen width
    const resizeObserver = new ResizeObserver(() => layout());
    resizeObserver.observe(stage);

    // Segmented controls: a thumb slides under the selected segment.
    const moveThumbs = () => {
      for (const seg of $$(".seg")) {
        const on = seg.querySelector('button[aria-pressed="true"]');
        const thumb = seg.querySelector(".thumb");
        if (!thumb) continue;
        thumb.style.opacity = on ? "1" : "0";
        if (on) {
          thumb.style.width = `${on.offsetWidth}px`;
          thumb.style.transform = `translateX(${on.offsetLeft}px)`;
        }
      }
    };

    function layout() {
      if (!dialog.open) return;
      const press = (sel, isOn) => {
        for (const button of $$(sel)) button.setAttribute("aria-pressed", String(isOn(button)));
      };
      press("button[data-mode]", (b) => b.dataset.mode === state.mode);
      press("button[data-width]", (b) => b.dataset.width === state.width);
      press("button[data-axis]", (b) => b.dataset.axis === state.axis);
      press(".toggle.sync", () => state.sync);
      press(".toggle.mirror", () => state.mirror);

      const swipe = state.mode === "swipe";
      $(".seg.axis").hidden = !swipe;
      $(".legend").hidden = !swipe;
      stage.dataset.mode = state.mode;
      stage.dataset.axis = state.axis;
      moveThumbs();

      // Side by side splits the width, stacked splits the height (before on top), the rest fill the
      // stage. Each pane has a caption bar, except in swipe mode, where the legend above names the sides.
      const gap = 12;
      const caption = swipe ? 0 : 36;
      const stageWidth = stage.clientWidth;
      const stageHeight = stage.clientHeight;
      const paneWidth = state.mode === "side" ? (stageWidth - gap) / 2 : stageWidth;
      const paneHeight = state.mode === "stack" ? (stageHeight - gap) / 2 : stageHeight;
      const viewHeight = paneHeight - caption;
      const targetWidth = state.width === "fit" ? paneWidth : Number(state.width);
      const scale = Math.min(1, paneWidth / targetWidth);
      const offsetX = Math.max(0, (paneWidth - targetWidth * scale) / 2);

      for (const side of ["before", "after"]) {
        const pane = panes[side];
        const frame = frames[side];
        const second = side === "after";
        pane.hidden = !(["side", "stack", "swipe"].includes(state.mode) || state.mode === side);
        pane.style.width = `${paneWidth}px`;
        pane.style.height = `${paneHeight}px`;
        pane.style.left = state.mode === "side" && second ? `${paneWidth + gap}px` : "0px";
        pane.style.top = state.mode === "stack" && second ? `${paneHeight + gap}px` : "0px";
        frame.style.width = `${targetWidth}px`;
        frame.style.height = `${viewHeight / scale}px`;
        frame.style.transform = `translateX(${offsetX}px) scale(${scale})`;
      }

      const across = state.axis === "x";
      panes.after.style.clipPath = swipe ? (across ? `inset(0 0 0 ${state.swipe}%)` : `inset(${state.swipe}% 0 0 0)`) : "";
      handle.hidden = !swipe;
      handle.classList.toggle("y", !across);
      handle.style.left = across ? `${(paneWidth * state.swipe) / 100}px` : "";
      handle.style.top = across ? "" : `${(paneHeight * state.swipe) / 100}px`;
      handle.setAttribute("aria-orientation", across ? "horizontal" : "vertical");
      handle.setAttribute("aria-valuenow", String(Math.round(state.swipe)));
      $(".scale-note").textContent = scale < 1 ? `${targetWidth}px · ${Math.round(scale * 100)}%` : "";
    }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // Line icons on a 16px grid, drawn like SF Symbols: 1.5 strokes, round caps.
  function icon(name) {
    const paths = {
      side: '<rect x="2" y="3" width="12" height="10" rx="2.25"/><path d="M8 3v10"/>',
      stack: '<rect x="2" y="3" width="12" height="10" rx="2.25"/><path d="M2 8h12"/>',
      swipe: '<rect x="2" y="3" width="12" height="10" rx="2.25"/><path d="M8 1.5v13"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>',
      x: '<path d="M2.5 8h11M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5"/>',
      y: '<path d="M8 2.5v11M5.5 5 8 2.5 10.5 5M5.5 11 8 13.5 10.5 11"/>',
      sync: '<path d="M6.75 9.25l2.5-2.5"/><path d="M7.25 4.75l.9-.9a2.6 2.6 0 0 1 3.7 3.7l-.9.9"/><path d="M8.75 11.25l-.9.9a2.6 2.6 0 0 1-3.7-3.7l.9-.9"/>',
      mirror: '<path d="M3.5 2.5 12 7.25l-3.6.95L10.6 12l-1.5.85-2.2-3.8-2.4 2.45z" stroke-linejoin="round"/>',
      reload: '<path d="M13 8a5 5 0 1 1-1.46-3.54"/><path d="M13 2.75v3h-3"/>',
      open: '<path d="M9.25 2.75h4v4"/><path d="M13.25 2.75 7.5 8.5"/><path d="M11.25 9.5v2.25a1.5 1.5 0 0 1-1.5 1.5h-5.5a1.5 1.5 0 0 1-1.5-1.5v-5.5a1.5 1.5 0 0 1 1.5-1.5H6.5"/>',
      close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
      route: '<circle cx="8" cy="8" r="5.75"/><path d="M2.25 8h11.5M8 2.25c1.6 1.6 2.4 3.5 2.4 5.75S9.6 12.15 8 13.75C6.4 12.15 5.6 10.25 5.6 8S6.4 3.85 8 2.25z"/>',
      terminal: '<rect x="2" y="3" width="12" height="10" rx="2.25"/><path d="M5 6.5 7 8.25 5 10M8.5 10h2.5"/>',
      chevrons: '<path d="M6 5 3 8l3 3M10 5l3 3-3 3"/>',
    };
    return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function html(currentRole, beforeHost) {
    const b = escapeHtml(labels.before);
    const a = escapeHtml(labels.after);
    const afterDetail = escapeHtml(labels.afterDetail);
    const after = currentRole === "after";
    const seg = (label, cls, buttons) => `<div class="seg ${cls}" role="group" aria-label="${label}"><span class="thumb" aria-hidden="true"></span>${buttons}</div>`;
    const iconButton = (attr, name, label) => `<button type="button" ${attr} aria-label="${label}" title="${label}">${icon(name)}</button>`;
    const caption = (side, name, detail, cls = "") =>
      `<span class="mark ${side}" aria-hidden="true"></span><span class="name">${name}</span><span class="sub ${cls}">${detail}</span>` +
      `<button type="button" class="icon-btn small" data-open="${side}" aria-label="Open ${name.toLowerCase()} in a new tab" title="Open in a new tab">${icon("open")}</button>`;
    return `
      <div class="pill" popover="manual" role="group" aria-label="Before and after compare">
        <button type="button" class="dot" aria-label="Collapse or expand the compare pill" title="Collapse"><span></span></button>
        <span class="label"><span class="name">${after ? a : b}</span><span class="detail">${after ? afterDetail : "base"}</span></span>
        <span class="sep" aria-hidden="true"></span>
        <button type="button" class="btn ghost open-other">${after ? b : a}${icon("open")}</button>
        ${after ? `<button type="button" class="btn primary open-compare" title="Compare (Alt+Shift+C)">Compare<kbd>⌥⇧C</kbd></button>` : ""}
      </div>
      <dialog aria-label="Before and after compare" tabindex="-1">
        <header class="toolbar">
          <label class="field" title="Route on both sides; press Enter to load">${icon("route")}<input class="path" aria-label="Route" spellcheck="false" autocomplete="off" /></label>
          ${seg(
            "View",
            "views",
            iconButton('data-mode="side"', "side", "Side by side") +
              iconButton('data-mode="stack"', "stack", "Stacked") +
              iconButton('data-mode="swipe"', "swipe", "Swipe") +
              `<button type="button" data-mode="before" title="${b} only">${b}</button>` +
              `<button type="button" data-mode="after" title="${a} only">${a}</button>`,
          )}
          ${seg("Swipe direction", "axis", iconButton('data-axis="x"', "x", "Swipe left and right") + iconButton('data-axis="y"', "y", "Swipe up and down"))}
          ${seg(
            "Viewport width",
            "widths",
            `<button type="button" data-width="fit" title="Fit the pane">Fit</button>` +
              widths.map((w) => `<button type="button" data-width="${Number(w)}" title="${Number(w)}px wide">${Number(w)}</button>`).join(""),
          )}
          <span class="scale-note" aria-live="polite"></span>
          <span class="spacer"></span>
          <span class="mirror-status" role="status" aria-live="polite"></span>
          <button type="button" class="toggle sync" aria-label="Sync scroll and route" title="Sync: scroll and navigation on one side follow on the other">${icon("sync")}<span>Sync</span></button>
          <button type="button" class="toggle mirror" aria-label="Mirror actions" title="Mirror: clicks, typing and Esc/Enter/arrow keys on one side are repeated on the other">${icon("mirror")}<span>Mirror</span></button>
          <span class="divider" aria-hidden="true"></span>
          ${iconButton('class="icon-btn reload"', "reload", "Reload both sides")}
          ${iconButton('class="icon-btn close"', "close", "Close compare (Esc)")}
        </header>
        <div class="legend" hidden>
          <span class="chip">${caption("before", b, "base", "before-ref")}</span>
          <span class="chip">${caption("after", a, afterDetail)}</span>
        </div>
        <div class="stage" data-mode="side">
          <section class="pane before" aria-label="${b}">
            <div class="caption">${caption("before", b, "base", "before-ref")}</div>
            <div class="viewport">
              <iframe class="before" title="${b}"></iframe>
              <div class="offline-note">
                <div class="empty">
                  <span class="badge">${icon("terminal")}</span>
                  <strong>Start the “${b.toLowerCase()}” side</strong>
                  <p>Run this in a second terminal. This view connects on its own.</p>
                  <div class="command"><code>npx before-after</code><button type="button" class="copy">Copy</button></div>
                  <span class="waiting"><span class="pulse"></span>Waiting for ${escapeHtml(beforeHost)}</span>
                </div>
              </div>
            </div>
          </section>
          <section class="pane after" aria-label="${a}">
            <div class="caption">${caption("after", a, afterDetail)}</div>
            <div class="viewport"><iframe class="after" title="${a}"></iframe></div>
          </section>
          <div class="handle" role="slider" tabindex="0" aria-label="Swipe position" aria-valuemin="0" aria-valuemax="100" hidden>
            <span class="knob">${icon("chevrons")}</span>
          </div>
        </div>
      </dialog>`;
  }

  // Lives outside the app, in its own shadow root: its own tokens, light and dark, plus the configured accent.
  function css() {
    return `
      :host {
        all: initial;
        --accent: ${accent.replace(/[;{}<>]/g, "")};
        --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif;
        --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
        --bg: #f5f5f7; --material: rgba(255, 255, 255, .72); --surface: #fff;
        --text: #1d1d1f; --text-2: #6e6e73; --text-3: #8e8e93;
        --hairline: rgba(0, 0, 0, .1); --fill: rgba(118, 118, 128, .12); --fill-hover: rgba(118, 118, 128, .2); --thumb: #fff;
        --before: #ff9f0a; --danger: #d70015;
        --shadow-sm: 0 1px 2px rgba(0, 0, 0, .06), 0 0 0 .5px rgba(0, 0, 0, .06);
        --shadow-thumb: 0 1px 3px rgba(0, 0, 0, .12), 0 0 0 .5px rgba(0, 0, 0, .04);
        --shadow-lg: 0 16px 48px rgba(0, 0, 0, .14), 0 4px 12px rgba(0, 0, 0, .06), 0 0 0 .5px rgba(0, 0, 0, .08);
        --ease: cubic-bezier(.32, .72, 0, 1);
        color-scheme: light dark;
      }
      @media (prefers-color-scheme: dark) {
        :host {
          --bg: #000; --material: rgba(30, 30, 32, .72); --surface: #1c1c1e;
          --text: #f5f5f7; --text-2: #a1a1a6; --text-3: #6e6e73;
          --hairline: rgba(255, 255, 255, .12); --fill: rgba(118, 118, 128, .24); --fill-hover: rgba(118, 118, 128, .32); --thumb: #636366;
          --danger: #ff6961;
          --shadow-sm: 0 0 0 .5px rgba(255, 255, 255, .1);
          --shadow-thumb: 0 1px 3px rgba(0, 0, 0, .4);
          --shadow-lg: 0 16px 48px rgba(0, 0, 0, .6), 0 0 0 .5px rgba(255, 255, 255, .12);
        }
      }
      * { box-sizing: border-box; font-family: var(--font); -webkit-font-smoothing: antialiased; }
      button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; margin: 0; }
      svg { flex: none; display: block; }
      :is(button, .handle):focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 1px; }
      [hidden] { display: none !important; }

      /* ---- Pill */
      .pill {
        inset: auto auto 20px 50%; translate: -50% 0; margin: 0; border: 0;
        display: flex; align-items: center; gap: 6px; padding: 5px; border-radius: 999px;
        background: var(--material); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
        color: var(--text); font-size: 13px; letter-spacing: -.01em; box-shadow: var(--shadow-lg);
        animation: rise .5s var(--ease) both;
      }
      .pill.no-popover { position: fixed; z-index: 2147483000; }
      @keyframes rise { from { opacity: 0; transform: translateY(12px) scale(.96); } }
      .dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; }
      .dot span { width: 9px; height: 9px; border-radius: 50%; background: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); transition: transform .3s var(--ease); }
      .dot:hover span { transform: scale(1.15); }
      .label { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; padding-right: 4px; }
      .label .name { font-weight: 600; }
      .label .detail { color: var(--text-2); }
      .sep { width: 1px; height: 18px; background: var(--hairline); margin: 0 2px; }
      .btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 13px; border-radius: 999px;
        font-size: 13px; font-weight: 500; white-space: nowrap; transition: background .2s, transform .2s var(--ease); }
      .btn:active { transform: scale(.97); }
      .btn.ghost { color: var(--text); }
      .btn.ghost svg { width: 13px; height: 13px; color: var(--text-2); }
      .btn.ghost:hover { background: var(--fill); }
      .btn.primary { background: var(--accent); color: #fff; padding-right: 8px; }
      .btn.primary:hover { background: color-mix(in srgb, var(--accent) 88%, #000); }
      kbd { font: 500 11px var(--font); padding: 2px 6px; border-radius: 6px; background: rgba(255, 255, 255, .22); letter-spacing: .02em; }
      .pill.collapsed { padding: 3px; gap: 0; }
      .pill.collapsed > :not(.dot) { display: none; }

      /* ---- Compare window */
      dialog {
        width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0;
        display: none; flex-direction: column; background: var(--bg); color: var(--text); font-size: 13px; letter-spacing: -.01em;
      }
      dialog[open] { display: flex; animation: fade .25s var(--ease); outline: none; }
      dialog::backdrop { background: rgba(0, 0, 0, .3); }
      @keyframes fade { from { opacity: 0; } }
      .toolbar {
        display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; padding: 10px 14px;
        background: var(--material); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
        border-bottom: .5px solid var(--hairline); position: relative; z-index: 2;
      }
      .field { display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 10px; border-radius: 8px;
        background: var(--fill); color: var(--text-3); min-width: 220px; transition: background .2s, box-shadow .2s; }
      .field:focus-within { background: var(--surface); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent); }
      .path { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--text); font: 12.5px var(--mono); }

      .seg { position: relative; flex: none; display: inline-flex; padding: 2px; border-radius: 9px; background: var(--fill); isolation: isolate; }
      .seg button { position: relative; z-index: 1; height: 26px; min-width: 32px; padding: 0 10px; border-radius: 7px;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px; font-weight: 500;
        color: var(--text-2); font-variant-numeric: tabular-nums; transition: color .2s; }
      .seg button:hover { color: var(--text); }
      .seg button[aria-pressed="true"] { color: var(--text); }
      .seg .thumb { position: absolute; z-index: 0; top: 2px; left: 0; height: 26px; border-radius: 7px; background: var(--thumb);
        box-shadow: var(--shadow-thumb); transition: transform .35s var(--ease), width .35s var(--ease), opacity .2s; }
      .views button[data-mode="before"] { margin-left: 4px; }
      .views button[data-mode="before"]::before { content: ""; position: absolute; left: -3px; top: 6px; bottom: 6px; width: 1px; background: var(--hairline); }

      .toggle { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px;
        color: var(--text-2); font-size: 12.5px; font-weight: 500; transition: background .2s, color .2s; }
      .toggle:hover { background: var(--fill); color: var(--text); }
      .toggle[aria-pressed="true"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
      .icon-btn { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: var(--text-2); transition: background .2s, color .2s; }
      .icon-btn:hover { background: var(--fill); color: var(--text); }
      .icon-btn.small { width: 24px; height: 24px; border-radius: 6px; margin-left: auto; }
      .icon-btn.small svg { width: 13px; height: 13px; }
      .divider { width: 1px; height: 18px; background: var(--hairline); margin: 0 2px; }
      .spacer { flex: 1; }
      .scale-note { color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
      .mirror-status { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-2);
        padding: 4px 10px; border-radius: 999px; background: var(--fill); opacity: 0; transform: translateY(2px); transition: opacity .25s, transform .25s var(--ease); }
      .mirror-status[data-show="1"] { opacity: 1; transform: none; }
      .mirror-status:empty { display: none; }
      .mirror-status[data-miss="1"] { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }

      /* ---- Stage, panes, captions */
      .legend { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px 0; }
      .chip, .caption { display: flex; align-items: center; gap: 7px; font-size: 12.5px; white-space: nowrap; }
      .chip { padding: 4px 4px 4px 11px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow-sm); }
      .mark { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
      .mark.before { background: var(--before); }
      .name { font-weight: 600; }
      .sub { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
      .stage { position: relative; flex: 1; margin: 12px 14px 14px; min-height: 0; }
      .pane { position: absolute; top: 0; left: 0; display: flex; flex-direction: column; overflow: hidden;
        background: var(--surface); border-radius: 12px; box-shadow: var(--shadow-sm); }
      .stage.ready .pane { transition: left .45s var(--ease), top .45s var(--ease), width .45s var(--ease), height .45s var(--ease); }
      .caption { flex: none; height: 36px; padding: 0 6px 0 12px; border-bottom: .5px solid var(--hairline); }
      .stage[data-mode="swipe"] .caption { display: none; }
      .viewport { position: relative; flex: 1; min-height: 0; overflow: hidden; }
      .viewport iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: #fff; }
      .stage.ready .viewport iframe { transition: transform .45s var(--ease); }

      /* ---- Not running yet */
      .offline-note { display: none; position: absolute; inset: 0; z-index: 2; place-items: center; padding: 24px; background: var(--surface); }
      .pane.offline .offline-note { display: grid; }
      .empty { display: grid; justify-items: center; gap: 10px; max-width: 320px; text-align: center; }
      .badge { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--fill); color: var(--text-2); margin-bottom: 4px; }
      .badge svg { width: 22px; height: 22px; }
      .empty strong { font-size: 15px; font-weight: 600; letter-spacing: -.015em; }
      .empty p { margin: 0; color: var(--text-2); line-height: 1.45; }
      .command { display: flex; align-items: center; gap: 8px; margin-top: 4px; padding: 4px 4px 4px 12px; border-radius: 10px; background: var(--fill); }
      .command code { font: 12.5px var(--mono); }
      .copy { height: 26px; padding: 0 10px; border-radius: 7px; background: var(--surface); box-shadow: var(--shadow-thumb); font-size: 12px; font-weight: 500; }
      .waiting { display: inline-flex; align-items: center; gap: 7px; margin-top: 6px; font-size: 12px; color: var(--text-3); }
      .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--before); animation: pulse 1.6s ease-in-out infinite; }
      @keyframes pulse { 50% { opacity: .3; transform: scale(.8); } }

      /* ---- Swipe handle */
      .handle { position: absolute; z-index: 3; top: 0; bottom: 0; width: 32px; margin-left: -16px; cursor: ew-resize; touch-action: none; display: grid; place-items: center; }
      .handle::before { content: ""; position: absolute; top: 0; bottom: 0; left: 15px; width: 2px; border-radius: 2px; background: var(--accent);
        box-shadow: 0 0 0 .5px rgba(0, 0, 0, .1); }
      .handle.y { left: 0; right: 0; bottom: auto; width: auto; height: 32px; margin: -16px 0 0; cursor: ns-resize; }
      .handle.y::before { top: 15px; bottom: auto; left: 0; right: 0; width: auto; height: 2px; }
      .knob { position: relative; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
        background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); transition: transform .25s var(--ease); }
      .handle.y .knob svg { transform: rotate(90deg); }
      .handle:hover .knob { transform: scale(1.08); }
      .stage.dragging .knob { transform: scale(.94); }
      .stage.dragging iframe { pointer-events: none; }
      .stage.dragging .pane, .stage.dragging iframe { transition: none !important; }

      /* Narrower windows: icon-only toggles and a shorter route field keep the toolbar on one line. */
      @media (max-width: 1180px) {
        .toggle span { display: none; }
        .toggle { padding: 0 8px; }
        .field { min-width: 0; flex: 0 1 180px; }
      }
      @media (max-width: 900px) {
        .field { flex-basis: 120px; }
        .scale-note { display: none; }
      }
      @media (max-width: 760px) {
        .toolbar { flex-wrap: wrap; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before { transition: none !important; animation: none !important; }
      }
    `;
  }
})();
