// Your own character: a ship (or a small fleet) you design in the control
// centre, or a pod of orcas, dolphins or turtles in your own colours. It lives
// on every page while the sea is on.
//
// The first one follows your cursor, or roams the page by itself; the rest keep
// formation on it. Alt+Shift+C switches between the two on any page (the key
// can be changed at chrome://extensions/shortcuts). Click anywhere and the
// animals race over and leap there; ships fire a salute.
//
// How it moves, so that it glides rather than twitches:
//   - it never chases the raw cursor: each member follows a smoothed target
//     that eases after the cursor (or after its place in the formation);
//   - it turns gradually, harder the further off course it is, and a ship
//     needs way on to answer the helm;
//   - it slows as it arrives, and once there it settles: ships hold position,
//     animals swim slow lazy circles round the spot. It only sets off again when
//     the target has moved well away, so small movements of the mouse leave it be;
//   - while the leader is settled, the formation is laid out from where it
//     settled, so the others settle too instead of chasing a turning leader.
//
// The rest of the sea treats it as its own: wild dolphins ride alongside, gulls
// follow a ship, a shark trails it, fish and seals flee from your orcas or
// dolphins, and in mischief mode pirates and monsters may come for your ships
// (a lost ship is replaced a few seconds later).
//
//   Sea.mate.pos()   -> the leader { x, y, yaw, afloat }, or null
//
// settings.mate: { kind: 'none' | 'ship' | 'orca' | 'dolphin' | 'turtle', name, size (60-160),
//                  count (ships 1-3, animals 1-7), follow: 'cursor' | 'roam',
//                  ship:    hull, trim, sail, flag (hex colours), masts (1-3), emblem, stripes, guns
//                  animals: c1, c2, c3 (hex colours; what each one paints depends on the animal) }
// The design only changes when the user presses Save in the control centre;
// 'follow' changes at once (the hotkey) without rebuilding anything.
(() => {
  const Sea = window.Sea;
  if (!Sea || Sea.mate) return;
  const { rand, clamp, turn } = Sea.util;

  const DEFAULTS = {
    kind: 'none', name: '', size: 100, count: 1, follow: 'cursor',
    hull: '#5a3a22', trim: '#c9a227', sail: '#f3ead2', flag: '#b3202a', masts: 2, emblem: 'none', stripes: false, guns: true,
    c1: '', c2: '', c3: ''
  };
  const FLEET = [[0, 0], [-105, -62], [-105, 62]];     // where each ship of a fleet sails, relative to the first
  const rgb = (hex, fallback) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const ease = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const following = () => ((Sea.settings.mate || {}).follow || 'cursor') !== 'roam';

  let group = [], sig = '', respawn = 0, lastFollow = null;

  // ---------- navigation, shared by ships and animals ----------
  // Where a member would like to be, before smoothing.
  function rawGoal(m) {
    const L = m.lead;
    if (L) {
      const settled = L.mode === 'settled';
      const ox = settled ? L.rest.x : L.x, oy = settled ? L.rest.y : L.y, h = settled ? L.restHdg : L.hdg;
      const c = Math.cos(h), s = Math.sin(h), k = m.spread;
      return [ox + (m.slot[0] * c - m.slot[1] * s) * k, oy + (m.slot[0] * s + m.slot[1] * c) * k];
    }
    if (following()) return [Sea.cursor.x, Sea.cursor.y];
    // roaming: make for a spot, rest there a few seconds, choose another
    if (!m.wp || (m.mode === 'settled' && performance.now() > m.wpUntil)) {
      m.wp = [rand(0.14, 0.86) * innerWidth, rand(0.18, 0.82) * innerHeight];
    }
    return m.wp;
  }

  // Ease the target after the goal, and the remembered heading after the actual one.
  function track(m, dt) {
    const g = rawGoal(m);
    const a = 1 - Math.exp(-dt / (m.lead ? 0.4 : 0.3));
    m.tx += (g[0] - m.tx) * a; m.ty += (g[1] - m.ty) * a;
    m.hdg += turn(m.hdg, m.yaw) * (1 - Math.exp(-dt / 0.6));
  }

  // Travelling or settled, with a gap between the two so it does not flicker between them.
  function mode(m, o) {
    const d = Math.hypot(m.tx - m.x, m.ty - m.y);
    if (m.mode === 'travel' && d < o.arrive) {
      m.mode = 'settled';
      m.rest = { x: m.tx, y: m.ty }; m.restHdg = m.hdg;
      m.circ = Math.atan2(m.y - m.ty, m.x - m.tx);
      if (!m.lead) m.wpUntil = performance.now() + rand(3000, 8000);
    } else if (m.mode === 'settled' && Math.hypot(m.tx - m.rest.x, m.ty - m.rest.y) > o.leave) {
      m.mode = 'travel';
    }
    return d;
  }

  // Turn towards a point (gradually) and ease the speed towards `want`.
  function steer(m, ax, ay, want, dt, o) {
    const k = dt * 60;
    let rate = clamp(turn(m.yaw, Math.atan2(ay - m.y, ax - m.x)) * o.gain, -o.maxTurn, o.maxTurn);
    if (o.ship) rate *= clamp(m.speed / 0.5, 0.25, 1);         // a ship needs way on to answer the helm
    m.turnRate = rate;
    m.yaw += rate * k + Sea.world.avoid(m.x, m.y, m.yaw, o.ship ? 90 : 80, true) * 0.6 * k;
    const dv = want - m.speed;
    m.speed += clamp(dv, -o.decel * k, o.accel * k);
    m.x += Math.cos(m.yaw) * m.speed * k; m.y += Math.sin(m.yaw) * m.speed * k;
  }

  function nameTag(c, m, y) {
    if (m.lead || !m.opts.name || (m.age > 7 && Math.hypot(Sea.cursor.x - m.x, Sea.cursor.y - m.y) > 60)) return;
    c.font = 'italic 600 12px Georgia, serif';
    const w = c.measureText(m.opts.name).width + 16;
    c.fillStyle = 'rgba(240,226,190,.92)'; c.fillRect(m.x - w / 2, y, w, 19);
    c.strokeStyle = 'rgba(90,60,30,.55)'; c.lineWidth = 1; c.strokeRect(m.x - w / 2 + 0.5, y + 0.5, w - 1, 18);
    c.fillStyle = '#3b2a1a'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(m.opts.name, m.x, y + 10);
  }

  // what every member starts with
  const base = (start, lead, slot) => ({
    lead, slot, x: start.x, y: start.y, yaw: start.yaw, hdg: start.yaw, tx: start.x, ty: start.y,
    speed: 0, turnRate: 0, mode: 'travel', rest: null, restHdg: start.yaw, circ: 0, wp: null, wpUntil: 0,
    dir: Math.random() < 0.5 ? 1 : -1, age: 0, salute: 0, afloat: true, dead: false
  });

  // ---------- a ship ----------
  function makeShip(opts, model, start, lead, slot) {
    const size = clamp((Number(opts.size) || 100) / 100, 0.6, 1.6) * 1.15;
    const nav = lead
      ? { ship: true, arrive: 16, leave: 60, slow: 140, max: 2.3, gain: 0.05, maxTurn: 0.026, accel: 0.022, decel: 0.03 }
      : { ship: true, arrive: 80 * size, leave: 180 * size, slow: 160, max: 1.9, gain: 0.05, maxTurn: 0.024, accel: 0.02, decel: 0.03 };
    const m = Object.assign(base(start, lead, slot), {
      kind: 'player', opts, model, size, spread: size, vx: 0, vy: 0, roll: 0, kick: 0,
      hp: 4, fighting: false, reload: rand(1, 3), mend: 0, wakeT: 0, wakeN: 0, ph: rand(0, 9),
      sinkBy() { Sea.ships.sink(this); },

      update(t, dt) {
        const k = dt * 60;
        this.age += dt;
        track(this, dt);
        const d = mode(this, nav);
        if (this.mode === 'travel') {
          // slows as it comes up, but keeps steerage way until it is there
          const want = Math.max(0.25, nav.max * ease((d - nav.arrive * 0.6) / nav.slow));
          steer(this, this.tx, this.ty, want, dt, nav);
        } else {
          // hove to: the leader holds its heading, the others come round to match it
          const h = !lead ? this.yaw : (lead.mode === 'settled' ? lead.restHdg : lead.hdg);
          steer(this, this.x + Math.cos(h) * 100, this.y + Math.sin(h) * 100, 0, dt, nav);
        }
        this.vx = Math.cos(this.yaw) * this.speed; this.vy = Math.sin(this.yaw) * this.speed;
        Sea.ships.bump(this);          // ice and other ships are solid
        if (!this.afloat) return;

        const sl = Sea.water.slopeAt(this.x, this.y);
        this.kick *= Math.pow(0.93, k);
        const lean = this.turnRate * 9 + Math.sin(t * 1.3 + this.ph) * 0.05 + this.kick + clamp((-sl.x * Math.sin(this.yaw) + sl.y * Math.cos(this.yaw)) * 0.5, -0.25, 0.25);
        this.roll += (lean - this.roll) * 0.1 * k;

        // come alongside a castaway and he is saved
        const lost = Sea.castaway && !Sea.castaway.saved ? Sea.castaway : null;
        if (lost && Math.hypot(lost.x - this.x, lost.y - this.y) < 60 * size) lost.rescue(this);

        // the carpenter mends one hit every so often
        if (this.hp < 4 && (this.mend += dt) > 12) { this.mend = 0; this.hp++; }

        // guns: answer any pirate that is fighting, when it is off the beam
        this.reload -= dt;
        if (opts.guns !== false && this.reload <= 0) {
          this.reload = 0.4;
          const foe = Sea.ships.nearest(this, ['ghost', 'pirate']);       // your ships stand with the navy against the ghost ship
          if (foe && foe.s.fighting && foe.d < 340) {
            const abeam = Math.sin(turn(this.yaw, Math.atan2(foe.s.y - this.y, foe.s.x - this.x)));
            if (Math.abs(abeam) > 0.35) { Sea.ships.fire(this, foe.s, abeam > 0 ? 1 : -1); this.reload = rand(3, 4.6); }
          }
        }
        // a click anywhere on the page: a blank salute from both sides, just smoke and noise
        if (this.salute) {
          this.salute = 0;
          for (const side of [-1, 1]) {
            const sx = this.x - Math.sin(this.yaw) * side * 13 * size, sy = this.y + Math.cos(this.yaw) * side * 13 * size;
            Sea.scene.burst('fire', sx, sy, 10, 3, { speed: 1.2, up: 0.6, life: 12, size: 4, colours: [[255, 210, 90], [255, 150, 40]] });
            Sea.scene.burst('smoke', sx, sy, 11, 5, { speed: 0.8, up: 0.5, life: 50, size: 5, c: [235, 235, 235] });
          }
          Sea.water.splash(this.x, this.y, 30, -0.8);
        }

        this.wakeT += dt;
        if (this.wakeT > 0.07 && this.speed > 0.2) {
          this.wakeT = 0;
          const bx = this.x - Math.cos(this.yaw) * 44 * size, by = this.y - Math.sin(this.yaw) * 44 * size;
          Sea.scene.emit({ k: 'foam', x: bx + rand(-7, 7), y: by + rand(-7, 7), life: 46, size: rand(2.5, 5) });
          if (++this.wakeN % 4 === 0) Sea.water.splash(bx, by, 12, -0.3);
          if (this.hp === 1 && this.wakeN % 2 === 0) Sea.scene.emit({ k: 'smoke', x: this.x, y: this.y, z: 16, vz: 0.8, vx: 0.25, life: 70, size: 5, c: [60, 60, 64] });
        }
      },
      shadow(c) { Sea.scene.blobShadow(c, this.x, this.y, this.yaw, 46 * size, 15 * size, 0.28); },
      draw(S, t) {
        const bob = Math.sin(t * 1.6 + this.ph) * 0.9 - Sea.water.heightAt(this.x, this.y) * 2.5;
        const pose = { x: this.x, y: this.y, z: bob, yaw: this.yaw, roll: this.roll, pitch: Math.sin(t * 1.1 + this.ph) * 0.03, s: size };
        S.mesh(model.stern, pose); S.mesh(model.bow, pose);
      },
      over(c) { nameTag(c, this, this.y + 30 * size); }
    });
    Sea.ships.add(m);
    return m;
  }

  // ---------- an orca, dolphin or turtle ----------
  function makeAnimal(opts, kit, model, start, lead, slot) {
    const size = clamp((Number(opts.size) || 100) / 100, 0.6, 1.6);
    const s = size * (lead ? rand(0.78, 0.98) : 1);        // the leader is the biggest
    const nav = lead
      ? { arrive: 26 * s, leave: 64 * s, slow: 120, max: kit.speed * 1.35, idle: kit.speed * 0.32, ring: 28 * s, gain: 0.07, maxTurn: 0.05, accel: 0.03, decel: 0.04 }
      : { arrive: 75 * s, leave: 170 * s, slow: 170, max: kit.speed, idle: kit.speed * 0.32, ring: 55 * s, gain: 0.07, maxTurn: 0.05, accel: 0.03, decel: 0.04 };
    const m = Object.assign(base(start, lead, slot), {
      kind: opts.kind, opts, spread: size * (opts.kind === 'orca' ? 1 : 0.8),
      z: kit.cruise * s, pitch: 0, roll: 0, phase: rand(0, 6), leap: -1, leapTo: null, surf: 0, wakeT: 0,

      update(t, dt) {
        const k = dt * 60;
        this.age += dt;
        track(this, dt);

        // a click: they race over and leap there (turtles come up for a look instead)
        if (this.salute) {
          const at = this.salute; this.salute = 0;
          if (kit.leap) this.leapTo = [at[0] + (lead ? rand(-40, 40) : 0), at[1] + (lead ? rand(-40, 40) : 0)];
          else { this.surf = 2; Sea.scene.emit({ k: 'ring', x: this.x, y: this.y, life: 30, size: 6, grow: 24 }); }
        }

        if (this.leapTo) {
          const d = Math.hypot(this.leapTo[0] - this.x, this.leapTo[1] - this.y);
          steer(this, this.leapTo[0], this.leapTo[1], kit.speed * 1.8, dt, nav);
          if (this.leap < 0 && d < 90 * s) {
            this.leap = 0; this.leapTo = null; this.mode = 'travel';
            Sea.water.splash(this.x, this.y, kit.leap.splash * 0.6 * s, 1.6);
            Sea.scene.burst('spray', this.x, this.y, 3, 10, { speed: 1.6, up: 3.4, life: 36, size: 2 });
          }
        } else {
          const d = mode(this, nav);
          if (this.mode === 'travel') {
            steer(this, this.tx, this.ty, Math.max(nav.idle, nav.max * ease((d - nav.arrive * 0.6) / nav.slow)), dt, nav);
          } else {
            // settled: slow lazy circles round the spot, aiming a little ahead on the circle
            this.circ += this.dir * nav.idle * k / nav.ring;
            const a = this.circ + this.dir * 0.7;
            steer(this, this.rest.x + Math.cos(a) * nav.ring, this.rest.y + Math.sin(a) * nav.ring, nav.idle, dt, nav);
          }
        }
        const fx = Math.cos(this.yaw), fy = Math.sin(this.yaw);
        this.phase += dt * (3 + this.speed * 2.4);

        if (this.leap >= 0) {
          this.leap += dt / kit.leap.t;
          const p = Math.min(1, this.leap);
          this.z = kit.cruise * s + Math.sin(Math.PI * p) * kit.leap.h * s;
          this.pitch = Math.cos(Math.PI * p) * 0.9;
          this.roll = clamp(p * 1.6, 0, 1) * kit.leap.roll;
          if (p >= 1) {
            this.leap = -1; this.roll = 0;
            const r = kit.leap.splash * s;
            Sea.water.splash(this.x, this.y, r, -r / 24);
            Sea.scene.emit({ k: 'ring', x: this.x, y: this.y, life: 44, size: r * 0.2, grow: r * 1.3 });
            Sea.scene.burst('spray', this.x, this.y, 3, Math.round(r * 0.4), { speed: 2.6, up: 4.4, life: 48, size: 2.4 });
          }
        } else {
          this.surf -= dt;
          this.z += ((this.surf > 0 ? 1 : kit.cruise) * s - this.z) * 0.08 * k;
          // a gentle bank into turns, eased so it never snaps
          this.pitch += ((this.surf > 0 ? 0.3 : 0) - this.pitch) * 0.1 * k;
          this.roll += (clamp(-this.turnRate * 6, -0.35, 0.35) - this.roll) * 0.08 * k;
          if ((this.wakeT += dt) > 0.12 && this.speed > 0.4) {
            this.wakeT = 0;
            Sea.scene.emit({ k: 'foam', x: this.x - fx * 12 * s + rand(-3, 3), y: this.y - fy * 12 * s + rand(-3, 3), life: 30, size: rand(1.2, 3) * s });
            if (Math.random() < 0.3) Sea.water.splash(this.x, this.y, 16 * s, -0.3);
          }
        }
      },
      under(c) {
        if (this.z > 8) return;
        c.translate(this.x + 2, this.y + 4); c.rotate(this.yaw); c.scale(s, s);
        c.fillStyle = 'rgba(8,22,44,.4)';
        if (kit.outline) c.fill(kit.outline());
        else { c.beginPath(); c.ellipse(0, 0, 20, 15, 0, 0, 6.283); c.fill(); }
      },
      shadow(c) { if (this.z > 4) Sea.scene.blobShadow(c, this.x, this.y, this.yaw, 40 * s, 10 * s, 0.2); },
      draw(S) { S.mesh(model, { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, roll: this.roll, s }, { deform: kit.flex(this.phase) }); },
      over(c) { nameTag(c, this, this.y + 26 * s); }
    });
    if (kit.hunter) Sea.eco.hunters.add(m);
    return m;
  }

  function dismiss() {
    for (const m of group) {
      m.dead = true; m.afloat = false;
      if (m.kind === 'player') Sea.ships.remove(m);
      Sea.eco.hunters.delete(m);
    }
    group = [];
  }

  function launch() {
    const opts = { ...DEFAULTS, ...(Sea.settings.mate || {}) };
    dismiss();
    if (opts.kind === 'none') return;
    const start = Sea.world.entry(90), c = Math.cos(start.yaw), s = Math.sin(start.yaw);
    const place = (slot) => ({ x: start.x + slot[0] * c - slot[1] * s, y: start.y + slot[0] * s + slot[1] * c, yaw: start.yaw });

    if (opts.kind === 'ship') {
      const model = Sea.ships.build({
        hull: rgb(opts.hull, [90, 58, 34]), trim: rgb(opts.trim, [201, 162, 39]), deck: [176, 134, 86],
        sail: rgb(opts.sail, [243, 234, 210]), flag: rgb(opts.flag, [179, 32, 42]),
        masts: clamp(Number(opts.masts) || 2, 1, 3), emblem: opts.emblem, mark: rgb(opts.flag, [179, 32, 42]), stripes: !!opts.stripes
      });
      const n = clamp(Math.round(Number(opts.count) || 1), 1, 3);
      for (let i = 0; i < n; i++) group.push(makeShip(opts, model, place(FLEET[i]), i ? group[0] : null, FLEET[i]));
    } else {
      const kit = Sea.kit && Sea.kit[opts.kind];
      if (!kit) return;
      // your colours if you chose any, otherwise the animal's own
      const pal = [rgb(opts.c1), rgb(opts.c2), rgb(opts.c3)];
      const model = kit.model(pal.every(Boolean) ? pal : null);
      const n = clamp(Math.round(Number(opts.count) || 1), 1, 7);
      for (let i = 0; i < n; i++) group.push(makeAnimal(opts, kit, model, place(kit.slots[i]), i ? group[0] : null, kit.slots[i]));
    }
    for (const m of group) Sea.scene.add(m);
  }

  // a word on the water when the hotkey changes what it does
  function announce(text) {
    const L = group[0];
    if (!L || L.dead) return;
    const tag = Sea.util.el('div', {
      position: 'absolute', left: clamp(L.x - 70, 8, innerWidth - 150) + 'px', top: clamp(L.y - 56, 8, innerHeight - 40) + 'px',
      padding: '4px 12px', borderRadius: '3px', pointerEvents: 'none', whiteSpace: 'nowrap',
      background: 'rgba(240,226,190,.95)', color: '#3b2a1a', border: '1px solid rgba(90,60,30,.55)', font: 'italic 600 13px Georgia, serif'
    }, text);
    Sea.util.layer().appendChild(tag);
    try { tag.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200 }).onfinish = () => tag.remove(); }
    catch (e) { setTimeout(() => tag.remove(), 2200); }
  }

  // anything lost (a ship sunk) is replaced a few seconds later, the whole company sailing in again
  let watch = 0;
  function check() {
    if (!Sea.active || Sea.paused || !group.length) return;
    if (!respawn && group.some((m) => m.dead)) respawn = performance.now() + 8000;
    if (respawn && performance.now() > respawn) { respawn = 0; launch(); }
  }

  function onDown(e) {
    if (e.button !== 0) return;
    for (const m of group) if (!m.dead) m.salute = [e.clientX, e.clientY];
  }

  Sea.mate = {
    DEFAULTS,
    pos: () => (group.length && !group[0].dead && group[0].afloat ? group[0] : null),
    get count() { return group.length; }
  };

  Sea.feature({
    id: 'mate',
    start() {
      sig = ''; lastFollow = null;
      window.addEventListener('pointerdown', onDown, { passive: true, capture: true });
      watch = setInterval(() => { try { check(); } catch (e) { /* try again next second */ } }, 1000);
    },
    stop() {
      window.removeEventListener('pointerdown', onDown, { capture: true });
      clearInterval(watch);
      group = []; sig = ''; respawn = 0;
    },
    // Rebuild only when the design itself changed. Switching follow on or off
    // (the hotkey) just changes where it heads, and says so.
    onSettings(s) {
      const { follow, ...design } = s.mate || {};
      const f = follow || 'cursor';
      if (lastFollow && f !== lastFollow && group.length) announce(f === 'roam' ? 'Roaming free' : 'Following you');
      lastFollow = f;
      const next = JSON.stringify(design);
      if (next === sig) return;
      sig = next; respawn = 0;
      launch();
    }
  });
})();
