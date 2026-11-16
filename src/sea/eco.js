// Ecosystem: the things every animal shares.
//
//   Regions      The sea drifts between three waters, each with its own cast,
//                or the user pins one in the popup and edits who lives where.
//                  Sea.eco.region()        'tropical' | 'open' | 'north'
//                  Sea.eco.allows(def)     may this creature turn up here and now?
//   Day / night  From the computer's clock. Sea.eco.night() is 0 (day) .. 1 (night).
//                At night the page is tinted a little and disturbed water glows.
//   Weather      Sea.eco.weather(): 'clear' | 'swell' | 'rain' | 'fog' | 'storm'.
//   Food web     Prey groups register themselves, hunters look them up.
//                  Sea.eco.find(kinds, x, y, maxDist) -> nearest group or null
//                  group: { kind, x, y, r, count, take(n), herd() }
//                  Sea.eco.hunters                 Set of { x, y }: schools flee from these
//   Schools      Sea.eco.school(options) builds a cheap swarm (fish, krill): hundreds
//                of tiny shapes drawn in one go, which flees hunters, balls up when
//                herded, and can be eaten from.
(() => {
  const Sea = window.Sea;
  if (!Sea || Sea.eco) return;
  const { rand, clamp, turn } = Sea.util;

  const REGIONS = {
    tropical: { name: 'Coral Shallows', note: 'warm, clear water' },
    open: { name: 'The Open Blue', note: 'deep water, far from land' },
    north: { name: 'The Cold North', note: 'grey seas and drifting ice' },
    south: { name: 'The Frozen South', note: 'ice caps, penguins and krill' }
  };
  const ORDER = ['open', 'tropical', 'open', 'north', 'open', 'south'];
  // how long a region and a spell of weather last (the user sets both, in minutes)
  const regionMs = () => (Sea.settings.regionMin || 5) * 60000, weatherMs = () => (Sea.settings.weatherMin || 3) * 60000;
  const WEATHERS = ['clear', 'swell', 'rain', 'fog', 'storm'];
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  let forced = {}, omen = null;
  // Region and weather come from the clock, so every tab agrees without storing anything.
  function region() {
    if (forced.region) return forced.region;
    const s = Sea.settings.region;
    if (REGIONS[s]) return s;
    return ORDER[Math.floor(Date.now() / regionMs()) % ORDER.length];
  }
  function night() {
    if (forced.night != null) return forced.night;
    const sky = Sea.settings.sky;          // the popup can hold it at one time of day
    if (sky === 'day') return 0;
    if (sky === 'dusk') return 0.5;
    if (sky === 'night') return 1;
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 21 || h < 5) return 1;          // dusk 19:00-21:00, dawn 05:00-07:00
    if (h >= 19) return (h - 19) / 2;
    if (h < 7) return 1 - (h - 5) / 2;
    return 0;
  }
  function weather() {
    if (omen) return omen;                 // something terrible is coming up: the sky answers
    if (forced.weather) return forced.weather;
    const pick = Sea.settings.weather;     // the popup can call up any weather, or leave it to chance
    if (pick !== 'auto') return WEATHERS.includes(pick) ? pick : 'clear';
    const r = hash(Math.floor(Date.now() / weatherMs()));
    return r < 0.55 ? 'clear' : r < 0.7 ? 'swell' : r < 0.85 ? 'rain' : r < 0.95 ? 'fog' : 'storm';
  }
  // does this creature live in a region? (the user's edits win over the creature's own list)
  function inRegion(def, reg) {
    const mine = (Sea.settings.cast || {})[reg];
    if (mine && def.id in mine) return !!mine[def.id];
    return !def.regions || def.regions.includes(reg);
  }
  function allows(def) {
    if (!inRegion(def, region())) return false;
    const n = night();
    if (def.when === 'day' && n > 0.6) return false;
    if (def.when === 'night' && n < 0.4) return false;
    return true;
  }

  // ---------- food web ----------
  const groups = new Set();
  const hunters = new Set();
  function find(kinds, x, y, maxDist = 1e9) {
    let best = null, bd = maxDist;
    for (const g of groups) {
      if (g.count <= 0 || !kinds.includes(g.kind)) continue;
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  const has = (kind) => { for (const g of groups) if (g.kind === kind && g.count > 0 && !Sea.world.gone(g.x, g.y, 0)) return true; return false; };

  // ---------- schools ----------
  // options: kind, n, colours [[r,g,b]...], size (px), radius, speed, dots (true = krill-like specks),
  //          timid (flees hunters), alpha
  function school(o) {
    const start = Sea.world.entry(o.radius + 40);
    const n = o.n, A = new Float32Array(n), D = new Float32Array(n), W = new Float32Array(n);
    const X = new Float32Array(n), Y = new Float32Array(n), Hd = new Float32Array(n);
    for (let i = 0; i < n; i++) { A[i] = rand(0, 6.283); D[i] = Math.sqrt(Math.random()); W[i] = rand(0.3, 1.1) * (Math.random() < 0.5 ? -1 : 1); }
    const s = { x: start.x, y: start.y, yaw: start.yaw, course: start.yaw, seed: rand(0, 9), age: 0, tight: 0, herd: 0, panic: 0 };
    const g = {
      kind: o.kind, x: s.x, y: s.y, r: o.radius, count: n,
      take(k) {
        k = Math.min(g.count, Math.max(1, Math.round(k)));
        g.count -= k;
        Sea.water.splash(g.x, g.y, 24, -0.9);
        return k;
      },
      herd() { s.herd = 0.6; }       // call every frame while circling it: it balls up and stops
    };
    groups.add(g);

    return {
      group: g,
      update(t, dt) {
        const k = dt * 60;
        s.age += dt; s.herd -= dt; s.panic -= dt;
        let speed = o.speed, want = s.course + Math.sin(t * 0.3 + s.seed) * 0.5, rate = 0.012;
        if (o.timid) {
          let near = null, nd = 210;
          for (const h of hunters) { const d = Math.hypot(h.x - s.x, h.y - s.y); if (d < nd) { nd = d; near = h; } }
          if (near) { s.panic = 0.5; if (s.herd <= 0) { want = Math.atan2(s.y - near.y, s.x - near.x); rate = 0.07; speed = o.speed * 2.3; } }
        }
        if (s.herd > 0) speed = o.speed * 0.12;
        s.tight += ((s.herd > 0 ? 1 : s.panic > 0 ? 0.55 : 0) - s.tight) * 0.05 * k;
        s.yaw += clamp(turn(s.yaw, want), -rate, rate) * k + Sea.world.avoid(s.x, s.y, s.yaw, 80, !o.timid) * k;
        s.x += Math.cos(s.yaw) * speed * k; s.y += Math.sin(s.yaw) * speed * k;
        g.x = s.x; g.y = s.y;

        // members circle inside a blob that is long when travelling and round when balled up
        const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), R = o.radius * (1 - s.tight * 0.55);
        const lx = 1.5 - s.tight * 0.5, ly = 0.75 + s.tight * 0.25, spin = 1 + s.tight * 3;
        const shown = Sea.world.gone(s.x, s.y, o.radius * 2) ? 0 : g.count;     // off the page: no need to move every fish
        for (let i = 0; i < shown; i++) {
          A[i] += W[i] * dt * spin;
          const ox = Math.cos(A[i]) * D[i] * R * lx, oy = Math.sin(A[i]) * D[i] * R * ly;
          X[i] = s.x + ox * cy - oy * sy; Y[i] = s.y + ox * sy + oy * cy;
          Hd[i] = s.tight > 0.5 ? s.yaw + A[i] + (W[i] > 0 ? 1.571 : -1.571) : s.yaw + Math.sin(A[i] * 2 + i) * 0.35;
        }
        g.r = R;
        if (g.count <= 0 || (s.age > 8 && Sea.world.gone(s.x, s.y, o.radius + 120))) { this.dead = true; groups.delete(g); }
      },
      under(c) {
        if (Sea.world.gone(s.x, s.y, o.radius * 2)) return;
        const cols = o.colours, glow = o.glow && night() > 0.5;
        for (let ci = 0; ci < cols.length; ci++) {
          const col = glow ? o.glow : cols[ci];
          c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${o.alpha || 0.6})`;
          c.beginPath();
          for (let i = ci; i < g.count; i += cols.length) {
            const x = X[i], y = Y[i];
            if (o.dots) { c.rect(x, y, o.size, o.size); continue; }
            const fx = Math.cos(Hd[i]) * o.size, fy = Math.sin(Hd[i]) * o.size;
            c.moveTo(x + fx, y + fy);
            c.lineTo(x - fx - fy * 0.45, y - fy + fx * 0.45);
            c.lineTo(x - fx + fy * 0.45, y - fy - fx * 0.45);
          }
          c.fill();
        }
      },
      leave() { s.course = Math.atan2(s.y - innerHeight / 2, s.x - innerWidth / 2); o.speed *= 2; }
    };
  }

  // ---------- atmosphere: night tint, fog, weather on the water, the region label ----------
  let tint = null, fog = null, label = null, timer = 0, lastRegion = null, lastWeather = null, lastSky = -1, swellIn = 0, labelTimer = 0;

  function announce() {
    if (!label) return;
    const reg = REGIONS[region()], w = weather(), n = night();
    const bits = [reg.name];
    if (n > 0.6) bits.push('night'); else if (n > 0) bits.push('dusk');
    if (w !== 'clear') bits.push(w === 'swell' ? 'a rolling swell' : w);
    label.textContent = bits.join('  ·  ');
    label.style.opacity = '1';
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => { if (label) label.style.opacity = '0'; }, 6000);
  }

  function tick() {
    if (!Sea.active || Sea.paused) return;
    const vw = innerWidth, vh = innerHeight, n = night(), w = weather(), reg = region();
    const sky = n > 0.6 ? 2 : n > 0 ? 1 : 0;
    if (reg !== lastRegion || w !== lastWeather || sky !== lastSky) {
      const moved = lastRegion && reg !== lastRegion;
      lastRegion = reg; lastWeather = w; lastSky = sky;
      announce();
      if (moved) Sea.world.review();     // animals that don't live here swim off
    }
    // the page dims a little at night and under heavy weather; it always stays readable
    const dark = Math.min(0.6, n * 0.0057 * Sea.settings.nightDark + (w === 'storm' ? 0.2 : w === 'rain' ? 0.08 : 0));
    tint.style.opacity = dark.toFixed(2);
    fog.style.opacity = w === 'fog' ? '0.3' : '0';

    if (w === 'rain' || w === 'storm') {
      const drops = w === 'storm' ? 5 : 2;
      for (let i = 0; i < drops; i++) {
        const x = rand(0, vw), y = rand(0, vh);
        Sea.scene.emit({ k: 'ring', x, y, life: 22, size: 1.5, grow: rand(8, 14) });
        if (i === 0) Sea.water.splash(x, y, 9, -0.35);
      }
    }
    if (w === 'swell' || w === 'storm') {
      swellIn -= 0.25;
      if (swellIn <= 0) { swellIn = w === 'storm' ? rand(2.5, 4) : rand(5, 8); Sea.water.band(rand(90, vh - 90), 90, w === 'storm' ? 1.1 : 0.7); }
    }
    // living light: at night, wherever the water is moving, plankton glows
    if (n > 0.5) {
      for (let i = 0; i < 46; i++) {
        const x = rand(0, vw), y = rand(0, vh), sl = Sea.water.slopeAt(x, y);
        if (Math.abs(sl.x) + Math.abs(sl.y) > 0.07) Sea.scene.emit({ k: 'glow', x, y, life: rand(26, 50), size: rand(1, 2.4) });
      }
    }
  }

  Sea.eco = {
    REGIONS, region, night, weather, allows, inRegion, find, has, hunters, groups, school,
    // an event may take over the weather while it lasts: Sea.eco.omen('storm'), then Sea.eco.omen(null)
    omen(w) { omen = w || null; tick(); },
    // for testing: Sea.eco.force({ region: 'north', night: 1, weather: 'rain' }); force({}) to release
    force(f) { forced = f || {}; lastRegion = null; }
  };

  Sea.feature({
    id: 'eco',
    start() {
      const { el } = Sea.util, layer = Sea.util.layer();
      tint = el('div', { position: 'absolute', inset: '0', background: 'rgb(120,140,205)', mixBlendMode: 'multiply', opacity: '0', transition: 'opacity 4s', pointerEvents: 'none' });
      fog = el('div', {
        position: 'absolute', inset: '-20%', opacity: '0', transition: 'opacity 6s', pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 25% 30%, rgba(255,255,255,.95), transparent 45%), radial-gradient(ellipse at 75% 65%, rgba(255,255,255,.9), transparent 50%), radial-gradient(ellipse at 55% 10%, rgba(255,255,255,.7), transparent 40%)'
      });
      label = el('div', {
        position: 'absolute', left: '14px', bottom: '14px', padding: '6px 14px', borderRadius: '3px', pointerEvents: 'none',
        background: 'rgba(240,226,190,.94)', color: '#3b2a1a', border: '1px solid rgba(90,60,30,.55)',
        font: 'italic 600 13px Georgia, "Times New Roman", serif', letterSpacing: '.03em',
        boxShadow: '0 2px 8px rgba(0,0,0,.25)', opacity: '0', transition: 'opacity 1.2s'
      });
      layer.prepend(tint, fog);
      layer.append(label);
      try { fog.animate([{ transform: 'translate(-6%, -3%)' }, { transform: 'translate(6%, 3%)' }], { duration: 40000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }); } catch (e) { /* no animation */ }
      lastRegion = lastWeather = null;
      timer = setInterval(tick, 250);
    },
    stop() {
      clearInterval(timer); clearTimeout(labelTimer);
      tint = fog = label = null;     // the layer they live in is removed with the sea
      groups.clear(); hunters.clear(); forced = {}; omen = null;
    },
    onSettings() { tick(); }   // a change in the popup shows at once (the label only appears if something changed)
  });
})();
