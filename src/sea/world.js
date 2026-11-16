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
  const { rand, clamp, lerp, turn } = Sea.util;

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

  function spawn(def) {
    let ent = null;
    try { ent = def.spawn(); } catch (e) { console.warn('[Web-Wide-Water] spawn failed:', def.id, e); }
    if (!ent) return false;
    Sea.scene.add(ent);
    live.push({ def, ent });
    return true;
  }

  function summon(id) {
    if (!on) return false;
    const def = Sea.creatures.find((c) => c.id === id);
    if (!def || count(def) > (def.max || 1)) return false;   // by hand you may have one more than usual
    return spawn(def);
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
  //   2  no new big arrivals, fewer particles, a plainer canvas on sharp screens
  //   3  the newest animals are asked to leave until things recover
  const perf = (Sea.perf = { level: 0, best: 0 });
  let slow = 0, fine = 0;
  function govern() {
    const ms = Sea.scene.stats.ms + Sea.water.stats.ms, fps = Sea.scene.stats.fps || Sea.water.stats.fps;
    if (!fps) return;
    perf.best = Math.max(perf.best * 0.999, fps);            // what this screen can do when all is well
    const bad = ms > 8 || fps < perf.best * 0.72, good = ms < 5 && fps > perf.best * 0.9;
    slow = bad ? slow + 1 : 0; fine = good ? fine + 1 : 0;
    if (slow >= 4 && perf.level < 3) { perf.level++; slow = 0; }             // 2 s of trouble
    else if (fine >= 16 && perf.level > 0) { perf.level--; fine = 0; }       // 8 s of calm
    if (perf.level === 3 && bad) {
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        if (l.def.kind !== 'small' && !l.shed && l.ent.leave) { l.shed = true; l.ent.leave(); break; }
      }
    }
  }

  let smallAt = 0;
  function tick() {
    if (!on || Sea.paused) return;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].ent.dead) live.splice(i, 1);
    govern();
    const now = performance.now() / 1000;
    const b = Sea.settings.busy / 100 * (perf.level >= 2 ? 0.5 : 1);
    const ok = (c) => c.auto !== false && keen(c) > 0 && Sea.enabled(c.id) && Sea.eco.allows(c) && count(c) < (c.max || 1) && now >= (c.readyAt || 0);
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

    if (now < nextAt || perf.level >= 2) return;
    if (live.length - smallLive >= 1 + Math.round(b * 3)) return;
    const able = Sea.creatures.filter((c) => !isSmall(c) && ok(c));
    if (!able.length) return;
    const def = choose(able);
    if (spawn(def)) {
      def.readyAt = now + (def.cooldown || 0) * (1.6 - b);
      nextAt = now + lerp(60, 6, b) * rand(0.6, 1.4);
    }
  }

  // ask anything that no longer belongs (switched off, or the region changed) to swim away
  function review() {
    for (const l of live) if ((!Sea.enabled(l.def.id) || !Sea.eco.inRegion(l.def, Sea.eco.region())) && l.ent.leave) l.ent.leave();
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
      perf.level = 0; slow = fine = 0;
      nextAt = performance.now() / 1000 + 1.5;   // first arrival soon after switching on
      smallAt = 0;
      for (const c of Sea.creatures) c.readyAt = 0;
      window.addEventListener('mousemove', onMove, { passive: true, capture: true });
      document.documentElement.addEventListener('mouseleave', onLeave);
      ticker = setInterval(tick, 500);
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
