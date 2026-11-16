// Small life: the bottom of the food web, and the background of the sea. There
// is nearly always some of this about. Everything bigger comes for it.
//
//   Krill           a pink cloud of hundreds of specks, drifting. Humpbacks and
//                   manta rays feed on it. It glows blue-green at night.
//   Sardines        a big silver school in open water. It flees from hunters and
//                   balls up tight when dolphins circle it (a bait ball).
//   Herring         the same, in the cold north.
//   Reef fish       smaller, brightly coloured schools in the tropics.
//   Jellyfish       a slow drifting bloom, pulsing. Turtles eat them. They glow at night.
//   Ice floes       slabs of drifting ice in the north that everything steers round.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, pick } = Sea.util;

  Sea.creature({
    id: 'krill', name: 'Krill', kind: 'small', regions: ['north', 'open', 'south'], weight: 2, max: 2, cooldown: 30,
    spawn: () => Sea.eco.school({
      kind: 'krill', n: 260, dots: true, size: 2, radius: rand(90, 130), speed: 0.22, alpha: 0.5,
      colours: [[236, 120, 104], [244, 150, 120]], glow: [110, 255, 225]
    })
  });

  Sea.creature({
    id: 'sardine', name: 'Sardine school', kind: 'small', regions: ['open', 'tropical'], weight: 3, max: 2, cooldown: 20,
    spawn: () => Sea.eco.school({
      kind: 'fish', n: 150, size: 5, radius: rand(70, 100), speed: 0.75, timid: true, alpha: 0.62,
      colours: [[52, 92, 132], [84, 124, 160], [40, 70, 110]]
    })
  });

  Sea.creature({
    id: 'herring', name: 'Herring school', kind: 'small', regions: ['north'], weight: 3, max: 2, cooldown: 20,
    spawn: () => Sea.eco.school({
      kind: 'fish', n: 130, size: 5.5, radius: rand(70, 95), speed: 0.65, timid: true, alpha: 0.6,
      colours: [[70, 88, 104], [100, 118, 130]]
    })
  });

  Sea.creature({
    id: 'reeffish', name: 'Reef fish', kind: 'small', regions: ['tropical'], weight: 3, max: 3, cooldown: 12,
    spawn: () => Sea.eco.school({
      kind: 'fish', n: 46, size: 6, radius: rand(40, 60), speed: 0.55, timid: true, alpha: 0.78,      colours: pick([
        [[255, 150, 30], [250, 250, 250]],             // orange and white
        [[40, 130, 255], [255, 214, 50]],              // blue and yellow
        [[250, 90, 110], [120, 60, 170]],              // pink and purple
        [[50, 190, 170], [255, 200, 60]]               // teal and gold
      ])
    })
  });

  // ---------- jellyfish ----------
  function bloom() {
    const start = Sea.world.entry(30);      // close in: the first of the bloom is on the page at once
    const drift = { x: Math.cos(start.yaw) * 0.32, y: Math.sin(start.yaw) * 0.32 };
    const tint = pick([[255, 170, 210], [200, 190, 255], [170, 220, 255]]);
    const list = [];
    for (let i = 0, n = 6 + Math.floor(rand(0, 9)); i < n; i++) {
      list.push({ x: start.x + rand(-140, 140), y: start.y + rand(-140, 140), r: rand(9, 17), ph: rand(0, 6), wob: rand(0.5, 1.2) });
    }
    const g = {
      kind: 'jelly', x: start.x, y: start.y, r: 140, count: list.length, list,
      // the eater takes the one nearest to it
      take(n, x, y) {
        if (!list.length) return 0;
        let bi = 0, bd = 1e9;
        if (x != null) list.forEach((j, i) => { const d = Math.hypot(j.x - x, j.y - y); if (d < bd) { bd = d; bi = i; } });
        const j = list.splice(bi, 1)[0];
        g.count = list.length;
        Sea.scene.emit({ k: 'ring', x: j.x, y: j.y, life: 26, size: 3, grow: 18 });
        return 1;
      },
      herd() {}
    };
    Sea.eco.groups.add(g);
    let age = 0, leaving = 1;

    return {
      update(t, dt) {
        const k = dt * 60;
        age += dt;
        let sx = 0, sy = 0;
        for (const j of list) {
          // each pulse pushes it along a little
          const pulse = Math.max(0, Math.sin(t * 1.6 * j.wob + j.ph));
          j.x += drift.x * (0.5 + pulse) * leaving * k; j.y += drift.y * (0.5 + pulse) * leaving * k;
          sx += j.x; sy += j.y;
        }
        if (list.length) { g.x = sx / list.length; g.y = sy / list.length; }
        if (!list.length || (age > 10 && list.every((j) => Sea.world.gone(j.x, j.y, 60)))) { this.dead = true; Sea.eco.groups.delete(g); }
      },
      under(c, t) {
        const night = Sea.eco.night() > 0.5;
        const col = night ? [120, 255, 235] : tint;
        const ang = Math.atan2(drift.y, drift.x);
        for (const j of list) {
          if (Sea.world.gone(j.x, j.y, 30)) continue;
          const pulse = Math.sin(t * 1.6 * j.wob + j.ph), r = j.r * (0.86 + pulse * 0.14);
          // trailing tentacles
          c.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${night ? 0.5 : 0.32})`;
          c.lineWidth = 1.2;
          c.beginPath();
          for (let q = -1; q <= 1; q++) {
            const a = ang + Math.PI + q * 0.5;
            c.moveTo(j.x + Math.cos(a) * r * 0.4, j.y + Math.sin(a) * r * 0.4);
            c.lineTo(j.x + Math.cos(a + Math.sin(t * 2 + j.ph + q) * 0.3) * r * 2.3, j.y + Math.sin(a + Math.sin(t * 2 + j.ph + q) * 0.3) * r * 2.3);
          }
          c.stroke();
          // the bell, and the ring inside it
          c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${night ? 0.5 : 0.34})`;
          c.beginPath(); c.arc(j.x, j.y, r, 0, 6.283); c.fill();
          c.strokeStyle = `rgba(255,255,255,${night ? 0.7 : 0.55})`;
          c.beginPath(); c.arc(j.x, j.y, r * 0.5, 0, 6.283); c.stroke();
        }
      },
      leave() { leaving = 5; }
    };
  }

  Sea.creature({ id: 'jellyfish', name: 'Jellyfish', kind: 'small', weight: 1.6, max: 2, cooldown: 40, spawn: bloom });

  // ---------- ice floes ----------
  function ice() {
    const start = Sea.world.entry(150);
    const vel = { x: Math.cos(start.yaw) * 0.16, y: Math.sin(start.yaw) * 0.16 };
    const floes = [];
    for (let i = 0, n = 2 + Math.floor(rand(0, 3)); i < n; i++) {
      const r = rand(34, 70), b = new Sea.models.Builder(), outline = [];
      for (let k = 0, m = 7; k < m; k++) { const a = (k / m) * 6.283, q = r * rand(0.7, 1.05); outline.push([Math.cos(a) * q, Math.sin(a) * q * 0.8]); }
      outline.reverse();
      b.loft(outline, [{ z: -10, k: 0.8, kx: 0.8, c: [150, 200, 226] }, { z: 0, k: 1, c: [170, 214, 236] }, { z: 5, k: 0.94, kx: 0.94, c: [214, 236, 246] }], [246, 251, 255]);
      const f = { x: start.x + rand(-170, 170), y: start.y + rand(-170, 170), r, yaw: rand(0, 6), spin: rand(-0.0006, 0.0006), mesh: b.mesh(), ph: rand(0, 6) };
      f.ob = { x: f.x, y: f.y, r: r * 0.9 };
      Sea.world.obstacles.add(f.ob);
      floes.push(f);
    }
    let age = 0, hurry = 1;
    return {
      update(t, dt) {
        const k = dt * 60;
        age += dt;
        for (const f of floes) {
          f.x += vel.x * hurry * k; f.y += vel.y * hurry * k; f.yaw += f.spin * k;
          f.ob.x = f.x; f.ob.y = f.y;
        }
        if (age > 10 && floes.every((f) => Sea.world.gone(f.x, f.y, 110))) {
          this.dead = true;
          for (const f of floes) Sea.world.obstacles.delete(f.ob);
        }
      },
      under(c) {
        // the pale bulk of the ice below the waterline
        c.fillStyle = 'rgba(150,205,230,.28)';
        for (const f of floes) { c.beginPath(); c.ellipse(f.x + 3, f.y + 6, f.r * 1.1, f.r * 0.9, f.yaw, 0, 6.283); c.fill(); }
      },
      draw(S, t) {
        for (const f of floes) {
          if (Sea.world.gone(f.x, f.y, 90)) continue;
          S.mesh(f.mesh, { x: f.x, y: f.y, z: Math.sin(t * 0.8 + f.ph) * 0.8 - Sea.water.heightAt(f.x, f.y) * 2, yaw: f.yaw });
        }
      },
      leave() { hurry = 6; }
    };
  }

  Sea.creature({ id: 'ice', name: 'Ice floes', kind: 'small', regions: ['north'], weight: 1.6, max: 1, cooldown: 60, spawn: ice });
})();
