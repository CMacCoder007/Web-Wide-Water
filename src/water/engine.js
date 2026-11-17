// Water engine: one heightfield wave simulation covering the viewport.
// Everything else (refraction, shine, creatures) reads from or splashes into this.
//
//   Sea.water.splash(x, y, radius, strength)   x/y in viewport px; negative strength pushes down
//   Sea.water.band(y, thickness, strength)     a wave front across the full width
//   Sea.water.slopeAt(x, y)                    { x, y } surface slope under a viewport point
//   Sea.water.heightAt(x, y)                   surface height under a viewport point
//   Sea.water.calm(x, y, radius, keep)         flatten the water around a point
//   Sea.water.onFrame(fn)                      fn({ h, W, H, cell }) after every sim step
//   Sea.water.power                            px of refraction at full slope (set from the distortion setting)
//   Sea.water.start() / stop()
//
// The loop sleeps when the water is flat, and never steps more than about 60
// times a second, so fast monitors don't double the cost or the wave speed.
(() => {
  const Sea = window.Sea;
  if (!Sea || Sea.water) return;

  const CELL = 8;          // px per sim cell
  const DAMP = 0.974;      // energy kept per step: lower = ripples die away sooner
  const SHORE = 6;         // cells at each edge that soak waves up, so they don't bounce back off the window edge
  const IDLE_FRAMES = 45;  // calm frames before the loop sleeps
  const MIN_STEP_MS = 14;

  let W = 0, H = 0, cur, prev;
  let raf = 0, running = false, calm = 0;
  const frameFns = new Set();
  const sleepFns = new Set();
  const stats = { ms: 0, fps: 0, awake: false };
  let lastT = 0;

  function resize() {
    W = Math.max(16, Math.ceil(innerWidth / CELL) + 2);
    H = Math.max(16, Math.ceil(innerHeight / CELL) + 2);
    cur = new Float32Array(W * H);
    prev = new Float32Array(W * H);
  }

  function splash(x, y, radius = 30, strength = 1) {
    if (!running) return;
    strength *= Sea.water.gain;
    const cx = x / CELL + 1, cy = y / CELL + 1, r = Math.max(1, radius / CELL);
    const x0 = Math.max(1, Math.floor(cx - r * 2)), x1 = Math.min(W - 2, Math.ceil(cx + r * 2));
    const y0 = Math.max(1, Math.floor(cy - r * 2)), y1 = Math.min(H - 2, Math.ceil(cy + r * 2));
    if (x0 > x1 || y0 > y1 || !strength) return;   // off-screen, or splashes turned right down
    const inv = 1 / (r * r);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const d2 = ((i - cx) * (i - cx) + (j - cy) * (j - cy)) * inv;
        cur[j * W + i] += strength * Math.exp(-d2 * 2);
      }
    }
    wake();
  }

  function band(y, thickness = 40, strength = 1) {
    if (!running) return;
    const cy = y / CELL + 1, r = Math.max(1, thickness / CELL);
    const y0 = Math.max(1, Math.floor(cy - r * 2)), y1 = Math.min(H - 2, Math.ceil(cy + r * 2));
    for (let j = y0; j <= y1; j++) {
      const d = (j - cy) / r, a = strength * Math.exp(-d * d * 2);
      for (let i = 1; i < W - 1; i++) cur[j * W + i] += a;
    }
    wake();
  }

  function slopeAt(x, y) {
    if (!running || !cur) return { x: 0, y: 0 };
    const i = Math.min(W - 2, Math.max(1, Math.round(x / CELL) + 1));
    const j = Math.min(H - 2, Math.max(1, Math.round(y / CELL) + 1));
    const k = j * W + i;
    return { x: cur[k + 1] - cur[k - 1], y: cur[k + W] - cur[k - W] };
  }

  function heightAt(x, y) {
    if (!running || !cur) return 0;
    const i = Math.min(W - 2, Math.max(1, Math.round(x / CELL) + 1));
    const j = Math.min(H - 2, Math.max(1, Math.round(y / CELL) + 1));
    return cur[j * W + i];
  }

  // Flatten the water around a point (keep = fraction of the wave left at the centre).
  function flatten(x, y, radius = 100, keep = 0.5) {
    if (!running || !cur) return;
    const cx = x / CELL + 1, cy = y / CELL + 1, r = Math.max(1, radius / CELL);
    const x0 = Math.max(1, Math.floor(cx - r * 1.6)), x1 = Math.min(W - 2, Math.ceil(cx + r * 1.6));
    const y0 = Math.max(1, Math.floor(cy - r * 1.6)), y1 = Math.min(H - 2, Math.ceil(cy + r * 1.6));
    const inv = 1 / (r * r);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const d2 = ((i - cx) * (i - cx) + (j - cy) * (j - cy)) * inv;
        const f = 1 - (1 - keep) * Math.exp(-d2 * 1.2);
        cur[j * W + i] *= f; prev[j * W + i] *= f;
      }
    }
  }

  function step() {
    let energy = 0;
    for (let j = 1; j < H - 1; j++) {
      let i = j * W + 1;
      for (const end = i + W - 2; i < end; i++) {
        const n = ((cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W]) * 0.5 - prev[i]) * DAMP;
        prev[i] = n;
        if (n > energy) energy = n; else if (-n > energy) energy = -n;
      }
    }
    // the shore: waves fade over the last few cells instead of reflecting
    for (let d = 1; d <= SHORE; d++) {
      const f = 0.72 + 0.28 * (d / SHORE), top = d * W, bot = (H - 1 - d) * W;
      for (let i = d; i < W - d; i++) { prev[top + i] *= f; prev[bot + i] *= f; }
      for (let j = d + 1; j < H - 1 - d; j++) { prev[j * W + d] *= f; prev[j * W + W - 1 - d] *= f; }
    }
    const t = cur; cur = prev; prev = t;
    return energy;
  }

  function loop(now) {
    if (!running || Sea.paused) { raf = 0; lastT = 0; return; }   // paused: stop dead; resume() picks it up
    if (lastT && now - lastT < MIN_STEP_MS) { raf = Sea.raf(loop); return; }
    const t0 = performance.now();
    const energy = step();
    const frame = { h: cur, W, H, cell: CELL };
    for (const fn of frameFns) { try { fn(frame); } catch (e) { console.warn('[Web-Wide-Water] water frame failed', e); } }
    stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
    if (lastT) stats.fps = stats.fps * 0.9 + (1000 / Math.max(1, now - lastT)) * 0.1;
    lastT = now;

    calm = energy < 0.004 ? calm + 1 : 0;
    if (calm > IDLE_FRAMES) {
      // Flat water: stop burning frames and let the page render untouched.
      cur.fill(0); prev.fill(0);
      stats.awake = false; lastT = 0; raf = 0;
      for (const fn of sleepFns) { try { fn(); } catch (e) { /* keep sleeping */ } }
      return;
    }
    raf = Sea.raf(loop);
  }

  function wake() {
    calm = 0;
    if (running && !raf) { stats.awake = true; if (!Sea.paused) raf = Sea.raf(loop); }
  }

  Sea.water = {
    stats,
    power: 25,
    gain: 1,            // every splash is multiplied by this (the "splash size" dial)
    get cell() { return CELL; },
    splash, band, slopeAt, heightAt, calm: flatten,
    resume() { if (running && stats.awake && !raf) raf = Sea.raf(loop); },
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    onSleep(fn) { sleepFns.add(fn); return () => sleepFns.delete(fn); },
    start() {
      if (running) return;
      running = true;
      resize();
      window.addEventListener('resize', resize);
    },
    stop() {
      if (!running) return;
      running = false;
      Sea.caf(raf); raf = 0; lastT = 0;
      stats.awake = false;
      window.removeEventListener('resize', resize);
      for (const fn of sleepFns) fn();
    }
  };
})();
