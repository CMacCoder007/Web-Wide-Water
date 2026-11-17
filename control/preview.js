// Runs the real sea inside the preview frame: the same scripts the pages get,
// in the same order, but with settings kept in memory (see __seaPreview in
// src/core.js) so nothing here reaches the user's real settings.
(async () => {
  window.__seaPreview = true;
  window.__seaDemo = {
    on: true, busy: 0, mischief: false, sky: 'day', weather: 'clear', region: 'open', pauseBlur: false,
    distortion: 45, mate: { kind: 'none' }
  };
  const base = (path) => (window.chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL(path) : '../' + path);
  let list;
  try { list = chrome.runtime.getManifest().content_scripts[0].js; }
  catch (e) { list = (await (await fetch('../manifest.json')).json()).content_scripts[0].js; }   // opened outside the extension, for testing
  for (const src of list) {
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = base(src); s.onload = ok; s.onerror = fail;
      document.head.append(s);
    });
  }
  // only the champion: no wild creatures wander into the picture
  Sea.set({ off: Sea.creatures.map((c) => c.id) });

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || e.data.type !== 'sea:draft') return;
    Sea.set({ mate: e.data.mate });
  });
  window.parent.postMessage({ type: 'sea:ready' }, '*');
})();
