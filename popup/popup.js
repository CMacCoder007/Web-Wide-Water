// The quick panel. Each control writes its setting to chrome.storage.local and
// every tab reacts. The only direct messages to the page are "what are you
// doing?" and "summon this now". Everything else is in the control centre.
(() => {
  const KEY = 'sea', CATALOG_KEY = 'seaCatalog';
  const DEFAULTS = { on: false, busy: 65, offSites: [], mischief: true, sky: 'auto', weather: 'auto' };
  const REGIONS = { tropical: 'Coral Shallows', open: 'The Open Blue', north: 'The Cold North', south: 'The Frozen South' };
  const $ = (id) => document.getElementById(id);

  let settings = { ...DEFAULTS }, catalog = [], tabId = null, info = null;

  // Only ever write the keys this panel owns, on top of whatever is stored, so
  // settings made in the control centre are never lost from here.
  async function save(patch) {
    settings = { ...settings, ...patch };
    const got = await chrome.storage.local.get(KEY);
    await chrome.storage.local.set({ [KEY]: { ...(got[KEY] || {}), ...patch } });
    render();
  }

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
    $('summon').disabled = !(info && info.active);
    $('summon').title = $('summon').disabled ? 'Raise the sea on this page first' : 'Make it appear now';
    showNow();
  }

  function fillSummon() {
    const sel = $('who'), keep = sel.value;
    sel.textContent = '';
    for (const c of catalog) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.append(o); }
    if (keep) sel.value = keep;
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
    $('summon').addEventListener('click', () => ask({ type: 'sea:summon', id: $('who').value }));
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
