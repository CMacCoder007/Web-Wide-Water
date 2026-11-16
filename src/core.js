// Web-Wide-Water core: settings, the on/off switch, the plug-in registries and
// shared helpers. Everything else hangs off the one global, `Sea`.
//
// Settings live in chrome.storage.local under one key and are the single source
// of truth: the popup writes them, every tab reacts to the change.
//
//   Sea.settings                 current settings (read only; change with Sea.set)
//   Sea.set({ busy: 40 })        save a change (applies in every tab)
//   Sea.active                   true when the sea is running on this page
//   Sea.feature({ id, start, stop, onSettings })   a system that runs while the sea is on
//   Sea.creature({ id, name, kind, weight, max, cooldown, spawn })   see docs/ADDING_A_CREATURE.md
//   Sea.panic()                  everything off (also: press Esc three times quickly)
//
// Rules this file keeps: inline styles only (no <style> tags, no innerHTML) so
// strict sites can't block it; nothing we add accepts the pointer; switching
// off removes every element we created.
(() => {
  if (window.Sea) return;
  const Sea = (window.Sea = {});

  const KEY = 'sea';
  const CATALOG_KEY = 'seaCatalog';
  const DEFAULTS = {
    on: false,
    distortion: 35,   // 0..100, how far the water bends the page
    busy: 65,         // 0..100, how often things turn up
    offSites: [],     // hostnames where the sea stays off
    off: [],          // ids of creatures that are switched off
    click: true,      // clicks make a ripple
    scroll: true,     // scrolling sloshes the water
    cursor: true,     // creatures notice the cursor
    wake: true,       // the cursor leaves a soft wake
    mischief: true,   // monsters may take the cursor, ships and monsters may damage the text (it grows back)
    region: 'auto',   // 'auto' drifts between regions, or 'tropical' | 'open' | 'north' pins one
    cast: {},         // the user's edits to who lives where: { north: { seal: false, turtle: true } }
    pauseBlur: true,  // also pause when the window has been in the background for 20 seconds
    mate: { kind: 'none' },   // your own ship or animals: see src/sea/mate.js
    freq: {},         // how often each creature appears, as a percentage of normal: { orca: 150, kraken: 0 }
    monsters: 100,    // how often the megalodon, the kraken and sea battles turn up, % of normal
    splash: 100,      // how hard everything disturbs the water, % of normal
    wakeStrength: 100, // the cursor's wake, % of normal
    nightDark: 60,    // how dark the page gets at night, 0..100
    weatherMin: 3,    // minutes each spell of weather lasts
    regionMin: 5,     // minutes before the sea drifts to the next region
    sky: 'auto',     // 'auto' follows the computer's clock, or hold it at 'day' | 'dusk' | 'night'
    weather: 'auto'   // 'auto' lets weather pass through by chance, or call up 'clear' | 'swell' | 'rain' | 'fog' | 'storm'
  };

  let settings = { ...DEFAULTS };
  let active = false;
  let layerEl = null;
  const features = [];
  const running = new Set();
  const creatures = [];

  const util = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    rand: (a, b) => a + Math.random() * (b - a),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    lerp: (a, b, t) => a + (b - a) * t,
    // shortest signed angle from one heading to another
    turn(from, to) {
      let d = (to - from) % 6.283185;
      if (d > Math.PI) d -= 6.283185; else if (d < -Math.PI) d += 6.283185;
      return d;
    },
    // Everything we create is tagged data-sea.
    el(tag, style = {}, text) {
      const n = document.createElement(tag);
      n.setAttribute('data-sea', '');
      Object.assign(n.style, style);
      if (text != null) n.textContent = text;
      return n;
    },
    isOurs(node) {
      const e = node && (node.nodeType === 1 ? node : node.parentElement);
      return !!(e && e.closest && e.closest('[data-sea]'));
    },
    // Full-viewport overlay above the water that the scene draws into.
    layer() {
      if (!layerEl || !layerEl.isConnected) {
        layerEl = util.el('div', {
          position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483646',
          overflow: 'hidden', margin: '0', padding: '0'
        });
        layerEl.setAttribute('aria-hidden', 'true');
        document.documentElement.appendChild(layerEl);
      }
      return layerEl;
    }
  };

  // Animation clock. Tests can swap in a timer, because requestAnimationFrame
  // stalls when the window is in the background.
  const timer = window.__seaClock === 'timer';
  Sea.raf = timer ? (fn) => setTimeout(() => fn(performance.now()), 16) : (fn) => requestAnimationFrame(fn);
  Sea.caf = timer ? (id) => clearTimeout(id) : (id) => cancelAnimationFrame(id);

  // The character preview in the control centre runs this same code in a little
  // frame of its own, with settings held in memory so it never touches the real ones.
  const store = window.__seaPreview ? null : (() => { try { return chrome.storage.local || null; } catch (e) { return null; } })();

  function normalise(v) {
    const s = { ...DEFAULTS, ...(v || {}) };
    s.distortion = util.clamp(Number(s.distortion) || 0, 0, 100);
    s.busy = util.clamp(Number(s.busy) || 0, 0, 100);
    s.offSites = Array.isArray(s.offSites) ? s.offSites : [];
    s.off = Array.isArray(s.off) ? s.off : [];
    s.cast = s.cast && typeof s.cast === 'object' ? s.cast : {};
    s.mate = s.mate && typeof s.mate === 'object' ? s.mate : { kind: 'none' };
    s.freq = s.freq && typeof s.freq === 'object' ? s.freq : {};
    for (const [key, lo, hi] of [['monsters', 0, 300], ['splash', 0, 200], ['wakeStrength', 0, 200], ['nightDark', 0, 100], ['weatherMin', 1, 30], ['regionMin', 1, 60]]) {
      const v = Number(s[key]);
      s[key] = util.clamp(Number.isFinite(v) ? v : DEFAULTS[key], lo, hi);
    }
    delete s.floor; delete s.treasure; delete s.sound; delete s.volume;   // features that were removed
    // settings saved by an earlier version used on/off switches for these two
    if (s.weather === true) s.weather = 'auto'; else if (s.weather === false) s.weather = 'clear';
    if (s.daynight === false && s.sky === 'auto') s.sky = 'day';
    delete s.daynight;
    return s;
  }

  function apply(next) {
    settings = normalise(next);
    const want = settings.on && !settings.offSites.includes(location.hostname);
    if (want) {
      Sea.water.start(); Sea.refract.start();   // both do nothing if already started
      Sea.water.power = 4 + settings.distortion * 0.6;
      Sea.water.gain = settings.splash / 100;
    }
    for (const f of features) {
      try {
        if (want && !running.has(f.id)) { f.start && f.start(); running.add(f.id); }
        else if (!want && running.has(f.id)) { f.stop && f.stop(); running.delete(f.id); }
        if (want && f.onSettings) f.onSettings(settings);
      } catch (e) { console.warn('[Web-Wide-Water] feature failed:', f.id, e); }
    }
    if (!want && active) {
      Sea.refract.stop(); Sea.water.stop();
      if (layerEl) { layerEl.remove(); layerEl = null; }
    }
    active = want;
  }

  function set(patch) {
    const next = normalise({ ...settings, ...patch });
    if (store) {
      try { store.set({ [KEY]: next }); return; }   // onChanged applies it in every tab
      catch (e) { /* the extension was reloaded under us: apply here only */ }
    }
    apply(next);
  }

  // ---------- pausing ----------
  // The sea stops completely (no drawing, no simulation, no spawning) whenever
  // nobody can be looking at it: the tab is hidden, the window is minimised or
  // covered, or (optionally) the window has been in the background for a while.
  // It carries on from where it was when you come back.
  const BLUR_GRACE_MS = 20000;   // long enough to use the popup or glance at another window
  let paused = false, away = false, blurTimer = 0;
  function checkPause() {
    const p = document.hidden || (away && settings.pauseBlur);
    if (p === paused) return;
    paused = p;
    if (!p && active) { Sea.water.resume(); Sea.scene.resume(); }
  }
  function onBlur() { clearTimeout(blurTimer); blurTimer = setTimeout(() => { away = true; checkPause(); }, BLUR_GRACE_MS); }
  function onFocus() { clearTimeout(blurTimer); away = false; checkPause(); }

  // Panic: Esc three times within about a second. We only listen; the key still
  // reaches the page as normal.
  let escTimes = [];
  function onKey(e) {
    if (e.key !== 'Escape' || !active) return;
    const now = performance.now();
    escTimes = escTimes.filter((t) => now - t < 1200).concat(now);
    if (escTimes.length >= 3) { escTimes = []; set({ on: false }); }
  }

  Sea.util = util;
  Sea.DEFAULTS = DEFAULTS;
  Sea.set = set;
  Sea.panic = () => set({ on: false });
  Sea.feature = (f) => { features.push(f); };
  Sea.creature = (c) => { creatures.push(c); };
  Sea.creatures = creatures;
  Sea.enabled = (id) => !settings.off.includes(id);
  Object.defineProperty(Sea, 'settings', { get: () => settings });
  Object.defineProperty(Sea, 'active', { get: () => active });
  Object.defineProperty(Sea, 'paused', { get: () => paused });

  Sea.stats = () => ({
    waterMs: +Sea.water.stats.ms.toFixed(2),
    sceneMs: +Sea.scene.stats.ms.toFixed(2),
    fps: Math.round(Sea.scene.stats.fps || Sea.water.stats.fps),
    faces: Sea.scene.stats.faces,
    awake: Sea.water.stats.awake,
    level: Sea.perf ? Sea.perf.level : 0,     // 0 = full detail .. 3 = shedding load (see world.js)
    paused
  });

  Sea.boot = async () => {
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', checkPause);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    let saved = window.__seaDemo || null;   // the demo page has no storage
    if (store) {
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue);
        });
        chrome.runtime.onMessage.addListener((msg, sender, reply) => {
          if (!msg) return;
          if (msg.type === 'sea:info') reply({ host: location.hostname, active, stats: active ? Sea.stats() : null, region: Sea.eco.region(), weather: Sea.eco.weather(), night: Sea.eco.night() });
          else if (msg.type === 'sea:summon') reply({ ok: active && Sea.world.summon(msg.id) });
        });
        const got = await store.get([KEY, CATALOG_KEY]);
        saved = got[KEY];
        // Tell the popup which creatures exist, so a new creature file shows up there by itself.
        const catalog = creatures.map((c) => ({ id: c.id, name: c.name || c.id, kind: c.kind || 'ambient', regions: c.regions || Object.keys(Sea.eco.REGIONS) }));
        if (JSON.stringify(catalog) !== JSON.stringify(got[CATALOG_KEY] || null)) store.set({ [CATALOG_KEY]: catalog });
      } catch (e) { /* not running as an extension */ }
    }
    apply(saved);
  };
})();
