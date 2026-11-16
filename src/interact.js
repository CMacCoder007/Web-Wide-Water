// How the water answers you: a ripple where you click, a gentle slosh when you
// scroll, a soft wake behind the cursor. All of them only listen; clicks and scrolling reach the page exactly as normal.
// Each can be switched off in the popup.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { clamp } = Sea.util;

  let lastY = 0, lastSlosh = 0;

  function onDown(e) {
    if (!Sea.settings.click || e.button !== 0) return;
    Sea.water.splash(e.clientX, e.clientY, 22, -1.5);
    Sea.scene.emit({ k: 'ring', x: e.clientX, y: e.clientY, life: 30, size: 3, grow: 26 });
  }

  // The cursor drags through the water (the same method as Liquid Life's wake):
  // every movement is filled in with dips along the whole path travelled, so the
  // wake is one smooth line however fast the mouse goes, and grows with speed.
  const WAKE = 0.45;
  let px = null, py = 0;
  function onMove(e) {
    if (!Sea.settings.wake) { px = null; return; }
    const x = e.clientX, y = e.clientY;
    if (px === null) { px = x; py = y; return; }
    const dx = x - px, dy = y - py, dist = Math.hypot(dx, dy);
    if (dist < 3) return;
    const power = Math.min(1.6, 0.25 + dist * 0.03) * WAKE * (Sea.settings.wakeStrength / 100);
    if (!power) return;
    const steps = Math.min(12, Math.ceil(dist / 14));
    for (let s = 1; s <= steps; s++) {
      Sea.water.splash(px + (dx * s) / steps, py + (dy * s) / steps, 22, -power / Math.sqrt(steps));
    }
    px = x; py = y;
  }

  function onScroll() {
    const y = window.scrollY, dy = y - lastY;
    lastY = y;
    if (!Sea.settings.scroll || !dy) return;
    const now = performance.now();
    if (now - lastSlosh < 110) return;
    lastSlosh = now;
    // the water lags behind the page: a soft wave front from the edge the content came from
    const s = clamp(dy * 0.012, -1, 1);
    Sea.water.band(dy > 0 ? innerHeight * 0.9 : innerHeight * 0.1, 70, s);
  }

  Sea.feature({
    id: 'interact',
    start() {
      lastY = window.scrollY;
      window.addEventListener('pointerdown', onDown, { passive: true, capture: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('pointermove', onMove, { passive: true, capture: true });
    },
    stop() {
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove, { capture: true });
      px = null;
    }
  });
})();
