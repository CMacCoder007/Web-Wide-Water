// Shark: an ordinary-sized one (the megalodon's small cousin, and it borrows the
// same model). A fin and a shadow on patrol, swinging its tail. Schools of fish
// keep away from it; every so often it puts on a burst of speed, goes through a
// school and takes one or two. It never bothers you or the page.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;
  const SIZE = 0.36;

  function spawn() {
    if (!Sea.megalodonModel) return null;
    const model = Sea.megalodonModel();
    const start = Sea.world.entry(100);
    const s = SIZE * rand(0.85, 1.2);
    const sh = { x: start.x, y: start.y, yaw: start.yaw, course: start.yaw, z: -36 * s, pitch: 0, age: 0, seed: rand(0, 9), rest: rand(2, 5), charge: 0, prey: null, wake: 0, hurry: 1 };
    Sea.eco.hunters.add(sh);
    let swayT = 0;
    const swayAt = (x) => { const w = Math.max(0, (60 - x) / 210); return Math.sin(swayT - x * 0.022) * 26 * w * Math.sqrt(w); };
    const sway = (v) => [v[0], v[1] + swayAt(v[0]), v[2]];

    return {
      update(t, dt) {
        const k = dt * 60;
        sh.age += dt; sh.rest -= dt;
        let want = sh.course + Math.sin(t * 0.3 + sh.seed) * 0.5, speed = 1.3 * sh.hurry, rate = 0.014;
        if (sh.charge > 0 && sh.prey && sh.prey.count > 0) {
          sh.charge -= dt;
          const g = sh.prey, d = Math.hypot(g.x - sh.x, g.y - sh.y);
          want = Math.atan2(g.y - sh.y, g.x - sh.x); speed = 3.6; rate = 0.05;
          if (d < g.r * 0.6 + 16) {
            g.take(rand(1, 3)); sh.charge = 0; sh.rest = rand(7, 12); sh.course = sh.yaw;
            Sea.water.splash(sh.x, sh.y, 40, -1.8);
            Sea.scene.burst('spray', sh.x, sh.y, 3, 12, { speed: 2, up: 3.6, life: 36, size: 2.2 });
          }
        } else if (sh.rest <= 0 && sh.hurry === 1) {
          sh.rest = 2;
          const g = Sea.eco.find(['fish'], sh.x, sh.y, 460);
          if (g && !Sea.world.gone(g.x, g.y, -20)) { sh.prey = g; sh.charge = 4; }
        }
        // a shark will trail the user's ship for a while, a little way astern
        // (and it will circle a castaway's raft, which does him no harm but looks bad)
        const boat = sh.charge <= 0 && sh.hurry === 1 && sh.age < 40 ? (Sea.castaway && !Sea.castaway.saved ? Sea.castaway : Sea.mate && Sea.mate.pos()) : null;
        if (boat && Math.hypot(boat.x - sh.x, boat.y - sh.y) < 520) {
          want = Math.atan2(boat.y - Math.sin(boat.yaw) * 110 - sh.y, boat.x - Math.cos(boat.yaw) * 110 - sh.x); rate = 0.03;
        }
        swayT = t * (speed > 2 ? 11 : 5.5);
        sh.yaw += clamp(turn(sh.yaw, want), -rate, rate) * k + Sea.world.avoid(sh.x, sh.y, sh.yaw, 90, true) * 0.6 * k;
        const fx = Math.cos(sh.yaw), fy = Math.sin(sh.yaw);
        sh.x += fx * speed * k; sh.y += fy * speed * k;
        if ((sh.wake += dt) > 0.1 && !Sea.world.gone(sh.x, sh.y, 20)) {
          sh.wake = 0;
          Sea.scene.emit({ k: 'foam', x: sh.x - fx * 8 + rand(-2, 2), y: sh.y - fy * 8 + rand(-2, 2), life: 30, size: rand(1.2, 2.6) });
          if (Math.random() < 0.3) Sea.water.splash(sh.x, sh.y, 16, -0.3);
        }
        if (sh.age > 8 && Sea.world.gone(sh.x, sh.y, 140)) { this.dead = true; Sea.eco.hunters.delete(sh); }
      },
      under(c) {
        if (Sea.world.gone(sh.x, sh.y, 100)) return;
        const cy = Math.cos(sh.yaw), sy = Math.sin(sh.yaw);
        const pt = (x, y) => { const yy = y + swayAt(x); return [sh.x + 3 + (x * cy - yy * sy) * s, sh.y + 5 + (x * sy + yy * cy) * s]; };
        const up = [], down = [];
        for (const [x, w] of [[-196, 2], [-150, 5], [-100, 14], [-40, 28], [10, 34], [22, 86], [52, 36], [96, 27], [130, 17], [158, 0]]) { up.push(pt(x, -w)); down.push(pt(x, w)); }
        c.fillStyle = 'rgba(6,22,44,.42)';
        c.beginPath();
        c.moveTo(up[0][0], up[0][1]);
        for (const p of up) c.lineTo(p[0], p[1]);
        for (let i = down.length - 1; i >= 0; i--) c.lineTo(down[i][0], down[i][1]);
        c.closePath(); c.fill();
      },
      draw(S) {
        if (Sea.world.gone(sh.x, sh.y, 100)) return;
        const pose = { x: sh.x, y: sh.y, z: sh.z, yaw: sh.yaw, pitch: sh.pitch, s };
        S.mesh(model.body, pose, { deform: sway });
      },
      leave() { sh.hurry = 2.6; sh.charge = 0; sh.course = Math.atan2(sh.y - innerHeight / 2, sh.x - innerWidth / 2); }
    };
  }

  Sea.creature({ id: 'shark', name: 'Shark', kind: 'ambient', regions: ['tropical', 'open'], eats: ['fish'], weight: 1.4, max: 2, cooldown: 35, spawn });
})();
