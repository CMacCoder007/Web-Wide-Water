// Ships. Two things register here:
//
//   "Ships"       a single ship of any flag sails across the page and off again.
//                 It minds its own business.
//   "Sea battle"  pirates and the navy arrive together and fight: they circle,
//                 fire broadsides, and a ship that takes three hits explodes,
//                 breaks in two and goes down. Pirates will also fire on any
//                 merchant that happens to be passing, and the merchant runs.
//
// Cannonballs that miss land on your page. In mischief mode each one blows a few
// letters off the text (they grow back); otherwise it is only a splash.
//
//   Sea.ships.afloat()    ships on the page that a monster could take an interest in
//   ship.sinkBy(who)      break it and send it down (the kraken and megalodon use this)
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, pick, clamp, turn } = Sea.util;

  const RANGE = 340;      // gun range, px
  const SIZE = 1.15;
  // 'ghost' is the Flying Dutchman (src/creatures/dutchman.js): the navy will always stand against it
  const HOSTILE = { pirate: ['navy', 'merchant'], navy: ['ghost', 'pirate'], merchant: [] };
  const FLEETS = {
    pirate: { hull: [52, 34, 24], trim: [150, 30, 36], deck: [120, 86, 54], sail: [40, 40, 48], flag: [20, 20, 24] },
    navy: { hull: [112, 74, 40], trim: [226, 186, 92], deck: [176, 134, 86], sail: [246, 240, 224], flag: [38, 86, 200] },
    merchant: { hull: [150, 112, 72], trim: [72, 138, 96], deck: [196, 160, 112], sail: [224, 196, 148], flag: [60, 160, 96] }
  };
  const WOOD = [72, 46, 26], IRON = [34, 34, 40];

  let ships = [];

  // ---------- model: two halves, so it can break ----------
  function sail(b, x, zLo, zHi, half, colour) {
    // two panels meeting in a shallow V: a low-poly billow
    const belly = 5;
    const quad = (y0, y1, x0, x1) => b.face([b.vert(x + x0, y0, zLo), b.vert(x + x1, y1, zLo), b.vert(x + x1 * 0.8, y1 * 0.86, zHi), b.vert(x + x0 * 0.8, y0 * 0.86, zHi)], colour, true);
    quad(-half, 0, 0, belly);
    quad(0, half, belly, 0);
  }

  // an emblem on the mainsail: 'cross' or 'skull' (drawn just proud of the canvas)
  function emblem(b, kind, x, z, colour) {
    const q = (y0, y1, z0, z1, c) => b.face([b.vert(x, y0, z0), b.vert(x, y1, z0), b.vert(x, y1, z1), b.vert(x, y0, z1)], c, true);
    if (kind === 'cross') { q(-1.6, 1.6, z - 8, z + 8, colour); q(-7, 7, z + 1, z + 4.4, colour); }
    else if (kind === 'skull') {
      b.face([[-5, z + 6], [5, z + 6], [6.5, z], [3, z - 6], [-3, z - 6], [-6.5, z]].map(([y, zz]) => b.vert(x, y, zz)), colour, true);
      q(-4, -1.2, z, z + 3, [20, 20, 24]); q(1.2, 4, z, z + 3, [20, 20, 24]);
    }
  }

  // f: colours { hull, trim, deck, sail, flag }, and optionally masts (1-3), emblem, mark (emblem colour),
  // stripes (true = every other sail in the trim colour)
  function half(f, front) {
    const b = new Sea.models.Builder();
    const masts = f.masts || 2, alt = f.stripes ? f.trim : f.sail;
    const outline = front
      ? [[0, 14], [20, 12.5], [36, 7], [47, 0], [36, -7], [20, -12.5], [0, -14]]
      : [[-44, 9], [-40, 12], [-18, 14], [0, 14], [0, -14], [-18, -14], [-40, -12], [-44, -9]];
    b.loft(outline, [
      { z: -5, k: 0.5, c: f.hull }, { z: 2, k: 0.94, c: f.hull }, { z: 5, k: 1, c: f.trim }, { z: 8, k: 1, c: f.hull }
    ], f.deck);
    if (front) {
      b.box(24, 37, -6, 6, 8, 11, f.hull, f.deck);            // forecastle
      b.box(46, 60, -0.9, 0.9, 8, 10, WOOD);                  // bowsprit
      if (masts >= 2) {
        b.box(13, 15.4, -1.2, 1.2, 8, 52, WOOD);              // foremast
        sail(b, 15, 16, 34, 17, f.sail);
        sail(b, 15, 36, 49, 12, alt);
        b.face([b.vert(47, 0, 10), b.vert(59, 0, 10), b.vert(16, 0, 44)], f.sail, true);   // jib
      } else {
        b.face([b.vert(47, 0, 10), b.vert(59, 0, 10), b.vert(-12, 0, 50)], f.sail, true);  // one long jib to the mainmast
      }
      for (const x of [6, 20]) for (const y of [-13, 13]) b.box(x, x + 5, y - 2, y + 2, 8, 10.5, IRON);
    } else {
      b.box(-43, -24, -11, 11, 8, 14, f.hull, f.deck);        // stern castle
      b.box(-43, -40, -9, 9, 14, 17, f.trim);                 // taffrail
      b.box(-45, -43, -2, 2, 15, 20, [255, 214, 120]);        // stern lantern
      b.box(-17, -14.6, -1.2, 1.2, 8, 58, WOOD);              // mainmast
      b.box(-18.5, -13, -2.6, 2.6, 46, 48, WOOD);             // crow's nest
      sail(b, -15, 16, 38, 19, f.sail);
      sail(b, -15, 40, 54, 13, alt);
      if (f.emblem && f.emblem !== 'none') emblem(b, f.emblem, -9, 27, f.mark || f.flag);
      if (masts >= 3) {                                       // mizzen, on the stern castle
        b.box(-35, -33, -1, 1, 14, 46, WOOD);
        sail(b, -33, 20, 40, 11, alt);
      }
      b.face([b.vert(-16, 0, 58), b.vert(-16, 0, 66), b.vert(-30, 0, 62)], f.flag, true); // flag
      for (const x of [-12, -24]) for (const y of [-13, 13]) b.box(x, x + 5, y - 2, y + 2, 8, 10.5, IRON);
    }
    return b.mesh();
  }
  const model = (kind) => Sea.models.once('ship-' + kind, () => ({ bow: half(FLEETS[kind], true), stern: half(FLEETS[kind], false) }));
  const ball = () => Sea.models.once('cannonball', () => {
    const b = new Sea.models.Builder();
    b.blob(0, 0, 0, 3.4, 3.4, 3.4, [38, 38, 44], 2, 5);
    return b.mesh();
  });

  // ---------- cannonball ----------
  function fire(from, at, side) {
    if (!from.afloat) return;
    const hit = Math.random() < (from.aim || 0.28);       // a ship may be a better or worse shot
    let tx = at.x, ty = at.y;
    if (!hit) { const a = rand(0, 6.283), d = rand(55, 150); tx += Math.cos(a) * d; ty += Math.sin(a) * d; }
    // leaves from the gun deck on the side facing the enemy
    const beam = 12 * (from.size || SIZE);
    const sx = from.x - Math.sin(from.yaw) * side * beam, sy = from.y + Math.cos(from.yaw) * side * beam;
    const T = Math.max(34, Math.hypot(tx - sx, ty - sy) / 5.2);
    Sea.scene.add({
      t: 0, x: sx, y: sy, z: 10,
      update(_, dt) {
        this.t += dt * 60;
        const p = Math.min(1, this.t / T);
        this.x = sx + (tx - sx) * p; this.y = sy + (ty - sy) * p;
        this.z = 10 + Math.sin(Math.PI * p) * (30 + T * 0.5);
        if (p >= 1) { this.dead = true; land(tx, ty, hit ? at : null, from); }
      },
      shadow(c) { Sea.scene.blobShadow(c, this.x - 4, this.y - 4, 0, 4, 3, 0.3); },
      draw(S) { S.mesh(ball(), { x: this.x, y: this.y, z: this.z, yaw: this.t * 0.3 }, { clip: false }); }
    });
    // muzzle: flash, smoke, recoil
    Sea.scene.burst('fire', sx, sy, 10, 4, { speed: 1.2, up: 0.6, life: 12, size: 4, colours: [[255, 210, 90], [255, 150, 40]] });
    Sea.scene.burst('smoke', sx, sy, 11, 4, { speed: 0.7, up: 0.5, life: 46, size: 5, c: [235, 235, 235] });
    Sea.water.splash(from.x, from.y, 22, -0.9);
    from.kick = -side * 0.22;
  }

  function land(x, y, target, from) {
    if (target && target.afloat && Math.hypot(target.x - x, target.y - y) < 48) {
      target.hp--;
      target.kick = (Math.random() < 0.5 ? 1 : -1) * 0.35;
      Sea.scene.burst('chunk', target.x, target.y, 12, 9, { speed: 2.2, up: 4, life: 60, size: 3, colours: [[92, 60, 34], [140, 100, 60], [60, 40, 24]], floats: true });
      Sea.scene.burst('fire', target.x, target.y, 14, 6, { speed: 1, up: 1.2, life: 22, size: 6, colours: [[255, 200, 70], [255, 120, 30]] });
      Sea.water.splash(target.x, target.y, 30, -1.4);
      if (target.hp <= 0) sink(target);
      return;
    }
    // missed: it lands on the page
    Sea.water.splash(x, y, 38, -2.2);
    Sea.scene.emit({ k: 'ring', x, y, life: 34, size: 6, grow: 46 });
    Sea.scene.burst('spray', x, y, 2, 10, { speed: 1.6, up: 4.2, life: 40, size: 2.6 });
    for (let k = 0; k < 4; k++) Sea.page.knockAt(x + rand(-22, 22), y + rand(-14, 14));   // refuses unless mischief is on
  }

  // ---------- wreck: the two halves going down ----------
  function wreck(ship) {
    const m = ship.model || model(ship.kind);
    const fx = Math.cos(ship.yaw), fy = Math.sin(ship.yaw);
    const piece = (mesh, sign) => ({
      mesh, x: ship.x, y: ship.y, z: 0, yaw: ship.yaw, pitch: 0, roll: ship.roll, s: ship.size || SIZE,
      vx: fx * sign * 0.5 + ship.vx * 0.4, vy: fy * sign * 0.5 + ship.vy * 0.4, vyaw: rand(-0.006, 0.006) + sign * 0.004
    });
    const bow = piece(m.bow, 1), stern = piece(m.stern, -1);
    let age = 0, tick = 0;

    // the moment it breaks
    Sea.scene.burst('chunk', ship.x, ship.y, 10, 26, { speed: 3.4, up: 5.5, life: 80, size: 3.6, colours: [[92, 60, 34], [140, 100, 60], [60, 40, 24], [230, 220, 200]], floats: true });
    Sea.scene.burst('fire', ship.x, ship.y, 12, 16, { speed: 2, up: 2, life: 30, size: 9, colours: [[255, 220, 110], [255, 140, 40], [255, 80, 30]] });
    Sea.scene.burst('smoke', ship.x, ship.y, 16, 10, { speed: 0.9, up: 0.9, life: 110, size: 8, colours: [[60, 60, 64], [96, 96, 100]] });
    Sea.scene.emit({ k: 'ring', x: ship.x, y: ship.y, life: 50, size: 12, grow: 90 });
    Sea.water.splash(ship.x, ship.y, 60, -3);

    Sea.scene.add({
      update(_, dt) {
        const k = dt * 60;
        age += k; tick += k;
        const u = Math.min(1, age / 230), ease = u * u * (3 - 2 * u);
        for (const h of [bow, stern]) {
          h.x += h.vx * k; h.y += h.vy * k; h.vx *= 0.985; h.vy *= 0.985; h.yaw += h.vyaw * k;
        }
        // the bow rears up and slides under stern-first; the stern rolls onto its side
        bow.pitch = ease * 1.15;
        bow.z = -ease * ease * 78;
        stern.roll = ship.roll + ease * 1.35 * (ship.roll >= 0 ? 1 : -1);
        stern.pitch = -ease * 0.5;
        stern.z = -Math.max(0, u - 0.15) * 74;
        if (tick >= 6 && age < 250) {
          tick = 0;
          const h = Math.random() < 0.5 ? bow : stern;
          Sea.scene.emit({ k: 'ring', x: h.x + rand(-22, 22), y: h.y + rand(-16, 16), life: 30, size: 3, grow: 22 });
          Sea.water.splash(h.x + rand(-24, 24), h.y + rand(-16, 16), 14, rand(-0.8, 0.5));
          if (age < 110) Sea.scene.emit({ k: 'smoke', x: stern.x, y: stern.y, z: 18, vz: 0.9, vx: 0.2, life: 90, size: 7, c: [70, 70, 74] });
        }
        if (age > 270) this.dead = true;
      },
      draw(S) { for (const h of [bow, stern]) S.mesh(h.mesh, h); }
    });
  }

  function sink(ship) {
    if (!ship.afloat) return;
    if (ship.onSunk) { ship.onSunk(); return; }      // a ship that goes down in its own way (the ghost ship)
    ship.afloat = false; ship.dead = true;
    ships = ships.filter((s) => s !== ship);
    wreck(ship);
  }

  // ---------- collisions ----------
  // Ships are solid: they cannot sail through ice, or through each other. Call once a
  // frame for each ship, after it has moved.
  //   Ice: the ship is stopped and shoved back, there is a crunch, chips of ice fly,
  //        and a ship that was moving at any speed takes a hit (at most one every few
  //        seconds). Three hits and it founders, like any other damage. The user's own
  //        ships are only damaged in mischief mode; the ghost ship never is.
  //   Each other: the two are pushed apart and rock, with no damage.
  function bump(ship) {
    if (!ship.afloat) return;
    const size = ship.size || SIZE, r = 24 * size, now = performance.now();
    const hit = Sea.world.collide(ship.x, ship.y, r);
    if (hit) {
      const into = -(ship.vx * hit.nx + ship.vy * hit.ny);       // how hard it was heading in
      ship.x = hit.x; ship.y = hit.y;
      ship.speed *= 0.55;
      // glance off: turn away from the ice rather than grinding against it
      const side = Math.cos(ship.yaw) * hit.ny - Math.sin(ship.yaw) * hit.nx;
      ship.yaw += (side > 0 ? 0.03 : -0.03);
      if (into > 0.25 && now - (ship.struck || 0) > 3500) {
        ship.struck = now;
        ship.kick = (side > 0 ? 1 : -1) * 0.4;
        const cx = ship.x - hit.nx * r, cy = ship.y - hit.ny * r;
        Sea.water.splash(cx, cy, 36, -2);
        Sea.scene.emit({ k: 'ring', x: cx, y: cy, life: 34, size: 5, grow: 40 });
        Sea.scene.burst('chunk', cx, cy, 6, 10, { speed: 2, up: 3.6, life: 50, size: 2.6, colours: [[236, 246, 252], [200, 228, 244]] });
        Sea.scene.burst('spray', cx, cy, 3, 10, { speed: 1.8, up: 3.6, life: 36, size: 2.2 });
        const spared = ship.kind === 'ghost' || (ship.kind === 'player' && !Sea.settings.mischief);
        if (!spared && --ship.hp <= 0) { sink(ship); return; }
      }
    }
    for (const o of ships) {
      if (o === ship || !o.afloat) continue;
      const dx = ship.x - o.x, dy = ship.y - o.y, d = Math.hypot(dx, dy), min = 22 * size + 22 * (o.size || SIZE);
      if (d >= min || d < 0.01) continue;
      // the heavier ship gives less ground
      const mine = (o.size || SIZE) / (size + (o.size || SIZE)), push = min - d;
      ship.x += (dx / d) * push * mine; ship.y += (dy / d) * push * mine;
      o.x -= (dx / d) * push * (1 - mine); o.y -= (dy / d) * push * (1 - mine);
      if (now - (ship.rubbed || 0) > 1500) {
        ship.rubbed = o.rubbed = now;
        ship.kick = 0.22; o.kick = -0.22;
        Sea.water.splash((ship.x + o.x) / 2, (ship.y + o.y) / 2, 26, -1.2);
        Sea.scene.burst('chunk', (ship.x + o.x) / 2, (ship.y + o.y) / 2, 8, 4, { speed: 1.4, up: 3, life: 40, size: 2, colours: [[92, 60, 34], [140, 100, 60]], floats: true });
      }
    }
  }

  function nearest(me, kinds, far) {
    let best = null;
    for (const s of ships) {
      // pirates will also go for the user's own ship, but only in mischief mode
      const fair = kinds.includes(s.kind) || (s.kind === 'player' && me.kind === 'pirate' && Sea.settings.mischief);
      if (s === me || !s.afloat || !fair) continue;
      const d = Math.hypot(s.x - me.x, s.y - me.y);
      if ((far || d < 560) && (!best || d < best.d)) best = { s, d };
    }
    return best;
  }

  // ---------- a ship ----------
  // fighting = true: it came for a battle. Otherwise it only wants to cross the page.
  function makeShip(kind, fighting) {
    const start = Sea.world.entry(90);
    const m = model(kind);
    const ship = {
      kind, fighting, x: start.x, y: start.y, vx: 0, vy: 0, yaw: start.yaw, course: start.yaw,
      roll: 0, kick: 0, speed: 0, hp: 3, afloat: true, reload: rand(2.5, 5), life: fighting ? rand(45, 70) : 999,
      orbit: Math.random() < 0.5 ? 1 : -1, ph: rand(0, 10), age: 0, quiet: 0, wakeT: 0, wakeN: 0, leaving: false, dead: false,
      sinkBy() { sink(this); },

      update(t, dt) {
        const k = dt * 60, vw = innerWidth, vh = innerHeight;
        this.age += dt;
        if ((this.life -= dt) <= 0) this.leaving = true;
        const enemy = this.fighting && !this.leaving ? nearest(this, HOSTILE[this.kind], true) : null;
        const hunter = this.kind === 'merchant' ? nearest(this, ['pirate'], true) : null;
        const chased = hunter && hunter.s.fighting && hunter.d < 300;
        // a warship with nobody left to fight goes home
        if (this.fighting && !enemy && !this.leaving && this.age > 10 && (this.quiet += dt) > 6) this.leaving = true;
        if (enemy) this.quiet = 0;

        let want = this.course;
        // an honest ship that sights a castaway goes to pick him up (pirates sail on by)
        const lost = !this.fighting && this.kind !== 'pirate' && Sea.castaway && !Sea.castaway.saved ? Sea.castaway : null;
        if (lost && !Sea.world.gone(lost.x, lost.y, 40)) {
          want = Math.atan2(lost.y - this.y, lost.x - this.x);
          if (Math.hypot(lost.x - this.x, lost.y - this.y) < 62) lost.rescue(this);
        }
        if (this.leaving) want = Math.atan2(this.y - vh / 2, this.x - vw / 2);            // straight out
        else if (chased) want = Math.atan2(this.y - hunter.s.y, this.x - hunter.s.x);     // run away
        else if (enemy) {
          const bearing = Math.atan2(enemy.s.y - this.y, enemy.s.x - this.x);
          // close in, then turn side-on and circle so the guns bear
          want = enemy.d > 220 ? bearing + 0.45 * this.orbit : bearing + (Math.PI / 2) * this.orbit;
        } else if (this.fighting) want = Math.atan2(vh / 2 - this.y, vw / 2 - this.x);
        // warships stay on the page while there is a fight
        const edge = 70;
        if (this.fighting && !this.leaving && (this.x < edge || this.x > vw - edge || this.y < edge || this.y > vh - edge)) {
          want = Math.atan2(vh / 2 - this.y, vw / 2 - this.x);
        }
        const tn = clamp(turn(this.yaw, want), -0.017, 0.017) + Sea.world.avoid(this.x, this.y, this.yaw, 90, true) * 0.6;
        this.yaw += tn * k;
        this.speed += ((this.leaving ? 1.6 : chased ? 1.5 : 1.0) - this.speed) * 0.03 * k;
        this.vx = Math.cos(this.yaw) * this.speed; this.vy = Math.sin(this.yaw) * this.speed;
        this.x += this.vx * k; this.y += this.vy * k;
        bump(this);
        if (!this.afloat) return;      // it struck ice and went down

        // heel into the turn, rock on the swell and from recoil
        const sl = Sea.water.slopeAt(this.x, this.y);
        this.kick *= Math.pow(0.93, k);
        const lean = tn * 9 + Math.sin(t * 1.3 + this.ph) * 0.05 + this.kick +
          clamp((-sl.x * Math.sin(this.yaw) + sl.y * Math.cos(this.yaw)) * 0.5, -0.25, 0.25);
        this.roll += (lean - this.roll) * 0.15 * k;

        // a broadside when the enemy is in range and off the beam
        this.reload -= dt;
        if (enemy && enemy.d < RANGE && this.reload <= 0 && this.kind !== 'merchant') {
          const abeam = Math.sin(turn(this.yaw, Math.atan2(enemy.s.y - this.y, enemy.s.x - this.x)));
          if (Math.abs(abeam) > 0.45) {
            const side = abeam > 0 ? 1 : -1, foe = enemy.s;
            fire(this, foe, side);
            setTimeout(() => { if (this.afloat && foe.afloat && Sea.active) fire(this, foe, side); }, 170);
            this.reload = rand(3.2, 5);
          } else this.reload = 0.3;
        }

        // wake, and smoke when badly hurt
        this.wakeT += dt;
        if (this.wakeT > 0.07 && !Sea.world.gone(this.x, this.y, 40)) {
          this.wakeT = 0;
          const bx = this.x - Math.cos(this.yaw) * 44, by = this.y - Math.sin(this.yaw) * 44;
          Sea.scene.emit({ k: 'foam', x: bx + rand(-7, 7), y: by + rand(-7, 7), life: 46, size: rand(2.5, 5) });
          if (++this.wakeN % 4 === 0) Sea.water.splash(bx, by, 12, -0.3);
          if (this.hp === 1 && this.wakeN % 2 === 0) {
            Sea.scene.emit({ k: 'smoke', x: this.x, y: this.y, z: 16, vz: 0.8, vx: 0.25, life: 70, size: 5, c: [60, 60, 64] });
            if (this.wakeN % 4 === 0) Sea.scene.emit({ k: 'fire', x: this.x + rand(-8, 8), y: this.y + rand(-5, 5), z: 12, vz: 0.6, life: 18, size: 5, c: [255, 150, 40] });
          }
        }

        if (this.age > 6 && Sea.world.gone(this.x, this.y, 170) && (this.leaving || !this.fighting)) {
          this.dead = true; this.afloat = false;
          ships = ships.filter((s) => s !== this);
        }
      },

      shadow(c) { Sea.scene.blobShadow(c, this.x, this.y, this.yaw, 46 * SIZE, 15 * SIZE, 0.28); },

      draw(S, t) {
        if (Sea.world.gone(this.x, this.y, 120)) return;
        const bob = Math.sin(t * 1.6 + this.ph) * 0.9 - Sea.water.heightAt(this.x, this.y) * 2.5;
        const pose = { x: this.x, y: this.y, z: bob, yaw: this.yaw, roll: this.roll, pitch: Math.sin(t * 1.1 + this.ph) * 0.03, s: SIZE };
        S.mesh(m.stern, pose);
        S.mesh(m.bow, pose);
      }
    };
    ships.push(ship);
    return ship;
  }

  // one entity for the director, however many ships came together
  function group(list) {
    return {
      update(t, dt) {
        let alive = 0;
        for (const s of list) { if (!s.dead) s.update(t, dt); if (!s.dead) alive++; }
        if (!alive) this.dead = true;
      },
      shadow(c) { for (const s of list) if (!s.dead) s.shadow(c); },
      draw(S, t) { for (const s of list) if (!s.dead) s.draw(S, t); },
      leave() { for (const s of list) s.leaving = true; }
    };
  }

  Sea.ships = {
    // ships a monster may attack: the user's own ship only counts in mischief mode
    // (and never the ghost ship, which nothing in this sea can take)
    afloat: () => ships.filter((s) => s.afloat && s.kind !== 'ghost' && !Sea.world.gone(s.x, s.y, -20) && (s.kind !== 'player' || Sea.settings.mischief)),
    get all() { return ships; },
    // for the user's own ship (src/sea/mate.js)
    build: (f) => ({ bow: half(f, true), stern: half(f, false) }),
    add(s) { if (!ships.includes(s)) ships.push(s); },
    remove(s) { ships = ships.filter((o) => o !== s); },
    fire, sink, nearest, bump,
    // bring in ships of one flag, fighting or not, as one entity (the ghost ship calls up its own opposition)
    // (the returned entity's .ships are the ships themselves, for whoever sent for them)
    muster(kind, count, fighting) {
      const list = [];
      for (let i = 0; i < count; i++) list.push(makeShip(kind, fighting));
      const g = group(list);
      g.ships = list;
      return Sea.scene.add(g);
    }
  };

  Sea.feature({ id: 'ships', stop() { for (const s of ships) { s.dead = true; s.afloat = false; } ships = []; } });

  Sea.creature({
    id: 'ship',
    name: 'Ships',
    kind: 'ambient',
    weight: 3,
    max: 3,
    cooldown: 8,
    spawn: () => group([makeShip(pick(['merchant', 'merchant', 'navy', 'pirate']), false)])
  });

  Sea.creature({
    id: 'battle',
    name: 'Sea battle',
    kind: 'event',
    weight: 1.2,
    max: 1,
    cooldown: 70,
    spawn() {
      const list = [makeShip('pirate', true), makeShip('navy', true)];
      if (Math.random() < 0.35) list.push(makeShip(pick(['pirate', 'navy']), true));
      return group(list);
    }
  });
})();
