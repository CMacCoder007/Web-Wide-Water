// The control centre. Every control with data-key writes one setting to
// chrome.storage.local the moment it changes, and every tab's sea reacts.
// The champion is different: its controls (data-mate) only edit a draft, shown
// in the live preview, and nothing is written until Save is pressed.
(() => {
  const KEY = 'sea', CATALOG_KEY = 'seaCatalog';
  // keep in step with DEFAULTS in src/core.js
  const DEFAULTS = {
    on: false, distortion: 35, busy: 65, offSites: [], off: [], click: true, scroll: true, cursor: true, wake: true,
    mischief: true, pauseBlur: true, mate: { kind: 'none' }, freq: {}, monsters: 100, splash: 100, wakeStrength: 100,
    nightDark: 60, weatherMin: 3, regionMin: 5, region: 'auto', cast: {}, sky: 'auto', weather: 'auto', perf: 'auto'
  };
  // keep in step with DEFAULTS in src/sea/mate.js
  const MATE = { kind: 'none', name: '', size: 100, count: 1, follow: 'cursor', hull: '#5a3a22', trim: '#c9a227', sail: '#f3ead2', flag: '#b3202a', masts: 2, emblem: 'none', stripes: false, guns: true, c1: '', c2: '', c3: '' };
  // each animal's own colours, and what the three colours paint
  const ANIMALS = {
    orca: { colours: ['#1a1c24', '#eef1f4', '#808894'], labels: ['Back', 'Belly', 'Saddle'], many: 'How many orcas' },
    dolphin: { colours: ['#5c6c80', '#8896a6', '#dee4ea'], labels: ['Back', 'Sides', 'Belly'], many: 'How many dolphins' },
    turtle: { colours: ['#546c3e', '#92804a', '#96a260'], labels: ['Shell', 'Shell rim', 'Skin'], many: 'How many turtles' }
  };
  const PRESETS = {
    calm: { mischief: false, busy: 35, monsters: 0, weather: 'clear', splash: 70, distortion: 25 },
    living: { mischief: true, busy: 65, monsters: 100, weather: 'auto', sky: 'auto', splash: 100, distortion: 35 },
    wrath: { mischief: true, busy: 90, monsters: 300, weather: 'storm', splash: 140, distortion: 50 }
  };
  const REGIONS = [['tropical', 'C', 'Coral Shallows'], ['open', 'O', 'The Open Blue'], ['north', 'N', 'The Cold North'], ['south', 'S', 'The Frozen South']];
  const $ = (id) => document.getElementById(id);
  const all = (sel) => Array.from(document.querySelectorAll(sel));
  // Outside the extension (opened as a plain page for testing) settings are just kept in memory.
  const real = !!(window.chrome && chrome.storage && chrome.storage.local);
  const mem = {};
  const store = real ? chrome.storage.local : { get: async () => ({ ...mem }), set: async (o) => { Object.assign(mem, o); } };

  let settings = { ...DEFAULTS }, catalog = [], draft = { ...MATE }, previewReady = false;

  const save = (patch) => {
    settings = { ...settings, ...patch };
    store.set({ [KEY]: settings });
    render();
  };

  // read a control's value in the right type
  const valueOf = (el) => (el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value);
  function put(el, v) {
    if (document.activeElement === el && el.type !== 'checkbox') return;     // don't fight the user's hand
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  function showOutput(el) {
    const out = el.closest('.dial, .creature') && el.closest('.dial, .creature').querySelector('output');
    if (out) out.textContent = el.value + (el.dataset.unit || '');
  }

  // ---------- creatures ----------
  function renderCreatures() {
    const box = $('creatures');
    box.textContent = '';
    $('no-creatures').hidden = catalog.length > 0;
    for (const c of catalog) {
      const on = !settings.off.includes(c.id);
      const row = document.createElement('div');
      row.className = 'creature' + (on ? '' : ' off');

      const sw = document.createElement('label');
      sw.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.checked = on; input.setAttribute('aria-label', c.name);
      input.addEventListener('change', () => {
        const off = settings.off.filter((id) => id !== c.id);
        if (!input.checked) off.push(c.id);
        save({ off });
      });
      sw.append(input, document.createElement('span'));

      const name = document.createElement('span');
      name.className = 'name';
      const b = document.createElement('b'); b.textContent = c.name;
      const kind = document.createElement('small');
      kind.textContent = { small: 'small life', ambient: 'wildlife', event: 'great event', monster: 'monster' }[c.kind] || c.kind;
      name.append(b, kind);

      const freq = document.createElement('input');
      freq.type = 'range'; freq.min = 0; freq.max = 300; freq.step = 10; freq.dataset.unit = '%';
      freq.value = settings.freq[c.id] == null ? 100 : settings.freq[c.id];
      freq.setAttribute('aria-label', `How often ${c.name} appears`);
      const out = document.createElement('output');
      out.textContent = freq.value + '%';
      freq.addEventListener('input', () => { out.textContent = freq.value + '%'; });
      freq.addEventListener('change', () => save({ freq: { ...settings.freq, [c.id]: Number(freq.value) } }));

      const waters = document.createElement('span');
      waters.className = 'waters';
      for (const [reg, letter, full] of REGIONS) {
        const mine = (settings.cast || {})[reg] || {};
        const lives = c.id in mine ? !!mine[c.id] : !c.regions || c.regions.includes(reg);
        const chip = document.createElement('button');
        chip.className = 'chip' + (lives ? ' on' : '');
        chip.textContent = letter;
        chip.title = `${lives ? 'Lives in' : 'Not in'} ${full}. Click to change.`;
        chip.addEventListener('click', () => {
          const cast = { ...(settings.cast || {}) };
          cast[reg] = { ...(cast[reg] || {}), [c.id]: !lives };
          save({ cast });
        });
        waters.append(chip);
      }
      row.append(sw, name, freq, out, waters);
      box.append(row);
    }
  }

  function renderSites() {
    const box = $('sites');
    box.textContent = '';
    if (!settings.offSites.length) { const p = document.createElement('span'); p.className = 'hint'; p.textContent = 'None. The sea runs everywhere.'; box.append(p); return; }
    for (const host of settings.offSites) {
      const b = document.createElement('button');
      b.className = 'quiet'; b.textContent = host + '  ×'; b.title = 'Let the sea return to ' + host;
      b.addEventListener('click', () => save({ offSites: settings.offSites.filter((h) => h !== host) }));
      box.append(b);
    }
  }

  function render() {
    for (const el of all('[data-key]')) { put(el, settings[el.dataset.key]); showOutput(el); }
    $('master-word').textContent = settings.on ? 'The sea is risen' : 'The sea sleeps';
    renderCreatures(); renderSites();
  }

  // ---------- the champion ----------
  const saved = () => ({ ...MATE, ...(settings.mate || {}) });
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved());

  function sendDraft() {
    if (previewReady) $('preview').contentWindow.postMessage({ type: 'sea:draft', mate: draft }, '*');
  }
  let sendTimer = 0;
  const sendSoon = () => { clearTimeout(sendTimer); sendTimer = setTimeout(sendDraft, 220); };

  function renderMate() {
    const animal = ANIMALS[draft.kind];
    $('m-common').hidden = draft.kind === 'none';
    $('m-ship').hidden = draft.kind !== 'ship';
    $('m-animal').hidden = !animal;
    const count = document.querySelector('[data-mate="count"]');
    count.max = draft.kind === 'ship' ? 3 : 7;
    if (Number(draft.count) > Number(count.max)) draft.count = Number(count.max);
    $('count-label').textContent = draft.kind === 'ship' ? 'How many ships' : animal ? animal.many : 'How many';
    if (animal) animal.labels.forEach((text, i) => { $('c' + (i + 1) + '-label').textContent = text; });
    for (const el of all('[data-mate]')) {
      let v = draft[el.dataset.mate];
      // an animal with no colours chosen shows its natural ones
      if (animal && /^c[123]$/.test(el.dataset.mate) && !v) v = animal.colours[Number(el.dataset.mate[1]) - 1];
      put(el, v); showOutput(el);
    }
    const d = dirty();
    $('save').disabled = $('revert').disabled = !d;
    $('dirty').textContent = d ? 'Unsaved changes' : draft.kind === 'none' ? 'You command nothing yet.' : 'Saved. This is what sails your pages.';
  }

  function onMateInput(el) {
    const f = el.dataset.mate;
    let v = valueOf(el);
    if (f === 'masts') v = Number(v);
    draft = { ...draft, [f]: v };
    if (f === 'kind') {
      // a different animal starts in its own natural colours
      const a = ANIMALS[v];
      draft.c1 = a ? a.colours[0] : ''; draft.c2 = a ? a.colours[1] : ''; draft.c3 = a ? a.colours[2] : '';
      draft.count = Math.min(Number(draft.count) || 1, v === 'ship' ? 3 : 7);
    }
    if (/^c[123]$/.test(f)) {
      // choosing one colour fixes the other two as shown, so the whole scheme is yours
      const a = ANIMALS[draft.kind];
      if (a) for (let i = 0; i < 3; i++) if (!draft['c' + (i + 1)]) draft['c' + (i + 1)] = a.colours[i];
    }
    renderMate(); sendSoon();
  }

  // ---------- start ----------
  async function init() {
    const got = await store.get([KEY, CATALOG_KEY]);
    settings = { ...DEFAULTS, ...(got[KEY] || {}) };
    settings.freq = settings.freq || {}; settings.off = settings.off || []; settings.offSites = settings.offSites || [];
    catalog = got[CATALOG_KEY] || [];
    draft = saved();

    for (const el of all('[data-key]')) {
      if (el.type === 'range') el.addEventListener('input', () => showOutput(el));
      el.addEventListener('change', () => save({ [el.dataset.key]: valueOf(el) }));
    }
    for (const el of all('[data-mate]')) {
      el.addEventListener(el.type === 'text' || el.type === 'range' || el.type === 'color' ? 'input' : 'change', () => onMateInput(el));
    }
    $('natural').addEventListener('click', () => {
      const a = ANIMALS[draft.kind];
      if (a) { draft = { ...draft, c1: a.colours[0], c2: a.colours[1], c3: a.colours[2] }; renderMate(); sendSoon(); }
    });
    $('save').addEventListener('click', () => { save({ mate: { ...draft } }); renderMate(); });
    $('revert').addEventListener('click', () => { draft = saved(); renderMate(); sendDraft(); });
    $('keys').addEventListener('click', (e) => {
      e.preventDefault();
      try { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); } catch (err) { /* only inside the extension */ }
    });

    for (const b of all('[data-preset]')) b.addEventListener('click', () => save(PRESETS[b.dataset.preset]));
    $('reset').addEventListener('click', () => {
      if (confirm('Restore every setting to how it came? Your champion and the list of stilled websites are kept.')) {
        save({ ...DEFAULTS, on: settings.on, mate: settings.mate, offSites: settings.offSites });
      }
    });

    for (const b of all('#nav button')) {
      b.addEventListener('click', () => {
        for (const o of all('#nav button')) o.classList.toggle('on', o === b);
        for (const t of all('.tab')) t.hidden = t.id !== 'tab-' + b.dataset.tab;
        if (b.dataset.tab === 'champion') sendDraft();
        history.replaceState(null, '', '#' + b.dataset.tab);
      });
    }
    const first = document.querySelector(`#nav button[data-tab="${location.hash.slice(1)}"]`);
    if (first) first.click();

    window.addEventListener('message', (e) => {
      if (e.source === $('preview').contentWindow && e.data && e.data.type === 'sea:ready') { previewReady = true; sendDraft(); }
    });
    // leaving with unsaved changes to the champion asks first
    window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

    if (real) chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[KEY]) {
        // A change from elsewhere (the hotkey, the quick panel). Follow takes effect at
        // once, so it is never shown as an unsaved change; nor is anything else if the
        // champion had no unsaved edits.
        const clean = !dirty();
        settings = { ...DEFAULTS, ...(changes[KEY].newValue || {}) };
        draft = clean ? saved() : { ...draft, follow: saved().follow };
        render(); renderMate(); sendSoon();
      }
      if (changes[CATALOG_KEY]) { catalog = changes[CATALOG_KEY].newValue || []; renderCreatures(); }
    });

    render(); renderMate();
  }

  init();
})();
