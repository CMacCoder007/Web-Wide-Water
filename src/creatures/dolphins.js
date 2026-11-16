// Dolphins: a fast, playful pod that leaps as it travels. What it does depends on
// what it finds:
//   - a school of fish: the pod rings it and swims round and round, so the fish
//     pack into a tight spinning bait ball; then the dolphins take turns to dash
//     through the middle and feed.
//   - a ship: they ride its bow wave for a while, leaping alongside.
//   - neither: they cross the page.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;

  const PAL = [[92, 108, 128], [136, 150, 166], [222, 228, 234]];
  const SECTIONS = [[-34, 1.5, 2], [-24, 3.5, 4.5], [-8, 7, 7.5], [8, 8, 8], [20, 6.5, 6.5], [28, 4, 4.5], [34, 2, 2.2], [41, 1, 1.2]];

  // pal: [back, sides, belly] colours, for the user's own dolphins
  function build(pal) {
    const [TOP, SIDE, BELLY] = pal || PAL;
    const b = new Sea.models.Builder();
    b.tube(SECTIONS, 8, (x, y, z, h) => (z < -h * 0.25 ? BELLY : z > h * 0.4 ? TOP : SIDE));
    b.solid(() => {      // curved dorsal fin
      const rear = b.vert(-7, 0, 7), front = b.vert(6, 0, 7.6), right = b.vert(0, 1.4, 7), left = b.vert(0, -1.4, 7), tip = b.vert(-9, 0, 18);
      b.face([front, right, tip], TOP); b.face([right, rear, tip], TOP);
      b.face([rear, left, tip], TOP); b.face([left, front, tip], TOP);
      b.face([rear, right, front, left], TOP);
    });
    for (const sd of [-1, 1]) {
      b.face([b.vert(-31, 0, 0), b.vert(-43, sd * 11, 0.5), b.vert(-38, 0, 0)], TOP, true);       // flukes
      b.face([b.vert(14, sd * 7, -3), b.vert(4, sd * 17, -7), b.vert(6, sd * 7, -3)], TOP, true); // flippers
    }
    return b.mesh();
  }

  let shape = null;
  function outline() {
    if (shape) return shape;
    const half = [[-38, 0], [-43, 11], [-32, 2], [-24, 3.5], [-8, 7], [4, 8], [5, 17], [14, 8], [20, 6.5], [28, 4], [41, 1]];
    const p = new Path2D();
    half.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    for (let i = half.length - 1; i > 0; i--) p.lineTo(half[i][0], -half[i][1]);
    p.closePath();
    return (shape = p);
  }

  const SLOTS = [[0, 0], [-40, -34], [-46, 36], [-88, -6], [-98, 58], [-104, -62], [-146, 14]];

  function spawn() {
    const model = Sea.models.once('dolphin', () => build());
    const start = Sea.world.entry(110);
    const n = 3 + Math.floor(rand(0, 5));
    const pod = { course: start.yaw, seed: rand(0, 9), age: 0, mode: 'travel', left: 0, prey: null, ship: null, look: 1, ring: rand(0, 6), strike: 2, fed: false, leaving: false };
    const c0 = Math.cos(start.yaw), s0 = Math.sin(start.yaw);
    const members = SLOTS.slice(0, n).map((slot, i) => ({
      i, s: i === 0 ? 1.1 : rand(0.8, 1.05), slot,
      x: start.x + slot[0] * c0 - slot[1] * s0, y: start.y + slot[0] * s0 + slot[1] * c0,
      yaw: start.yaw, z: -9, pitch: 0, phase: rand(0, 6), leap: -1, nextLeap: rand(0.5, 3), dash: 0, wake: 0
    }));
    for (const m of members) Sea.eco.hunters.add(m);

    function target(m) {
      const lead = members[0];
      if (pod.mode === 'herd' && pod.prey) {
        const g = pod.prey;
        if (m.dash > 0) return [g.x, g.y];
        const a = pod.ring + (m.i / n) * 6.283, r = g.r + 46;
        return [g.x + Math.cos(a) * r, g.y + Math.sin(a) * r];
      }
      if (pod.mode === 'bow' && pod.ship) {
        const sh = pod.ship, c = Math.cos(sh.yaw), s = Math.sin(sh.yaw);
        const ahead = 70 + (m.i >> 1) * 22, side = (m.i % 2 ? 1 : -1) * (20 + (m.i >> 1) * 6);
        return [sh.x + c * ahead - s * side, sh.y + s * ahead + c * side];
      }
      if (m === lead) return null;
      const c = Math.cos(lead.yaw), s = Math.sin(lead.yaw);
      return [lead.x + (m.slot[0] + 60) * c - m.slot[1] * s, lead.y + (m.slot[0] + 60) * s + m.slot[1] * c];
    }

    function step(m, t, dt) {
      const k = dt * 60, s = m.s;
      const tg = target(m);
      let speed = 2.2;
      if (tg) {
        const d = Math.hypot(tg[0] - m.x, tg[1] - m.y);
        m.yaw += clamp(turn(m.yaw, Math.atan2(tg[1] - m.y, tg[0] - m.x)), -0.075, 0.075) * k;
        speed = pod.mode === 'travel' ? 2.2 * clamp(0.75 + d / 240, 0.75, 1.5) : clamp(d / 40, 1.1, 3.4);
        if (m.dash > 0) {
          m.dash -= dt; speed = 4;
          if (d < 26 && pod.prey && pod.prey.count > 0) {
            pod.prey.take(rand(2, 6)); pod.fed = true; m.dash = 0;
            Sea.scene.burst('spray', m.x, m.y, 2, 8, { speed: 1.4, up: 3, life: 30, size: 2 });
          }
        }
      } else {
        m.yaw += clamp(turn(m.yaw, pod.course + Math.sin(t * 0.5 + pod.seed) * 0.4), -0.02, 0.02) * k;
      }
      m.yaw += Sea.world.avoid(m.x, m.y, m.yaw, 70, true) * k;
      if (pod.leaving) speed = 3.4;
      const fx = Math.cos(m.yaw), fy = Math.sin(m.yaw);
      m.x += fx * speed * k; m.y += fy * speed * k;
      m.phase += dt * 9;
      const onPage = !Sea.world.gone(m.x, m.y, 10);

      // leaping: out in a clean arc and back in nose first
      if (m.leap >= 0) {
        m.leap += dt / 0.85;
        const p = Math.min(1, m.leap);
        m.z = -9 * s + Math.sin(Math.PI * p) * 34 * s;
        m.pitch = Math.cos(Math.PI * p) * 0.85;
        if (p >= 1) {
          m.leap = -1; m.nextLeap = pod.mode === 'herd' ? rand(3, 6) : rand(1.2, 3.6);
          if (onPage) {
            Sea.water.splash(m.x + fx * 14, m.y + fy * 14, 24 * s, -1.3);
            Sea.scene.emit({ k: 'ring', x: m.x + fx * 14, y: m.y + fy * 14, life: 28, size: 4, grow: 26 });
            Sea.scene.burst('spray', m.x + fx * 14, m.y + fy * 14, 2, 7, { speed: 1.4, up: 2.8, life: 30, size: 1.8 });
          }
        }
      } else {
        m.z += (-9 * s - m.z) * 0.2 * k; m.pitch *= Math.pow(0.8, k);
        if ((m.nextLeap -= dt) <= 0 && onPage && m.dash <= 0) {
          m.leap = 0;
          Sea.water.splash(m.x, m.y, 18 * s, 1);
          Sea.scene.burst('spray', m.x, m.y, 2, 5, { speed: 1, up: 2.6, life: 26, size: 1.6 });
        }
        if ((m.wake += dt) > 0.12 && onPage) {
          m.wake = 0;
          Sea.scene.emit({ k: 'foam', x: m.x - fx * 8 + rand(-2, 2), y: m.y - fy * 8 + rand(-2, 2), life: 26, size: rand(1, 2.4) });
        }
      }
    }

    let ph = 0;
    const flex = (v) => (v[0] >= 4 ? v : [v[0], v[1], v[2] + Math.sin(ph - v[0] * 0.09) * 5 * ((4 - v[0]) / 40) ** 2]);

    return {
      update(t, dt) {
        pod.age += dt; pod.left -= dt; pod.ring += dt * 0.9;
        const lead = members[0];

        // decide what to do
        if (pod.mode === 'travel' && !pod.leaving && (pod.look -= dt) <= 0) {
          pod.look = 1.5;
          const g = pod.fed ? null : Sea.eco.find(['fish'], lead.x, lead.y, 620);
          // the user's own ship or animal comes first: they like company
          const ship = (Sea.mate && Sea.mate.pos()) || (Sea.ships ? Sea.ships.afloat()[0] : null);
          if (g && !Sea.world.gone(g.x, g.y, -60)) { pod.mode = 'herd'; pod.prey = g; pod.left = 22; pod.strike = 3; }
          else if (ship && !pod.ship && Math.hypot(ship.x - lead.x, ship.y - lead.y) < 600) { pod.mode = 'bow'; pod.ship = ship; pod.left = 13; }
        } else if (pod.mode === 'herd') {
          const g = pod.prey;
          if (!g || g.count < 12 || pod.left <= 0 || Sea.world.gone(g.x, g.y, 40)) { pod.mode = 'travel'; pod.prey = null; pod.fed = true; pod.course = lead.yaw; }
          else {
            g.herd();
            if ((pod.strike -= dt) <= 0) { pod.strike = rand(1.2, 2.2); members[Math.floor(Math.random() * n)].dash = 1.2; }
          }
        } else if (pod.mode === 'bow') {
          if (!pod.ship.afloat || pod.left <= 0) { pod.mode = 'travel'; pod.course = lead.yaw; }
        }

        for (const m of members) step(m, t, dt);
        if (pod.age > 6 && pod.mode === 'travel' && members.every((m) => Sea.world.gone(m.x, m.y, 150))) {
          this.dead = true;
          for (const m of members) Sea.eco.hunters.delete(m);
        }
      },
      under(c) {
        for (const m of members) {
          if (m.z > 6 || Sea.world.gone(m.x, m.y, 60)) continue;
          c.save();
          c.translate(m.x + 2, m.y + 3); c.rotate(m.yaw); c.scale(m.s, m.s);
          c.fillStyle = 'rgba(10,26,48,.38)';
          c.fill(outline());
          c.restore();
        }
      },
      shadow(c) { for (const m of members) if (m.z > 4) Sea.scene.blobShadow(c, m.x, m.y, m.yaw, 28 * m.s, 7 * m.s, 0.18); },
      draw(S) {
        for (const m of members) {
          if (Sea.world.gone(m.x, m.y, 70)) continue;
          ph = m.phase;
          S.mesh(model, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch, s: m.s }, { deform: flex });
        }
      },
      leave() { pod.leaving = true; pod.mode = 'travel'; pod.course = members[0].yaw; }
    };
  }

  // what the user's own dolphin needs (src/sea/mate.js)
  Sea.kit = Sea.kit || {};
  Sea.kit.dolphin = {
    model: (pal) => (pal ? build(pal) : Sea.models.once('dolphin', build)), outline, cruise: -9, slots: SLOTS, speed: 3, hunter: true,
    leap: { h: 36, t: 0.85, roll: 0, splash: 24 },
    flex: (ph) => (v) => (v[0] >= 4 ? v : [v[0], v[1], v[2] + Math.sin(ph - v[0] * 0.09) * 5 * ((4 - v[0]) / 40) ** 2])
  };

  Sea.creature({ id: 'dolphin', name: 'Dolphins', kind: 'ambient', regions: ['open', 'tropical'], eats: ['fish'], weight: 3, max: 2, cooldown: 18, spawn });
})();
