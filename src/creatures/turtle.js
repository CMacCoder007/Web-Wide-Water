// Sea turtle: an unhurried swimmer in warm water, its shell just breaking the
// surface, rowing with its front flippers. It eats jellyfish: if a bloom is
// about it makes its way over and picks them off one at a time. Every so often
// it lifts its head to breathe.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;
  const PAL = [[84, 108, 62], [146, 128, 74], [150, 162, 96]];

  // pal: [shell, rim, skin] colours, for the user's own turtles
  function build(pal) {
    const [SHELL, RIM, SKIN] = pal || PAL;
    const b = new Sea.models.Builder();
    b.blob(0, 0, 2, 18, 14, 6.5, (z) => (z > 4 ? SHELL : RIM), 3, 8);       // shell
    b.blob(21, 0, 1.5, 5.5, 4.2, 3.8, SKIN, 2, 6);                           // head
    for (const sd of [-1, 1]) {
      b.face([b.vert(11, sd * 11, 0), b.vert(20, sd * 31, -1), b.vert(2, sd * 15, 0)], SKIN, true);     // front flippers
      b.face([b.vert(-12, sd * 9, 0), b.vert(-22, sd * 15, -1), b.vert(-16, sd * 6, 0)], SKIN, true);   // rear
    }
    return b.mesh();
  }

  function spawn() {
    const model = Sea.models.once('turtle', () => build());
    const start = Sea.world.entry(60);
    const s = rand(1.1, 1.6);
    const tu = { x: start.x, y: start.y, yaw: start.yaw, course: start.yaw, z: -3, pitch: 0, row: rand(0, 6), age: 0, breath: rand(6, 12), up: 0, munch: 0, eaten: 0, seed: rand(0, 9), hurry: 1 };
    // the flippers row: tips sweep up and back
    const row = (v) => {
      const out = Math.abs(v[1]) - 12;
      if (out <= 0 || v[0] < 0) return v;
      const q = out / 18;
      return [v[0] - Math.cos(tu.row) * 7 * q, v[1], v[2] + Math.sin(tu.row) * 6 * q];
    };
    return {
      update(t, dt) {
        const k = dt * 60;
        tu.age += dt;
        let want = tu.course + Math.sin(t * 0.25 + tu.seed) * 0.4, speed = 0.55;
        const g = tu.eaten < 5 && tu.hurry === 1 ? Sea.eco.find(['jelly'], tu.x, tu.y, 700) : null;
        if (tu.munch > 0) { tu.munch -= dt; speed = 0.1; }
        else if (g && g.list.length) {
          let best = g.list[0], bd = 1e9;
          for (const j of g.list) { const d = Math.hypot(j.x - tu.x, j.y - tu.y); if (d < bd) { bd = d; best = j; } }
          want = Math.atan2(best.y - tu.y, best.x - tu.x); speed = 0.8;
          if (bd < 16 * s) { g.take(1, tu.x, tu.y); tu.munch = 1.6; tu.eaten++; Sea.water.splash(tu.x, tu.y, 14, -0.6); }
        }
        tu.yaw += clamp(turn(tu.yaw, want), -0.015, 0.015) * k + Sea.world.avoid(tu.x, tu.y, tu.yaw, 70) * 0.6 * k;
        speed *= tu.hurry;
        tu.x += Math.cos(tu.yaw) * speed * k; tu.y += Math.sin(tu.yaw) * speed * k;
        tu.row += dt * (2 + speed * 2);

        // up for air
        if ((tu.breath -= dt) <= 0) { tu.breath = rand(9, 16); tu.up = 1.8; Sea.scene.emit({ k: 'ring', x: tu.x, y: tu.y, life: 30, size: 6, grow: 22 }); }
        tu.up -= dt;
        tu.z += ((tu.up > 0 ? 0.5 : -3.5) * s - tu.z) * 0.05 * k;
        tu.pitch += ((tu.up > 0 ? 0.3 : 0) - tu.pitch) * 0.06 * k;
        if (Math.random() < 0.04 * k) Sea.water.splash(tu.x, tu.y, 14 * s, -0.22);
        if (tu.age > 8 && Sea.world.gone(tu.x, tu.y, 90)) this.dead = true;
      },
      under(c) {
        if (Sea.world.gone(tu.x, tu.y, 60)) return;
        c.save();
        c.translate(tu.x + 2, tu.y + 4); c.rotate(tu.yaw); c.scale(s, s);
        c.fillStyle = 'rgba(16,40,36,.4)';
        c.beginPath(); c.ellipse(0, 0, 20, 15, 0, 0, 6.283); c.fill();
        c.beginPath(); c.ellipse(22, 0, 6, 4.5, 0, 0, 6.283); c.fill();
        const sw = Math.cos(tu.row) * 7;
        for (const sd of [-1, 1]) {
          c.beginPath(); c.moveTo(11, sd * 11); c.lineTo(20 - sw, sd * 31); c.lineTo(2, sd * 15); c.fill();
          c.beginPath(); c.moveTo(-12, sd * 9); c.lineTo(-22, sd * 15); c.lineTo(-16, sd * 6); c.fill();
        }
        c.restore();
      },
      draw(S) {
        if (Sea.world.gone(tu.x, tu.y, 60)) return;
        S.mesh(model, { x: tu.x, y: tu.y, z: tu.z, yaw: tu.yaw, pitch: tu.pitch, s }, { deform: row });
      },
      leave() { tu.hurry = 4; tu.course = Math.atan2(tu.y - innerHeight / 2, tu.x - innerWidth / 2); }
    };
  }

  // what the user's own turtle needs (src/sea/mate.js)
  Sea.kit = Sea.kit || {};
  Sea.kit.turtle = {
    model: (pal) => (pal ? build(pal) : Sea.models.once('turtle', build)), outline: null, slots: [[0, 0], [-46, -34], [-50, 38], [-96, -4], [-104, 62], [-110, -66], [-150, 16]], cruise: -3, speed: 1.1, hunter: false, leap: null,
    flex: (ph) => (v) => {
      const out = Math.abs(v[1]) - 12;
      if (out <= 0 || v[0] < 0) return v;
      return [v[0] - Math.cos(ph * 0.4) * 7 * (out / 18), v[1], v[2] + Math.sin(ph * 0.4) * 6 * (out / 18)];
    }
  };

  Sea.creature({ id: 'turtle', name: 'Sea turtle', kind: 'ambient', regions: ['tropical', 'open'], eats: ['jelly'], weight: 1.8, max: 2, cooldown: 30, spawn });
})();
