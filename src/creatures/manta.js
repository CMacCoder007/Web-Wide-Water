// Manta ray: a wide dark diamond gliding under the surface on slow wingbeats.
// It feeds on krill by swimming loops through the cloud. Once in a while it
// throws itself clear of the water and lands flat, with a slap.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;
  const BACK = [34, 40, 54], BELLY = [232, 236, 240];
  // one wing's outline, nose to tail; mirrored for the other
  const HALF = [[34, 6], [44, 11], [30, 16], [14, 46], [-2, 78], [-14, 60], [-24, 24], [-34, 5]];

  function build() {
    const b = new Sea.models.Builder();
    const outline = HALF.concat(HALF.slice().reverse().map(([x, y]) => [x, -y]));
    b.loft(outline, [{ z: -2.5, k: 0.96, c: BELLY }, { z: 2.5, k: 1, c: BELLY }], BACK);
    b.face([b.vert(-34, 0, 0), b.vert(-92, 1.2, 0), b.vert(-92, -1.2, 0)], BACK, true);   // the whip of a tail
    return b.mesh();
  }

  function spawn() {
    const model = Sea.models.once('manta', build);
    const start = Sea.world.entry(120);
    const s = rand(0.9, 1.3);
    const m = { x: start.x, y: start.y, yaw: start.yaw, course: start.yaw, z: -12, pitch: 0, roll: 0, flap: rand(0, 6), age: 0, seed: rand(0, 9), leap: -1, leapIn: rand(5, 12), fed: 0, hurry: 1 };
    const beat = (v) => [v[0], v[1], v[2] + Math.sin(m.flap - Math.abs(v[1]) * 0.03) * Math.abs(v[1]) * 0.3];

    return {
      update(t, dt) {
        const k = dt * 60;
        m.age += dt; m.flap += dt * 2.4;
        let want = m.course + Math.sin(t * 0.3 + m.seed) * 0.35, rate = 0.012, speed = 1.0 * m.hurry;
        const g = m.fed < 8 && m.hurry === 1 ? Sea.eco.find(['krill'], m.x, m.y, 600) : null;
        if (g && m.leap < 0) {
          // loops through the cloud: always turning, never stopping
          const d = Math.hypot(g.x - m.x, g.y - m.y);
          want = Math.atan2(g.y - m.y, g.x - m.x) + (d < g.r ? 1.2 : 0); rate = 0.03;
          if (d < g.r * 0.8 && Math.random() < 0.05 * k) { g.take(6); m.fed++; }
        }
        m.yaw += clamp(turn(m.yaw, want), -rate, rate) * k + Sea.world.avoid(m.x, m.y, m.yaw, 100, true) * 0.6 * k;
        const fx = Math.cos(m.yaw), fy = Math.sin(m.yaw);

        if (m.leap >= 0) {
          m.leap += dt / 1.25;
          const p = Math.min(1, m.leap);
          m.z = -12 + Math.sin(Math.PI * p) * 74 * s;
          m.pitch = Math.cos(Math.PI * p) * 0.7;
          m.roll = p * 0.5;
          speed = 2.2;
          if (p >= 1) {
            m.leap = -1; m.roll = 0; m.pitch = 0; m.leapIn = rand(14, 30);
            Sea.water.splash(m.x, m.y, 70 * s, -3);
            Sea.scene.emit({ k: 'ring', x: m.x, y: m.y, life: 50, size: 16, grow: 90 * s });
            Sea.scene.burst('spray', m.x, m.y, 3, 30, { speed: 3, up: 4.6, life: 50, size: 2.6 });
          }
        } else if ((m.leapIn -= dt) <= 0 && !Sea.world.gone(m.x, m.y, -90) && !g) {
          m.leap = 0;
          Sea.water.splash(m.x, m.y, 50 * s, 1.6);
          Sea.scene.burst('spray', m.x, m.y, 3, 14, { speed: 1.8, up: 4, life: 40, size: 2.2 });
        }
        m.x += fx * speed * k; m.y += fy * speed * k;
        if (m.leap < 0 && Math.random() < 0.05 * k && !Sea.world.gone(m.x, m.y, 20)) Sea.water.splash(m.x, m.y, 40 * s, -0.3);
        if (m.age > 8 && Sea.world.gone(m.x, m.y, 150)) this.dead = true;
      },
      under(c) {
        if (m.z > 10 || Sea.world.gone(m.x, m.y, 110)) return;
        // wings foreshorten as they beat
        const w = 0.82 + Math.cos(m.flap) * 0.18;
        c.save();
        c.translate(m.x + 3, m.y + 5); c.rotate(m.yaw); c.scale(s, s * w);
        c.fillStyle = 'rgba(8,16,34,.5)';
        c.beginPath();
        HALF.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        for (let i = HALF.length - 1; i >= 0; i--) c.lineTo(HALF[i][0], -HALF[i][1]);
        c.closePath(); c.fill();
        c.strokeStyle = 'rgba(8,16,34,.5)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-34, 0); c.lineTo(-92, Math.sin(m.flap * 0.7) * 6); c.stroke();
        c.restore();
      },
      shadow(c) { if (m.z > 6) Sea.scene.blobShadow(c, m.x, m.y, m.yaw + 1.571, 70 * s, 34 * s, 0.2); },
      draw(S) {
        if (m.z < -4 || Sea.world.gone(m.x, m.y, 130)) return;
        S.mesh(model, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch, roll: m.roll, s }, { deform: beat });
      },
      leave() { m.hurry = 3; m.course = Math.atan2(m.y - innerHeight / 2, m.x - innerWidth / 2); }
    };
  }

  Sea.creature({ id: 'manta', name: 'Manta ray', kind: 'ambient', regions: ['tropical', 'open'], eats: ['krill'], weight: 1.6, max: 2, cooldown: 35, spawn });
})();
