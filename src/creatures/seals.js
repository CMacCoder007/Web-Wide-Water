// Seals: a small group in cold water, swimming with their backs awash and
// porpoising now and then. They chase herring. They are also what orcas come
// for: when a pod gets close the seals bolt, and a seal that is caught is gone
// in a burst of spray.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;
  const TOP = [104, 100, 96], BELLY = [176, 170, 156];
  const SECTIONS = [[-25, 1, 2], [-15, 5, 5], [0, 8, 7.5], [12, 7, 6.5], [20, 5, 5], [26, 3.6, 3.6], [30, 1.5, 1.6]];

  function build() {
    const b = new Sea.models.Builder();
    b.tube(SECTIONS, 8, (x, y, z, h) => (z < -h * 0.2 ? BELLY : TOP));
    for (const sd of [-1, 1]) {
      b.face([b.vert(-23, 0, 0), b.vert(-34, sd * 7, 0), b.vert(-29, 0, 0)], TOP, true);          // hind flippers
      b.face([b.vert(8, sd * 7, -2), b.vert(0, sd * 15, -5), b.vert(2, sd * 7, -2)], TOP, true);  // fore flippers
    }
    return b.mesh();
  }

  // o: { n, scale, hunt } lets the same animal be a leopard seal: one big one that hunts penguins
  function spawn(o = {}) {
    const model = Sea.models.once('seal', build);
    const start = Sea.world.entry(80);
    const grp = { course: start.yaw, seed: rand(0, 9), age: 0, hurry: 1 };
    const hunt = o.hunt || ['fish'], big = o.scale || 1;
    const list = [];
    for (let i = 0, n = o.n || 2 + Math.floor(rand(0, 4)); i < n; i++) {
      list.push({ x: start.x + rand(-60, 60), y: start.y + rand(-60, 60), yaw: start.yaw, s: rand(0.9, 1.25) * big, z: -4, pitch: 0.15, off: rand(-0.4, 0.4), ph: rand(0, 6), leap: -1, nextLeap: rand(2, 8), snack: rand(3, 8) });
    }
    const g = {
      kind: 'seal', x: start.x, y: start.y, r: 60, count: list.length, list,
      take(n, x, y) {
        if (!list.length) return 0;
        let bi = 0, bd = 1e9;
        if (x != null) list.forEach((m, i) => { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; bi = i; } });
        const m = list.splice(bi, 1)[0];
        g.count = list.length;
        Sea.water.splash(m.x, m.y, 50, -2.6);
        Sea.scene.emit({ k: 'ring', x: m.x, y: m.y, life: 40, size: 8, grow: 60 });
        Sea.scene.burst('spray', m.x, m.y, 3, 22, { speed: 2.6, up: 4.4, life: 44, size: 2.4 });
        return 1;
      },
      herd() {}
    };
    Sea.eco.groups.add(g);
    let ph = 0;
    const flex = (v) => (v[0] >= 0 ? v : [v[0], v[1] + Math.sin(ph - v[0] * 0.1) * 4 * (v[0] / -25) ** 2, v[2]]);

    return {
      lead: list[0],
      update(t, dt) {
        const k = dt * 60;
        grp.age += dt;
        let sx = 0, sy = 0;
        for (const m of list) {
          let want = grp.course + m.off + Math.sin(t * 0.5 + m.ph) * 0.5, speed = 1.4 * grp.hurry, rate = 0.03;
          // bolt from anything that hunts
          let near = null, nd = 280;
          for (const h of Sea.eco.hunters) { if (h === m) continue; const d = Math.hypot(h.x - m.x, h.y - m.y); if (d < nd) { nd = d; near = h; } }
          if (near) { want = Math.atan2(m.y - near.y, m.x - near.x); speed = 3; rate = 0.08; }
          else if ((m.snack -= dt) <= 0) {
            const f = Sea.eco.find(hunt, m.x, m.y, 420);
            if (f) {
              want = Math.atan2(f.y - m.y, f.x - m.x); speed = 2.6; rate = 0.06;
              if (Math.hypot(f.x - m.x, f.y - m.y) < f.r * 0.6 + 10) { f.take(1, m.x, m.y); m.snack = rand(5, 10); }
            } else m.snack = 2;
          }
          m.yaw += clamp(turn(m.yaw, want), -rate, rate) * k + Sea.world.avoid(m.x, m.y, m.yaw, 70, true) * k;
          m.x += Math.cos(m.yaw) * speed * k; m.y += Math.sin(m.yaw) * speed * k;
          m.ph += dt * (4 + speed * 2);
          if (m.leap >= 0) {
            m.leap += dt / 0.7;
            const p = Math.min(1, m.leap);
            m.z = -4 + Math.sin(Math.PI * p) * 16 * m.s; m.pitch = Math.cos(Math.PI * p) * 0.6;
            if (p >= 1) { m.leap = -1; m.nextLeap = rand(3, 9); Sea.water.splash(m.x, m.y, 18, -1); Sea.scene.emit({ k: 'ring', x: m.x, y: m.y, life: 24, size: 3, grow: 18 }); }
          } else {
            m.z += (-4 - m.z) * 0.2 * k; m.pitch += (0.15 - m.pitch) * 0.1 * k;
            if ((m.nextLeap -= dt * (near ? 3 : 1)) <= 0 && !Sea.world.gone(m.x, m.y, 0)) m.leap = 0;
            if (Math.random() < 0.05 * k) Sea.water.splash(m.x, m.y, 12, -0.25);
          }
          sx += m.x; sy += m.y;
        }
        if (list.length) { g.x = sx / list.length; g.y = sy / list.length; }
        if (!list.length || (grp.age > 8 && list.every((m) => Sea.world.gone(m.x, m.y, 100)))) { this.dead = true; Sea.eco.groups.delete(g); }
      },
      under(c) {
        c.fillStyle = 'rgba(14,26,40,.36)';
        for (const m of list) {
          if (m.z > 4 || Sea.world.gone(m.x, m.y, 40)) continue;
          c.save(); c.translate(m.x + 2, m.y + 3); c.rotate(m.yaw);
          c.beginPath(); c.ellipse(0, 0, 27 * m.s, 8 * m.s, 0, 0, 6.283); c.fill();
          c.restore();
        }
      },
      draw(S) {
        for (const m of list) {
          if (Sea.world.gone(m.x, m.y, 50)) continue;
          ph = m.ph;
          S.mesh(model, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch, s: m.s }, { deform: flex });
        }
      },
      leave() { grp.hurry = 2.4; }
    };
  }

  Sea.creature({ id: 'seal', name: 'Seals', kind: 'ambient', regions: ['north'], eats: ['fish'], weight: 2.4, max: 2, cooldown: 25, spawn: () => spawn() });

  // The leopard seal: alone, half as big again, and what penguins fear in the water.
  // (Orcas will still take it, as they take any seal.)
  Sea.creature({
    id: 'leopard', name: 'Leopard seal', kind: 'ambient', regions: ['south'], eats: ['penguin'], weight: 1.4, max: 1, cooldown: 40,
    spawn: () => { const e = spawn({ n: 1, scale: 1.6, hunt: ['penguin'] }); Sea.eco.hunters.add(e.lead); const up = e.update; e.update = function (t, dt) { up.call(this, t, dt); if (this.dead) Sea.eco.hunters.delete(e.lead); }; return e; }
  });
})();
