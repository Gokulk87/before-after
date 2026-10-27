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
  const accent = config.accent || "#2563eb";
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
    root.innerHTML = `<style>${css()}</style>${html(role)}`;

    const $ = (sel) => root.querySelector(sel);
    const pill = $(".pill");
    const dialog = $("dialog");
    const stage = $(".stage");
    const frames = { before: $("iframe.before"), after: $("iframe.after") };
    const panes = { before: $(".pane.before"), after: $(".pane.after") };
    const frameOrigin = { before: beforeOrigin, after: afterOrigin };
    const pathInput = $("input.path");
    const handle = $(".handle");

    const state = { mode: "side", width: "fit", swipe: 50, path: currentPath() };
    const send = (side, data) => frames[side].contentWindow?.postMessage({ [MSG]: true, ...data }, frameOrigin[side]);

    const showPill = () => pill.showPopover?.();
    const hidePill = () => pill.hidePopover?.();
    if (!pill.showPopover) pill.classList.add("no-popover");
    showPill();

    // Collapse to a dot; remembered per browser.
    const collapsedKey = "before-after:collapsed";
    const setCollapsed = (value) => {
      pill.classList.toggle("collapsed", value);
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
      dialog.showModal();
      layout();
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
    $(".open-before").addEventListener("click", () => window.open(beforeOrigin + state.path, "before-after:before"));

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

    for (const button of root.querySelectorAll("[data-mode]")) {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        layout();
      });
    }
    for (const button of root.querySelectorAll("[data-width]")) {
      button.addEventListener("click", () => {
        state.width = button.dataset.width;
        layout();
      });
    }

    // ---- Swipe handle
    handle.addEventListener("pointerdown", (event) => {
      handle.setPointerCapture(event.pointerId);
      stage.classList.add("dragging");
    });
    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const box = panes.after.getBoundingClientRect();
      state.swipe = Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100));
      layout();
    });
    const endDrag = () => stage.classList.remove("dragging");
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    handle.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 10 : 2;
      if (event.key === "ArrowLeft") state.swipe = Math.max(0, state.swipe - step);
      else if (event.key === "ArrowRight") state.swipe = Math.min(100, state.swipe + step);
      else return;
      event.preventDefault();
      layout();
    });

    // ---- Sync scroll + route between the two frames
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || !data[MSG]) return;
      const from = event.source === frames.before.contentWindow ? "before" : event.source === frames.after.contentWindow ? "after" : null;
      if (!from || normalizeOrigin(event.origin) !== normalizeOrigin(frameOrigin[from])) return;
      const to = from === "before" ? "after" : "before";
      if (data.type === "scroll" && $("input.sync").checked) {
        send(to, { type: "scroll-to", top: data.top, left: data.left });
      }
      if (data.type === "action-result") {
        const status = $(".mirror-status");
        status.textContent = data.found ? `Mirrored: ${data.name}` : `No match on the other side for “${data.name}”`;
        status.dataset.miss = data.found ? "" : "1";
        clearTimeout(status._t);
        status._t = setTimeout(() => (status.textContent = ""), 3500);
      }
      if (data.type === "action" && $("input.mirror").checked) {
        send(to, { type: "do-action", action: data.action, target: data.target, value: data.value, key: data.key });
      }
      if (data.type === "path" && typeof data.path === "string" && data.path.startsWith("/") && data.path !== state.path && $("input.sync").checked) {
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
        $(".before-ref").textContent = info.ref ? `${info.ref} @ ${String(info.sha || "").slice(0, 7)}` : "base";
      } catch {}
      panes.before.classList.toggle("offline", !ok);
      if (!ok && dialog.open) beforeTimer = setTimeout(checkBefore, 2000);
    }

    // ---- Layout: side by side, swipe, or a single side, at a chosen width
    const resizeObserver = new ResizeObserver(() => layout());
    resizeObserver.observe(stage);

    function layout() {
      if (!dialog.open) return;
      for (const button of root.querySelectorAll("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
      for (const button of root.querySelectorAll("[data-width]")) button.setAttribute("aria-pressed", String(button.dataset.width === state.width));
      stage.dataset.mode = state.mode;

      const gap = 12;
      const stageWidth = stage.clientWidth;
      const stageHeight = stage.clientHeight;
      const paneWidth = state.mode === "side" ? (stageWidth - gap) / 2 : stageWidth;
      const targetWidth = state.width === "fit" ? paneWidth : Number(state.width);
      const scale = Math.min(1, paneWidth / targetWidth);
      const offsetX = Math.max(0, (paneWidth - targetWidth * scale) / 2);

      for (const side of ["before", "after"]) {
        const pane = panes[side];
        const frame = frames[side];
        pane.hidden = !(state.mode === "side" || state.mode === "swipe" || state.mode === side);
        pane.style.width = `${paneWidth}px`;
        pane.style.left = state.mode === "side" && side === "after" ? `${paneWidth + gap}px` : "0px";
        frame.style.width = `${targetWidth}px`;
        frame.style.height = `${stageHeight / scale}px`;
        frame.style.transform = `translateX(${offsetX}px) scale(${scale})`;
      }

      const swipe = state.mode === "swipe";
      panes.after.style.clipPath = swipe ? `inset(0 0 0 ${state.swipe}%)` : "";
      handle.hidden = !swipe;
      handle.style.left = `${(paneWidth * state.swipe) / 100}px`;
      handle.setAttribute("aria-valuenow", String(Math.round(state.swipe)));
      $(".scale-note").textContent = scale < 1 ? `${targetWidth}px shown at ${Math.round(scale * 100)}%` : "";
    }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function html(currentRole) {
    const b = escapeHtml(labels.before);
    const a = escapeHtml(labels.after);
    const afterDetail = escapeHtml(labels.afterDetail);
    const other = currentRole === "after" ? b : a;
    return `
      <div class="pill" popover="manual" role="group" aria-label="Before and after compare">
        <button type="button" class="dot" aria-label="Collapse or expand compare pill" title="Collapse / expand"></button>
        <span class="label"><strong>${currentRole === "after" ? a : b}</strong> · <span class="detail">${currentRole === "after" ? afterDetail : "base"}</span></span>
        <button type="button" class="btn open-other">${other} ↗</button>
        ${currentRole === "after" ? `<button type="button" class="btn primary open-compare" title="Alt+Shift+C">Compare</button>` : ""}
      </div>
      <dialog aria-label="Before and after compare">
        <div class="toolbar">
          <input class="path" aria-label="Route" spellcheck="false" />
          <div class="seg" role="group" aria-label="View">
            <button type="button" data-mode="side">Side by side</button>
            <button type="button" data-mode="swipe">Swipe</button>
            <button type="button" data-mode="before">${b}</button>
            <button type="button" data-mode="after">${a}</button>
          </div>
          <div class="seg" role="group" aria-label="Viewport width">
            <button type="button" data-width="fit">Fit</button>
            ${widths.map((w) => `<button type="button" data-width="${Number(w)}">${Number(w)}</button>`).join("")}
          </div>
          <label class="check"><input type="checkbox" class="sync" checked /> Sync scroll &amp; route</label>
          <label class="check" title="Clicks, typing and Esc/Enter/arrow keys on one side are repeated on the other"><input type="checkbox" class="mirror" checked /> Mirror actions</label>
          <span class="mirror-status" role="status" aria-live="polite"></span>
          <span class="scale-note"></span>
          <span class="spacer"></span>
          <button type="button" class="btn reload">Reload</button>
          <button type="button" class="btn open-before">Open ${b.toLowerCase()} ↗</button>
          <button type="button" class="btn close" aria-label="Close compare (Esc)">✕</button>
        </div>
        <div class="stage" data-mode="side">
          <div class="pane before">
            <span class="tag">${b} · <span class="before-ref">base</span></span>
            <iframe class="before" title="${b}"></iframe>
            <div class="offline-note">
              <strong>The “${b.toLowerCase()}” server isn’t running.</strong>
              <span>In a second terminal, run <code>npx before-after</code>. This view retries on its own.</span>
            </div>
          </div>
          <div class="pane after">
            <span class="tag">${a} · ${afterDetail}</span>
            <iframe class="after" title="${a}"></iframe>
          </div>
          <div class="handle" role="slider" tabindex="0" aria-label="Swipe position" aria-valuemin="0" aria-valuemax="100" hidden></div>
        </div>
      </dialog>`;
  }

  // Lives outside the app: system colors only, plus the configured accent.
  function css() {
    return `
      :host { all: initial; --ba-accent: ${accent.replace(/[;{}<>]/g, "")}; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, sans-serif; }
      .pill {
        inset: auto auto 16px 50%; translate: -50% 0; margin: 0;
        display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 10px;
        border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); border-radius: 999px;
        background: Canvas; color: CanvasText; font-size: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,.09);
      }
      .pill.no-popover { position: fixed; z-index: 2147483000; }
      .pill.collapsed { padding: 6px; }
      .pill.collapsed > :not(.dot) { display: none; }
      .dot { width: 12px; height: 12px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; background: var(--ba-accent); }
      .label { white-space: nowrap; }
      .btn, .seg button {
        font: inherit; font-size: 12px; cursor: pointer; padding: 5px 10px; border-radius: 999px;
        border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); background: Canvas; color: CanvasText;
      }
      .btn:hover, .seg button:hover { background: color-mix(in srgb, CanvasText 6%, Canvas); }
      .btn.primary { background: var(--ba-accent); border-color: transparent; color: white; }
      :is(.btn, .seg button, .dot, .handle, input):focus-visible { outline: 2px solid var(--ba-accent); outline-offset: 2px; }
      dialog {
        width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0;
        display: none; flex-direction: column; background: color-mix(in srgb, CanvasText 6%, Canvas); color: CanvasText;
      }
      dialog[open] { display: flex; }
      dialog::backdrop { background: rgba(0,0,0,.4); }
      .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; background: Canvas;
        border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); font-size: 12px; }
      .path { font: 12px ui-monospace, monospace; padding: 6px 10px; min-width: 220px; border-radius: 8px;
        border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); background: Canvas; color: CanvasText; }
      .seg { display: inline-flex; gap: 0; }
      .seg button { border-radius: 0; margin-left: -1px; }
      .seg button:first-child { border-radius: 999px 0 0 999px; margin-left: 0; }
      .seg button:last-child { border-radius: 0 999px 999px 0; }
      .seg button[aria-pressed="true"] { background: CanvasText; color: Canvas; border-color: CanvasText; }
      .check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
      .mirror-status { font-size: 12px; color: color-mix(in srgb, CanvasText 60%, transparent); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mirror-status[data-miss="1"] { color: #c8222b; }
      .scale-note { opacity: .65; }
      .spacer { flex: 1; }
      .stage { position: relative; flex: 1; margin: 12px; min-height: 0; }
      .pane { position: absolute; top: 0; bottom: 0; overflow: hidden; background: Canvas; border-radius: 8px;
        outline: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
      .pane[hidden] { display: none; }
      .pane iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: white; }
      .tag { position: absolute; top: 8px; z-index: 1; padding: 3px 8px; border-radius: 999px; font-size: 11px;
        background: CanvasText; color: Canvas; pointer-events: none; opacity: .85; }
      .pane.before .tag { left: 8px; }
      .pane.after .tag { right: 8px; }
      .offline-note { display: none; position: absolute; inset: 0; z-index: 2; place-content: center; gap: 6px;
        text-align: center; padding: 24px; background: Canvas; font-size: 13px; }
      .pane.offline .offline-note { display: grid; }
      code { font-family: ui-monospace, monospace; padding: 1px 5px; border-radius: 4px;
        background: color-mix(in srgb, CanvasText 8%, transparent); }
      .handle { position: absolute; top: 0; bottom: 0; width: 24px; margin-left: -12px; z-index: 3; cursor: ew-resize; touch-action: none; }
      .handle[hidden] { display: none; }
      .handle::before { content: ""; position: absolute; top: 0; bottom: 0; left: 11px; width: 2px; background: var(--ba-accent); }
      .handle::after { content: "⇆"; position: absolute; top: 50%; left: 0; width: 24px; height: 24px; translate: 0 -50%;
        display: grid; place-items: center; border-radius: 50%; font-size: 13px; color: white; background: var(--ba-accent); }
      .stage.dragging iframe { pointer-events: none; }
    `;
  }
})();
