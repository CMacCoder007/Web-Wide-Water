// World: the shared sea that creatures live in, and the director that decides
// when something turns up.
//
// For creature files:
//   Sea.world.entry(margin)            -> { x, y, yaw } a point just off-screen, heading across the page
//   Sea.world.gone(x, y, margin)       true when a point is further than margin outside the viewport
//   Sea.world.avoid(x, y, yaw, reach)  -> a turn (radians per frame) that steers round obstacles ahead
//   Sea.world.obstacles                Set of { x, y, r } circles to steer around (ice adds itself)
//   Sea.world.cursor                   { x, y, seen } or null when "creatures notice the cursor" is off
//   Sea.world.summon(id)               make a creature appear now (the popup's Summon buttons use this)
//
// The director never escalates: it keeps at most a few things on screen, set by
// the "how busy" slider, and waits between arrivals.
(() => {
  const Sea = window.Sea;
  if (!Sea || Sea.world) return;
  const { rand, clamp, lerp } = Sea.util;

  const live = [];          // { def, ent }
  const obstacles = new Set();
  const mouse = { x: -9999, y: -9999, seen: false };
  let ticker = 0, nextAt = 0, on = false;

  function onMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; }
  function onLeave() { mouse.seen = false; }

  function entry(margin = 160) {
    const vw = innerWidth, vh = innerHeight;
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = -margin; y = rand(0.15, 0.85) * vh; }
    else if (side === 1) { x = vw + margin; y = rand(0.15, 0.85) * vh; }
    else if (side === 2) { x = rand(0.15, 0.85) * vw; y = -margin; }
    else { x = rand(0.15, 0.85) * vw; y = vh + margin; }
    // head for somewhere in the middle of the page, so the path crosses the view
    const tx = rand(0.3, 0.7) * vw, ty = rand(0.3, 0.7) * vh;
    return { x, y, yaw: Math.atan2(ty - y, tx - x) };
  }

  function gone(x, y, margin = 200) {
    return x < -margin || x > innerWidth + margin || y < -margin || y > innerHeight + margin;
  }

  // Pass noCursor = true for animals too big to care about the cursor.
  function avoid(x, y, yaw, reach = 120, noCursor = false) {
    let out = 0;
    const fx = Math.cos(yaw), fy = Math.sin(yaw);
    // (called for every steering animal every frame, so it makes no lists)
    const consider = (ox, oy, r, near) => {
      const dx = ox - x, dy = oy - y, d = Math.hypot(dx, dy);
      if (d > near || d < 1) return;
      const ahead = (dx * fx + dy * fy) / d;       // 1 = dead ahead
      if (ahead < -0.2) return;                     // already past it
      const side = fx * dy - fy * dx;               // > 0: obstacle is to the right
      out += (side > 0 ? -1 : 1) * 0.05 * clamp(1 - (d - r) / (near - r), 0, 1) * (0.4 + ahead);
    };
    for (const o of obstacles) consider(o.x, o.y, o.r, o.r + reach);
    // the cursor counts as a small, soft obstacle, so anything that steers gives it room
    if (!noCursor && Sea.settings.cursor && mouse.seen) consider(mouse.x, mouse.y, 30, 30 + reach * 0.5);
    return clamp(out, -0.06, 0.06);
  }

  // Solid things. Steering round an obstacle (avoid, above) is a courtesy; this is
  // the wall. Give it where something is and how big; if it overlaps an obstacle
  // (ice, mostly) you get back where it should be instead, and what it hit.
  //   const hit = Sea.world.collide(x, y, radius);  if (hit) { x = hit.x; y = hit.y; ... }
  function collide(x, y, radius) {
    for (const o of obstacles) {
      const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy), min = o.r + radius;
      if (d >= min || d < 0.01) continue;
      return { x: o.x + (dx / d) * min, y: o.y + (dy / d) * min, nx: dx / d, ny: dy / d, obstacle: o, depth: min - d };
    }
    return null;
  }

  const count = (def) => live.reduce((n, l) => n + (l.def === def ? 1 : 0), 0);

  // opts.summoned: called up by hand. Creatures may use it to arrive sooner or to
  // bring along whatever they need for their event to play out.
  function spawn(def, opts) {
    if (def.broken) return false;
    let ent = null;
    try { ent = def.spawn(opts || {}); } catch (e) { strike(def, e); }
    if (!ent) return false;
    Sea.scene.add(ent);
    live.push({ def, ent, summoned: !!(opts && opts.summoned), born: performance.now() });
    return true;
  }

  // A kind of creature that keeps failing is stood down for the rest of the visit
  // to this page, so a bug in one animal can never spoil the rest of the sea.
  function strike(def, err) {
    def.failures = (def.failures || 0) + 1;
    if (def.failures >= 2 && !def.broken) { def.broken = true; console.warn('[Web-Wide-Water] stood down after repeated errors:', def.id, err || ''); }
  }

  function summon(id) {
    if (!on) return false;
    const def = Sea.creatures.find((c) => c.id === id);
    if (!def || count(def) > (def.max || 1)) return false;   // by hand you may have one more than usual
    return spawn(def, { summoned: true });
  }

  // How keen a creature is to turn up: its own weight, more if what it eats is on
  // the page (def.eats = ['fish', 'krill'...]), much less if there is nothing for it.
  function keen(c) {
    let w = c.weight || 1;
    const f = Sea.settings.freq[c.id];
    if (f != null) w *= Math.max(0, Number(f) || 0) / 100;                          // the user's own dial for this creature
    if (c.kind === 'monster' || c.id === 'battle') w *= Sea.settings.monsters / 100; // and the one dial for all trouble
    if (c.eats) w *= c.eats.some((k) => Sea.eco.has(k)) ? 3 : 0.35;
    return w;
  }

  function choose(able) {
    let roll = Math.random() * able.reduce((s, c) => s + keen(c), 0);
    for (const c of able) { roll -= keen(c); if (roll <= 0) return c; }
    return able[0];
  }

  // ---------- load governor ----------
  // Watches how long our frames take and how smooth the page is, and eases off
  // before the page suffers. It steps up quickly and back down slowly.
  //   1  the page bend and shine redraw at half rate
  //   2  at most one big animal at a time, fewer particles, a plainer canvas
  //   3  ordinary wildlife is asked to leave, oldest first, until things recover
  // It never sends away anything you summoned, or a big event or monster that is
  // under way: those always play out to the end.
  // Performance setting: 'full' switches all of this off; 'smooth' never goes
  // below level 2 and draws at 30 frames a second.
  const perf = (Sea.perf = { level: 0, best: 0 });
  let slow = 0, fine = 0;
  const precious = (l) => l.summoned || l.def.kind === 'event' || l.def.kind === 'monster';
  function govern() {
    const mode = Sea.settings.perf;
    if (mode === 'full') { perf.level = 0; slow = fine = 0; return; }
    const ms = Sea.scene.stats.ms + Sea.water.stats.ms, fps = Sea.scene.stats.fps || Sea.water.stats.fps;
    const floor = mode === 'smooth' ? 2 : 0;
    if (fps) {
      // what this screen manages when all is well (a 30 fps cap is not a problem)
      perf.best = Math.max(perf.best * 0.999, Math.min(fps, mode === 'smooth' || Sea.typing ? 32 : 999));
      const bad = ms > 8 || fps < perf.best * 0.72, good = ms < 5 && fps > perf.best * 0.9;
      slow = bad ? slow + 1 : 0; fine = good ? fine + 1 : 0;
      if (slow >= 4 && perf.level < 3) { perf.level++; slow = 0; }             // 2 s of trouble
      else if (fine >= 16 && perf.level > floor) { perf.level--; fine = 0; }   // 8 s of calm
      if (perf.level === 3 && bad) {
        // the oldest ordinary animal goes first; small life only when nothing else is left
        const order = live.filter((l) => !precious(l) && !l.shed && l.ent.leave)
          .sort((a, b) => (a.def.kind === 'small') - (b.def.kind === 'small') || a.born - b.born);
        if (order.length) { order[0].shed = true; order[0].ent.leave(); }
      }
    }
    perf.level = Math.max(perf.level, floor);
  }

  let smallAt = 0;
  function tick() {
    if (!on || Sea.paused) return;
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i];
      if (!l.ent.dead) continue;
      if (l.ent.failed) strike(l.def);
      live.splice(i, 1);
    }
    govern();
    const now = performance.now() / 1000;
    const b = Sea.settings.busy / 100 * (perf.level >= 2 ? 0.5 : 1);
    const ok = (c) => c.auto !== false && !c.broken && keen(c) > 0 && Sea.enabled(c.id) && Sea.eco.allows(c) && count(c) < (c.max || 1) && now >= (c.readyAt || 0);
    const isSmall = (c) => c.kind === 'small';

    // Small life (krill, schools, jellyfish, ice) is the background: there is nearly
    // always some about, whatever else is going on.
    const smallLive = live.reduce((n, l) => n + (isSmall(l.def) ? 1 : 0), 0);
    if (now >= smallAt && smallLive < Math.round(b * 3.4)) {
      const able = Sea.creatures.filter((c) => isSmall(c) && ok(c));
      if (able.length) {
        const def = choose(able);
        if (spawn(def)) def.readyAt = now + (def.cooldown || 0);
      }
      smallAt = now + lerp(40, 5, b) * rand(0.6, 1.4);
    }

    if (now < nextAt || perf.level >= 3) return;
    const most = perf.level >= 2 ? 1 : 1 + Math.round(b * 3);
    if (live.length - smallLive >= most) return;
    const able = Sea.creatures.filter((c) => !isSmall(c) && ok(c));
    if (!able.length) return;
    const def = choose(able);
    if (spawn(def)) {
      def.readyAt = now + (def.cooldown || 0) * (1.6 - b);
      nextAt = now + lerp(60, 6, b) * rand(0.6, 1.4);
    }
  }

  // Ask anything that no longer belongs (switched off, or the region changed) to
  // swim away. Something you summoned stays to finish, whatever the waters,
  // unless you switch that creature off.
  function review() {
    const region = Sea.eco.region();
    for (const l of live) {
      if (!l.ent.leave || l.left) continue;
      const out = !Sea.enabled(l.def.id) || (!l.summoned && !Sea.eco.inRegion(l.def, region));
      if (out) { l.left = true; l.ent.leave(); }
    }
  }

  Sea.world = {
    entry, gone, avoid, collide, obstacles, summon, review,
    get cursor() { return Sea.settings.cursor && mouse.seen ? mouse : null; },
    get live() { return live.length; }
  };

  Sea.feature({
    id: 'world',
    start() {
      on = true;
      perf.level = 0; perf.best = 0; slow = fine = 0;
      for (const c of Sea.creatures) { c.broken = false; c.failures = 0; }
      nextAt = performance.now() / 1000 + 1.5;   // first arrival soon after switching on
      smallAt = 0;
      for (const c of Sea.creatures) c.readyAt = 0;
      window.addEventListener('mousemove', onMove, { passive: true, capture: true });
      document.documentElement.addEventListener('mouseleave', onLeave);
      ticker = setInterval(() => { try { tick(); } catch (e) { console.warn('[Web-Wide-Water] director failed', e); } }, 500);
    },
    stop() {
      on = false;
      clearInterval(ticker);
      window.removeEventListener('mousemove', onMove, { capture: true });
      document.documentElement.removeEventListener('mouseleave', onLeave);
      for (const l of live) l.ent.dead = true;
      live.length = 0; obstacles.clear();
    },
    // a creature that was just switched off swims away rather than vanishing
    onSettings() { review(); }
  });
})();
