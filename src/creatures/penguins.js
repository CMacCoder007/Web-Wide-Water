// Ice caps with penguins, in The Frozen South. One to three caps of different
// sizes drift across, with a huddle of penguins standing on each. Every so
// often some of them waddle to the edge and dive off. In the water they are
// quick: they porpoise in little leaps, chase krill, then shoot back out onto
// the ice. Leopard seals and orcas hunt the swimmers; a penguin that sees one
// coming makes for the ice, where it is safe.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;
  const BACK = [28, 30, 38], FRONT = [244, 246, 248], BEAK = [240, 150, 40];

  // built lying down, nose to +x, like every swimmer; stood up by pitching it
  function build() {
    const b = new Sea.models.Builder();
    b.tube([[-8, 1.5, 1.5], [-4, 4, 3.6], [2, 4.6, 4], [7, 3.4, 3.2], [10, 2.6, 2.6], [12.5, 1, 1]], 6, (x, y, z, h) => (z < -h * 0.1 && x < 9 ? FRONT : BACK));
    b.face([b.vert(12, 0, 0.5), b.vert(16, 0, 0), b.vert(12, 0, -0.8)], BEAK, true);
    for (const sd of [-1, 1]) b.face([b.vert(4, sd * 4, 0), b.vert(-3, sd * 8, -1), b.vert(-2, sd * 4, 0)], BACK, true);   // flippers
    return b.mesh();
  }

  function cap(r) {
    const b = new Sea.models.Builder(), outline = [];
    for (let k = 0, m = 9; k < m; k++) { const a = (k / m) * 6.283, q = r * rand(0.75, 1.05); outline.push([Math.cos(a) * q, Math.sin(a) * q * 0.82]); }
    outline.reverse();
    b.loft(outline, [{ z: -14, k: 0.8, kx: 0.8, c: [140, 196, 226] }, { z: 0, k: 1, c: [166, 212, 236] }, { z: 6, k: 0.93, kx: 0.93, c: [214, 236, 248] }], [248, 252, 255]);
    if (r > 60) b.blob(-r * 0.3, r * 0.1, 12, r * 0.28, r * 0.22, 12, (z) => (z > 14 ? [250, 253, 255] : [200, 228, 244]), 3, 6);   // a hummock on the big ones
    return b.mesh();
  }

  function spawn() {
    const model = Sea.models.once('penguin', build);
    const start = Sea.world.entry(170);
    const vel = { x: Math.cos(start.yaw) * 0.2, y: Math.sin(start.yaw) * 0.2 };
    const caps = [], birds = [];
    for (let i = 0, n = 1 + Math.floor(rand(0, 3)); i < n; i++) {
      const r = [rand(34, 46), rand(52, 70), rand(78, 100)][Math.floor(rand(0, 3))];      // small, middling or large
      const c = { x: start.x + rand(-190, 190), y: start.y + rand(-190, 190), r, yaw: rand(0, 6), mesh: cap(r), ph: rand(0, 6) };
      c.ob = { x: c.x, y: c.y, r: r * 0.9 };
      Sea.world.obstacles.add(c.ob);
      caps.push(c);
      for (let j = 0, m = Math.round(r / 11) + Math.floor(rand(0, 3)); j < m; j++) {
        const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * r * 0.55;
        birds.push({ cap: c, ox: Math.cos(a) * d, oy: Math.sin(a) * d * 0.8, x: 0, y: 0, z: 6, yaw: rand(0, 6), pitch: 1.35, s: rand(0.95, 1.25), state: 'stand', st: rand(0, 20), wait: rand(4, 26), ph: rand(0, 6), swim: 0, leap: -1 });
      }
    }
    // only the ones in the water can be caught
    const g = {
      kind: 'penguin', x: start.x, y: start.y, r: 60, count: 0,
      take(n, x, y) {
        const wet = birds.filter((p) => p.state === 'swim');
        if (!wet.length) return 0;
        let best = wet[0], bd = 1e9;
        if (x != null) for (const p of wet) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
        birds.splice(birds.indexOf(best), 1);
        Sea.water.splash(best.x, best.y, 36, -2.2);
        Sea.scene.emit({ k: 'ring', x: best.x, y: best.y, life: 36, size: 6, grow: 44 });
        Sea.scene.burst('spray', best.x, best.y, 3, 14, { speed: 2.2, up: 4, life: 40, size: 2.2 });
        return 1;
      },
      herd() {}
    };
    Sea.eco.groups.add(g);
    let age = 0, hurry = 1, ph = 0;
    const flex = (v) => (v[0] >= 0 ? v : [v[0], v[1], v[2] + Math.sin(ph - v[0] * 0.3) * 1.6 * (v[0] / -8)]);

    return {
      update(t, dt) {
        const k = dt * 60;
        age += dt;
        for (const c of caps) { c.x += vel.x * hurry * k; c.y += vel.y * hurry * k; c.ob.x = c.x; c.ob.y = c.y; }
        let wx = 0, wy = 0, wet = 0;
        for (const p of birds) {
          const c = p.cap;
          p.st += dt;
          if (p.state === 'stand') {
            // shuffles about a little, then decides to go in
            p.x = c.x + p.ox; p.y = c.y + p.oy; p.z = 6; p.pitch = 1.35 + Math.sin(t * 3 + p.ph) * 0.05;
            p.yaw += Math.sin(t * 0.7 + p.ph) * 0.004 * k;
            if (p.st > p.wait && hurry === 1 && !Sea.world.gone(c.x, c.y, -20)) {
              p.state = 'dive'; p.st = 0;
              const a = Math.atan2(p.oy, p.ox) + rand(-0.5, 0.5);
              p.yaw = a; p.from = [p.x, p.y]; p.to = [c.x + Math.cos(a) * (c.r + 16), c.y + Math.sin(a) * (c.r + 16) * 0.82];
            }
          } else if (p.state === 'dive') {
            // a run, a hop, and in head first
            const u = Math.min(1, p.st / 0.8);
            p.x = p.from[0] + (p.to[0] - p.from[0]) * u; p.y = p.from[1] + (p.to[1] - p.from[1]) * u;
            p.z = 6 + Math.sin(Math.PI * u) * 12 - u * u * 12;
            p.pitch = 1.35 - u * 2.1;
            if (u >= 1) {
              p.state = 'swim'; p.st = 0; p.swim = rand(9, 20); p.z = -5; p.pitch = 0;
              Sea.water.splash(p.x, p.y, 14, -1.1);
              Sea.scene.emit({ k: 'ring', x: p.x, y: p.y, life: 24, size: 2, grow: 16 });
              Sea.scene.burst('spray', p.x, p.y, 2, 4, { speed: 1, up: 2.4, life: 24, size: 1.4 });
            }
          } else if (p.state === 'swim') {
            let near = null, nd = 240;
            for (const h of Sea.eco.hunters) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < nd) { nd = d; near = h; } }
            const home = Math.atan2(c.y - p.y, c.x - p.x), dHome = Math.hypot(c.x - p.x, c.y - p.y);
            let want, speed = 2.6;
            if (near || p.st > p.swim || hurry > 1) { want = home; speed = near ? 4.2 : 3; }       // back to the ice
            else {
              const kr = Sea.eco.find(['krill'], p.x, p.y, 380);
              if (kr) { want = Math.atan2(kr.y - p.y, kr.x - p.x) + Math.sin(t * 2 + p.ph) * 0.6; if (Math.hypot(kr.x - p.x, kr.y - p.y) < kr.r * 0.7 && Math.random() < 0.02 * k) kr.take(2); }
              else want = home + 1.3 + Math.sin(t * 0.8 + p.ph) * 0.7;                             // loops round the cap
              if (dHome > 260) want = home;
            }
            p.yaw += clamp(turn(p.yaw, want), -0.09, 0.09) * k;
            p.x += Math.cos(p.yaw) * speed * k; p.y += Math.sin(p.yaw) * speed * k;
            // porpoising
            if (p.leap >= 0) {
              p.leap += dt / 0.45;
              const u = Math.min(1, p.leap);
              p.z = -5 + Math.sin(Math.PI * u) * 13; p.pitch = Math.cos(Math.PI * u) * 0.7;
              if (u >= 1) { p.leap = -1; p.z = -5; p.pitch = 0; Sea.scene.emit({ k: 'ring', x: p.x, y: p.y, life: 18, size: 2, grow: 10 }); }
            } else if (Math.random() < 0.035 * k) p.leap = 0;
            if ((near || p.st > p.swim || hurry > 1) && dHome < c.r + 20 && hurry === 1) {
              // out it comes, like a cork
              p.state = 'land'; p.st = 0; p.from = [p.x, p.y];
              const a = Math.atan2(p.y - c.y, p.x - c.x), d = rand(0.1, 0.5) * c.r;
              p.ox = Math.cos(a) * d; p.oy = Math.sin(a) * d * 0.8;
              Sea.water.splash(p.x, p.y, 14, 1);
            }
            wx += p.x; wy += p.y; wet++;
          } else {
            const u = Math.min(1, p.st / 0.6), tx = c.x + p.ox, ty = c.y + p.oy;
            p.x = p.from[0] + (tx - p.from[0]) * u; p.y = p.from[1] + (ty - p.from[1]) * u;
            p.z = -5 + u * 11 + Math.sin(Math.PI * u) * 16;
            p.pitch = 0.7 + u * 0.65;
            if (u >= 1) { p.state = 'stand'; p.st = 0; p.wait = rand(8, 30); }
          }
        }
        g.count = wet;
        if (wet) { g.x = wx / wet; g.y = wy / wet; }
        if (age > 10 && caps.every((c) => Sea.world.gone(c.x, c.y, 140))) {
          this.dead = true;
          for (const c of caps) Sea.world.obstacles.delete(c.ob);
          Sea.eco.groups.delete(g);
        }
      },
      under(c) {
        c.fillStyle = 'rgba(150,205,230,.28)';     // the bulk of the ice below the waterline
        for (const f of caps) { c.beginPath(); c.ellipse(f.x + 3, f.y + 6, f.r * 1.12, f.r * 0.92, f.yaw, 0, 6.283); c.fill(); }
        c.fillStyle = 'rgba(10,20,36,.4)';         // and the swimmers
        for (const p of birds) {
          if (p.state !== 'swim' || p.z > 0) continue;
          c.save(); c.translate(p.x + 1, p.y + 2); c.rotate(p.yaw);
          c.beginPath(); c.ellipse(0, 0, 11 * p.s, 4.4 * p.s, 0, 0, 6.283); c.fill();
          c.restore();
        }
      },
      draw(S, t) {
        for (const f of caps) {
          if (Sea.world.gone(f.x, f.y, 120)) continue;
          S.mesh(f.mesh, { x: f.x, y: f.y, z: Math.sin(t * 0.8 + f.ph) * 0.8 - Sea.water.heightAt(f.x, f.y) * 2, yaw: f.yaw });
        }
        for (const p of birds) {
          if (Sea.world.gone(p.x, p.y, 30) || (p.state === 'swim' && p.z < -3)) continue;
          ph = t * 14 + p.ph;
          // bias: a penguin standing on the ice is always drawn over the ice
          S.mesh(model, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, s: p.s }, { deform: p.state === 'swim' ? flex : null, clip: p.state === 'swim', bias: 40 });
        }
      },
      leave() { hurry = 6; }
    };
  }

  Sea.creature({ id: 'penguins', name: 'Penguins on ice', kind: 'ambient', regions: ['south'], eats: ['krill'], weight: 3.4, max: 2, cooldown: 30, spawn });
})();
