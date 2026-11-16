// Your own character: a ship (or a small fleet) you design in the control
// centre, or a pod of orcas, dolphins or turtles in your own colours. It lives
// on every page while the sea is on.
//
// The first one follows your cursor (or roams by itself, your choice), stops a
// little way off, and waits; the rest keep formation on it. Click anywhere and
// the animals race over and leap there; ships fire a salute.
//
// The rest of the sea treats them as its own:
//   - wild dolphins come and ride alongside;
//   - gulls follow a ship when there are no fish to dive on;
//   - a shark will trail a ship for a while;
//   - fish and seals flee from your orcas or dolphins, so you can herd them;
//   - in mischief mode pirates fire on your ships (they fire back), and the
//     kraken and megalodon may take one. A lost ship is replaced a few seconds
//     later. With mischief off nothing can harm them.
//
//   Sea.mate.pos()   -> the leader { x, y, yaw, afloat }, or null
//
// settings.mate: { kind: 'none' | 'ship' | 'orca' | 'dolphin' | 'turtle', name, size (60-160),
//                  count (ships 1-3, animals 1-7), follow: 'cursor' | 'roam',
//                  ship:    hull, trim, sail, flag (hex colours), masts (1-3), emblem, stripes, guns
//                  animals: c1, c2, c3 (hex colours; what each one paints depends on the animal) }
// It only changes when the user presses Save in the control centre.
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

  let group = [], sig = '', respawn = 0, moved = 0;

  // Where it wants to be. The leader: near the cursor, or wandering. The others: their place in the formation.
  function goal(m) {
    if (m.lead) {
      const L = m.lead, c = Math.cos(L.yaw), s = Math.sin(L.yaw), k = m.spread;
      return [L.x + (m.slot[0] * c - m.slot[1] * s) * k, L.y + (m.slot[0] * s + m.slot[1] * c) * k];
    }
    const cur = Sea.cursor, vw = innerWidth, vh = innerHeight;
    if (m.opts.follow !== 'roam' && performance.now() - moved < 9000) return [cur.x, cur.y];
    if (!m.wp || Math.hypot(m.wp[0] - m.x, m.wp[1] - m.y) < 90 || performance.now() > m.wpUntil) {
      m.wp = [rand(0.14, 0.86) * vw, rand(0.18, 0.82) * vh]; m.wpUntil = performance.now() + 20000;
    }
    return m.wp;
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

  // ---------- a ship ----------
  function makeShip(opts, model, start, lead, slot) {
    const size = clamp((Number(opts.size) || 100) / 100, 0.6, 1.6) * 1.15;
    const m = {
      kind: 'player', opts, model, size, lead, slot, spread: size,
      x: start.x, y: start.y, vx: 0, vy: 0, yaw: start.yaw, roll: 0, kick: 0, speed: 0,
      hp: 4, afloat: true, fighting: false, dead: false, age: 0, reload: rand(1, 3), mend: 0, wakeT: 0, wakeN: 0, ph: rand(0, 9), salute: 0,
      sinkBy() { Sea.ships.sink(this); },

      update(t, dt) {
        const k = dt * 60;
        this.age += dt;
        const g = goal(this), d = Math.hypot(g[0] - this.x, g[1] - this.y);
        // the first ship heaves to a little way off the cursor; the others close right up to their station
        const cruise = clamp((d - (lead ? 12 : 70 * size)) / 130, 0, lead ? 2.3 : 1.9);
        const want = cruise > 0.05 ? Math.atan2(g[1] - this.y, g[0] - this.x) : lead ? lead.yaw : this.yaw;
        const tn = clamp(turn(this.yaw, want), -0.028, 0.028) * (cruise > 0.05 || lead ? 1 : 0) + Sea.world.avoid(this.x, this.y, this.yaw, 90, true) * 0.6;
        this.yaw += tn * k;
        this.speed += (cruise - this.speed) * 0.035 * k;
        this.vx = Math.cos(this.yaw) * this.speed; this.vy = Math.sin(this.yaw) * this.speed;
        this.x += this.vx * k; this.y += this.vy * k;
        Sea.ships.bump(this);          // ice and other ships are solid
        if (!this.afloat) return;

        const sl = Sea.water.slopeAt(this.x, this.y);
        this.kick *= Math.pow(0.93, k);
        const lean = tn * 9 + Math.sin(t * 1.3 + this.ph) * 0.05 + this.kick + clamp((-sl.x * Math.sin(this.yaw) + sl.y * Math.cos(this.yaw)) * 0.5, -0.25, 0.25);
        this.roll += (lean - this.roll) * 0.15 * k;

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
    };
    Sea.ships.add(m);
    return m;
  }

  // ---------- an orca, dolphin or turtle ----------
  function makeAnimal(opts, kit, model, start, lead, slot) {
    const base = clamp((Number(opts.size) || 100) / 100, 0.6, 1.6);
    const s = base * (lead ? rand(0.78, 0.98) : 1);        // the leader is the biggest
    const m = {
      kind: opts.kind, opts, lead, slot, spread: base * (opts.kind === 'orca' ? 1 : 0.8),
      x: start.x, y: start.y, yaw: start.yaw, z: kit.cruise * s, pitch: 0, roll: 0, phase: rand(0, 6), speed: 0,
      afloat: true, dead: false, age: 0, leap: -1, leapTo: null, surf: 0, wakeT: 0, orbit: rand(0, 6), salute: 0,

      update(t, dt) {
        const k = dt * 60;
        this.age += dt; this.orbit += dt * 0.8;
        let g = goal(this);
        if (this.leapTo) g = this.leapTo;
        let d = Math.hypot(g[0] - this.x, g[1] - this.y);
        // close to the cursor the leader circles instead of stopping dead: animals don't hover
        if (!lead && !this.leapTo && d < 80 * s) { g = [g[0] + Math.cos(this.orbit) * 70 * s, g[1] + Math.sin(this.orbit) * 70 * s]; d = 60; }
        // in formation: aim a little ahead of the slot, so it joins the line instead of circling it
        if (lead && !this.leapTo) g = [g[0] + Math.cos(lead.yaw) * 50, g[1] + Math.sin(lead.yaw) * 50];
        this.yaw += clamp(turn(this.yaw, Math.atan2(g[1] - this.y, g[0] - this.x)), -0.06, 0.06) * k + Sea.world.avoid(this.x, this.y, this.yaw, 80, true) * 0.6 * k;
        const want = lead && !this.leapTo ? clamp(lead.speed * (0.8 + d / 160), 0.3, kit.speed * 1.7) : kit.speed * clamp(d / 160, 0.45, this.leapTo ? 1.9 : 1.4);
        this.speed += (want - this.speed) * 0.06 * k;
        const fx = Math.cos(this.yaw), fy = Math.sin(this.yaw);
        this.x += fx * this.speed * k; this.y += fy * this.speed * k;
        this.phase += dt * (3 + this.speed * 2.4);

        // a click: they race over and leap there (turtles come up for a look instead)
        if (this.salute) {
          const at = this.salute; this.salute = 0;
          if (kit.leap) this.leapTo = [at[0] + rand(-40, 40) * (lead ? 1 : 0), at[1] + rand(-40, 40) * (lead ? 1 : 0)];
          else { this.surf = 2; Sea.scene.emit({ k: 'ring', x: this.x, y: this.y, life: 30, size: 6, grow: 24 }); }
        }
        if (this.leapTo && this.leap < 0 && d < 90 * s) {
          this.leap = 0; this.leapTo = null;
          Sea.water.splash(this.x, this.y, kit.leap.splash * 0.6 * s, 1.6);
          Sea.scene.burst('spray', this.x, this.y, 3, 10, { speed: 1.6, up: 3.4, life: 36, size: 2 });
        }
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
          this.pitch += ((this.surf > 0 ? 0.3 : 0) - this.pitch) * 0.1 * k; this.roll *= Math.pow(0.85, k);
          if ((this.wakeT += dt) > 0.12 && this.speed > 0.4) {
            this.wakeT = 0;
            Sea.scene.emit({ k: 'foam', x: this.x - fx * 12 * s + rand(-3, 3), y: this.y - fy * 12 * s + rand(-3, 3), life: 30, size: rand(1.2, 3) * s });
            if (Math.random() < 0.3) Sea.water.splash(this.x, this.y, 16 * s, -0.3);
          }
        }
      },
      under(c) {
        if (this.z > 8) return;
        c.save();
        c.translate(this.x + 2, this.y + 4); c.rotate(this.yaw); c.scale(s, s);
        c.fillStyle = 'rgba(8,22,44,.4)';
        if (kit.outline) c.fill(kit.outline());
        else { c.beginPath(); c.ellipse(0, 0, 20, 15, 0, 0, 6.283); c.fill(); }
        c.restore();
      },
      shadow(c) { if (this.z > 4) Sea.scene.blobShadow(c, this.x, this.y, this.yaw, 40 * s, 10 * s, 0.2); },
      draw(S) { S.mesh(model, { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, roll: this.roll, s }, { deform: kit.flex(this.phase) }); },
      over(c) { nameTag(c, this, this.y + 26 * s); }
    };
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

  // anything lost (a ship sunk) is replaced a few seconds later, the whole company sailing in again
  let watch = 0;
  function check() {
    if (!Sea.active || Sea.paused || !group.length) return;
    if (!respawn && group.some((m) => m.dead)) respawn = performance.now() + 8000;
    if (respawn && performance.now() > respawn) { respawn = 0; launch(); }
  }

  const onMove = () => { moved = performance.now(); };
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
      sig = '';
      window.addEventListener('pointermove', onMove, { passive: true, capture: true });
      window.addEventListener('pointerdown', onDown, { passive: true, capture: true });
      watch = setInterval(check, 1000);
    },
    stop() {
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('pointerdown', onDown, { capture: true });
      clearInterval(watch);
      group = []; sig = ''; respawn = 0;
    },
    // rebuild only when the design itself changed, not on every settings change
    onSettings(s) {
      const next = JSON.stringify(s.mate || {});
      if (next === sig) return;
      sig = next; respawn = 0;
      launch();
    }
  });
})();
