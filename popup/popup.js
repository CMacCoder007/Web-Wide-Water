// The quick panel. Each control writes its setting to chrome.storage.local and
// every tab reacts. The only direct messages to the page are "what are you
// doing?" and "summon this now". Everything else is in the control centre.
(() => {
  const KEY = 'sea', CATALOG_KEY = 'seaCatalog';
  const DEFAULTS = { on: false, busy: 65, offSites: [], mischief: true, sky: 'auto', weather: 'auto', mate: { kind: 'none' } };
  const REGIONS = { tropical: 'Coral Shallows', open: 'The Open Blue', north: 'The Cold North', south: 'The Frozen South' };
  const $ = (id) => document.getElementById(id);
  // the three summon menus, by the kind each creature declares
  const GROUPS = { small: ['small'], medium: ['ambient'], big: ['event', 'monster'] };
  const PICKS_KEY = 'seaSummonPicks';      // the last thing chosen in each menu, kept between visits

  let settings = { ...DEFAULTS }, catalog = [], tabId = null, info = null;

  // Only ever write the keys this panel owns, on top of whatever is stored, so
  // settings made in the control centre are never lost from here.
  async function save(patch) {
    // the champion's follow switch is one field inside the champion's design: keep the rest
    if (patch.mate) patch = { ...patch, mate: { ...(settings.mate || {}), ...patch.mate } };
    settings = { ...settings, ...patch };
    render();
    try {
      const got = await chrome.storage.local.get(KEY);
      const stored = got[KEY] || {};
      if (patch.mate) patch = { ...patch, mate: { ...(stored.mate || {}), ...patch.mate } };
      await chrome.storage.local.set({ [KEY]: { ...stored, ...patch } });
    } catch (e) { /* the extension was reloaded: this panel is stale, and closing it fixes that */ }
  }

  const picks = () => { try { return JSON.parse(localStorage.getItem(PICKS_KEY)) || {}; } catch (e) { return {}; } };
  const remember = (group, id) => { try { localStorage.setItem(PICKS_KEY, JSON.stringify({ ...picks(), [group]: id })); } catch (e) { /* not kept */ } };

  async function ask(message) {
    if (tabId == null) return null;
    try { return await chrome.tabs.sendMessage(tabId, message); } catch (e) { return null; }
  }

  function showNow() {
    const s = info && info.stats;
    $('perf').textContent = !s ? '' : s.paused ? 'resting'
      : `${(s.waterMs + s.sceneMs).toFixed(1)} ms · ${s.fps} fps${s.level ? ' · easing ' + s.level + '/3' : ''}`;
    if (!(info && info.active)) { $('now').textContent = ''; return; }
    const bits = [REGIONS[info.region] || ''];
    if (info.night > 0.6) bits.push('night'); else if (info.night > 0) bits.push('dusk');
    if (info.weather && info.weather !== 'clear') bits.push(info.weather);
    $('now').textContent = 'Now: ' + bits.filter(Boolean).join(', ');
  }

  function render() {
    const host = info && info.host;
    document.body.classList.toggle('off', !settings.on);
    $('on').checked = !!settings.on;
    $('mischief').checked = !!settings.mischief;
    $('busy').value = settings.busy; $('busy-out').textContent = settings.busy + '%';
    $('sky').value = typeof settings.sky === 'string' ? settings.sky : 'auto';
    $('weather').value = typeof settings.weather === 'string' ? settings.weather : 'auto';
    $('site-row').hidden = !host;
    $('no-page').hidden = !!info;
    if (host) { $('host').textContent = host; $('site').checked = !(settings.offSites || []).includes(host); }
    $('status').textContent = !settings.on ? 'The sea sleeps'
      : host && (settings.offSites || []).includes(host) ? 'Stilled on this site' : 'The sea is risen';
    const live = !!(info && info.active);
    for (const b of document.querySelectorAll('.summon button')) {
      b.disabled = !live;
      b.title = live ? 'Make it appear now' : 'Raise the sea on this page first';
    }
    const mate = settings.mate || {};
    $('champ-row').hidden = !mate.kind || mate.kind === 'none';
    $('follow').checked = mate.follow !== 'roam';
    showNow();
  }

  function fillSummon() {
    const chosen = picks();
    for (const row of document.querySelectorAll('.summon')) {
      const group = row.dataset.group, sel = row.querySelector('select');
      const keep = sel.value || chosen[group];
      sel.textContent = '';
      for (const c of catalog.filter((c) => GROUPS[group].includes(c.kind))) {
        const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.append(o);
      }
      if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
      row.hidden = !sel.options.length;
    }
  }

  async function summon(row) {
    const sel = row.querySelector('select'), btn = row.querySelector('button');
    if (!sel.value) return;
    remember(row.dataset.group, sel.value);
    const res = await ask({ type: 'sea:summon', id: sel.value });
    const ok = !!(res && res.ok);
    btn.textContent = ok ? 'Summoned' : 'Not now';
    btn.title = ok ? '' : 'One is already here, or the sea is not running on this page';
    btn.classList.toggle('done', ok); btn.classList.toggle('nope', !ok);
    setTimeout(() => { btn.textContent = 'Summon'; btn.classList.remove('done', 'nope'); }, 1600);
  }

  async function init() {
    const got = await chrome.storage.local.get([KEY, CATALOG_KEY]);
    settings = { ...DEFAULTS, ...(got[KEY] || {}) };
    catalog = got[CATALOG_KEY] || [];
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab ? tab.id : null;
    } catch (e) { tabId = null; }
    info = await ask({ type: 'sea:info' });

    $('on').addEventListener('change', (e) => save({ on: e.target.checked }));
    $('mischief').addEventListener('change', (e) => save({ mischief: e.target.checked }));
    $('busy').addEventListener('input', (e) => { $('busy-out').textContent = e.target.value + '%'; });
    $('busy').addEventListener('change', (e) => save({ busy: Number(e.target.value) }));
    $('sky').addEventListener('change', (e) => save({ sky: e.target.value }));
    $('weather').addEventListener('change', (e) => save({ weather: e.target.value }));
    $('site').addEventListener('change', (e) => {
      const host = info && info.host;
      if (!host) return;
      const offSites = (settings.offSites || []).filter((h) => h !== host);
      if (!e.target.checked) offSites.push(host);
      save({ offSites });
    });
    for (const row of document.querySelectorAll('.summon')) {
      row.querySelector('button').addEventListener('click', () => summon(row));
      row.querySelector('select').addEventListener('change', (e) => remember(row.dataset.group, e.target.value));
    }
    $('follow').addEventListener('change', (e) => save({ mate: { follow: e.target.checked ? 'cursor' : 'roam' } }));
    $('open').addEventListener('click', () => chrome.runtime.openOptionsPage());

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[KEY]) { settings = { ...DEFAULTS, ...(changes[KEY].newValue || {}) }; render(); }
      if (changes[CATALOG_KEY]) { catalog = changes[CATALOG_KEY].newValue || []; fillSummon(); }
    });

    fillSummon(); render();
    setInterval(async () => {
      const was = info && info.active;
      info = await ask({ type: 'sea:info' });
      if ((info && info.active) !== was) render(); else showNow();
    }, 1000);
  }

  init();
})();
