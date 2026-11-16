// Orca pod: anything from a lone bull to a family of seven crosses the page,
// some with calves keeping close to an adult. Most of the time you see tall
// black fins cutting the surface above dark shapes; every so often one comes up
// to breathe, one breaches, a few breach one after another, or one spy-hops
// (stands up with its head out for a look). Two pods can be out at once: the
// second heads for the first, and when they meet both sides leap.
// They steer round ice and give the cursor a little room; if the cursor is
// close, the nearest one surfaces to have a look.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn, lerp } = Sea.util;

  const PAL = [[26, 28, 36], [238, 241, 244], [128, 136, 148]];
  const CRUISE = -19;       // depth of the body's centre line when cruising (fin still shows)

  // x, half-width, half-height: tail to nose
  const SECTIONS = [[-64, 2, 3], [-50, 5, 6], [-30, 10, 11], [-8, 15, 15], [14, 16.5, 16], [34, 14, 14], [50, 10, 10], [63, 4, 4]];

  // pal: [back, belly, saddle] colours, for the user's own orcas; wild ones use the usual black and white
  function build(pal) {
    const [BLACK, WHITE, GREY] = pal || PAL;
    const b = new Sea.models.Builder();
    b.tube(SECTIONS, 8, (x, y, z, h) => {
      if (z < -h * 0.25) return WHITE;                                             // belly
      if (x > 36 && x < 52 && Math.abs(y) > 5 && z > 0 && z < h * 0.75) return WHITE; // eye patch
      if (x > -28 && x < -8 && z > h * 0.8) return GREY;                           // saddle behind the fin
      return BLACK;
    });
    // tall dorsal fin
    b.solid(() => {
      const rear = b.vert(-12, 0, 13), front = b.vert(11, 0, 14), right = b.vert(0, 2.6, 13), left = b.vert(0, -2.6, 13);
      const tip = b.vert(-12, 0, 45);
      b.face([front, right, tip], BLACK); b.face([right, rear, tip], BLACK);
      b.face([rear, left, tip], BLACK); b.face([left, front, tip], BLACK);
      b.face([rear, right, front, left], BLACK);
    });
    // tail flukes (flat) and flippers: thin, so two-sided
    b.face([b.vert(-60, 0, 0), b.vert(-79, -17, 1), b.vert(-70, 0, 0)], BLACK, true);
    b.face([b.vert(-60, 0, 0), b.vert(-79, 17, 1), b.vert(-70, 0, 0)], BLACK, true);
    b.face([b.vert(24, 14, -6), b.vert(8, 34, -12), b.vert(9, 14, -6)], BLACK, true);
    b.face([b.vert(24, -14, -6), b.vert(8, -34, -12), b.vert(9, -14, -6)], BLACK, true);
    return b.mesh();
  }

  // The shape seen through the water, from above.
  let silhouette = null;
  function outline() {
    if (silhouette) return silhouette;
    const half = [[-70, 0], [-79, 17], [-61, 3], [-50, 5], [-30, 10], [-8, 15], [4, 16], [9, 34], [22, 16], [34, 14], [50, 10], [63, 4], [67, 0]];
    const p = new Path2D();
    half.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    for (let i = half.length - 2; i > 0; i--) p.lineTo(half[i][0], -half[i][1]);
    p.closePath();
    return (silhouette = p);
  }

  // where each follower swims, relative to the leader: [behind, to the side]
  const SLOTS = [[0, 0], [-75, -58], [-90, 62], [-165, -8], [-185, 96], [-200, -100], [-270, 20]];

  // every pod on the page, so pods can find each other
  const pods = new Set();

  // Pods come in all sizes: a lone bull, a pair, a family, a big travelling group.
  function podSize() {
    const r = Math.random();
    if (r < 0.1) return 1;
    if (r < 0.45) return 2 + Math.floor(rand(0, 2));
    if (r < 0.8) return 4 + Math.floor(rand(0, 2));
    return 6 + Math.floor(rand(0, 2));
  }

  function spawn() {
    const model = Sea.models.once('orca', () => build());
    const start = Sea.world.entry(170);
    for (const p of pods) if (p.ent.dead) pods.delete(p);
    // if another pod is already on the page, head for where it is going, so the two meet
    for (const p of pods) {
      const l = p.members[0];
      if (Sea.world.gone(l.x, l.y, -40)) continue;
      const ahead = p.speed * 300;
      start.yaw = Math.atan2(l.y + Math.sin(l.yaw) * ahead - start.y, l.x + Math.cos(l.yaw) * ahead - start.x);
      break;
    }
    const n = podSize();
    const pod = {
      course: start.yaw, seed: rand(0, 9), age: 0, playIn: rand(2.5, 5), leaving: false, members: [],
      speed: rand(1.2, 1.9), met: new Set(), ent: null, rest: rand(2, 6), chase: 0
    };
    const c0 = Math.cos(start.yaw), s0 = Math.sin(start.yaw);
    for (let i = 0; i < n; i++) {
      // a big leader (a lone orca is a huge bull); the rest vary; some are calves that stay beside an adult
      let s = i === 0 ? (n === 1 ? 1.35 : rand(1.05, 1.25)) : rand(0.75, 1.05);
      let slot = [SLOTS[i][0] + rand(-14, 14), SLOTS[i][1] + rand(-14, 14)];
      if (i > 1 && Math.random() < 0.28) {
        s = rand(0.45, 0.6);
        const mum = pod.members[i - 1];
        slot = [mum.slot[0] - 14, mum.slot[1] + (mum.slot[1] >= 0 ? 30 : -30)];
      }
      pod.members.push({
        breachAt: 0,
        lead: i === 0, s, slot,
        x: start.x + slot[0] * c0 - slot[1] * s0, y: start.y + slot[0] * s0 + slot[1] * c0,
        yaw: start.yaw, z: CRUISE * s, pitch: 0, roll: 0, phase: rand(0, 6), pace: 1,
        mode: 'swim', surf: 0, nextSurf: rand(1.5, 7), blown: true, hello: 0, wake: 0, wakeN: 0,
        bt: 0, z0: 0, out: false, landed: false
      });
    }

    function breach(m) {
      m.mode = 'breach'; m.bt = 0; m.z0 = m.z; m.out = false; m.landed = false; m.surf = 0;
    }

    function step(m, t, dt) {
      const k = dt * 60, s = m.s;
      const lead = pod.members[0];

      // ----- heading -----
      if (m.lead) {
        let want = pod.course + Math.sin(t * 0.35 + pod.seed) * 0.45, rate = 0.012;
        m.pace = 1;
        // the hunt: the pod goes after seals, or a school of fish, when one is near
        pod.rest -= dt;
        const prey = pod.rest <= 0 && !pod.leaving ? Sea.eco.find(['seal', 'penguin', 'fish'], m.x, m.y, 560) : null;
        if (prey && !Sea.world.gone(prey.x, prey.y, 0)) {
          const d = Math.hypot(prey.x - m.x, prey.y - m.y);
          want = Math.atan2(prey.y - m.y, prey.x - m.x); rate = 0.03; m.pace = 1.7;
          pod.chase += dt;
          if (d < prey.r * 0.5 + 34 * s) {
            prey.take(prey.kind === 'fish' ? rand(4, 9) : 1, m.x, m.y);
            Sea.scene.burst('spray', m.x, m.y, 4, 16, { speed: 2.2, up: 4, life: 40, size: 2.4 });
            pod.rest = rand(14, 22); pod.chase = 0; pod.course = m.yaw;
          } else if (pod.chase > 12) { pod.rest = 16; pod.chase = 0; pod.course = m.yaw; }   // it got away
        }
        m.yaw += clamp(turn(m.yaw, want), -rate, rate) * k;
      } else {
        const c = Math.cos(lead.yaw), sn = Math.sin(lead.yaw);
        const sx = lead.x + m.slot[0] * c - m.slot[1] * sn, sy = lead.y + m.slot[0] * sn + m.slot[1] * c;
        // aim a little ahead of the slot, so it joins the line instead of circling it
        m.yaw += clamp(turn(m.yaw, Math.atan2(sy + sn * 90 - m.y, sx + c * 90 - m.x)), -0.03, 0.03) * k;
        const behind = (sx - m.x) * Math.cos(m.yaw) + (sy - m.y) * Math.sin(m.yaw);
        m.pace = clamp(1 + behind / 250, 0.75, 1.35);
      }
      m.yaw += Sea.world.avoid(m.x, m.y, m.yaw, 130) * k;
      const fx = Math.cos(m.yaw), fy = Math.sin(m.yaw);
      const onPage = !Sea.world.gone(m.x, m.y, 30);

      // a breach that was booked for a moment from now (so several can go one after another)
      if (m.breachAt && pod.age >= m.breachAt) { m.breachAt = 0; if (m.mode === 'swim' && onPage) breach(m); }

      // ----- depth -----
      if (m.mode === 'spy') {
        // spy-hop: stands on its tail with its head out of the water and has a look round
        m.bt += dt;
        const up = m.bt < 2;
        m.z += ((up ? 16 : CRUISE) * s - m.z) * (1 - Math.pow(0.93, k));
        m.pitch += ((up ? 1.3 : 0) - m.pitch) * 0.08 * k;
        if (m.bt > 2.7) { m.mode = 'swim'; m.nextSurf = rand(4, 8); }
      } else if (m.mode === 'breach') {
        m.bt += dt;
        const p = Math.min(1, m.bt / 1.7);
        m.z = lerp(m.z0, CRUISE * s, p) + Math.sin(Math.PI * p) * 80 * s;
        m.pitch = Math.cos(Math.PI * p) * 0.95;
        m.roll = clamp(p * 1.6, 0, 1) * 1.9;        // twists, and lands on its side
        if (!m.out && m.z > -6 * s) {
          m.out = true;
          Sea.water.splash(m.x + fx * 40 * s, m.y + fy * 40 * s, 40 * s, 2);
          Sea.scene.burst('spray', m.x + fx * 40 * s, m.y + fy * 40 * s, 4, 12, { speed: 1.6, up: 3.6, life: 40, size: 2.2 });
        }
        if (!m.landed && p > 0.84) {
          m.landed = true;
          const lx = m.x + fx * 20 * s, ly = m.y + fy * 20 * s;
          Sea.water.splash(lx, ly, 60 * s, -2.6);
          Sea.scene.emit({ k: 'ring', x: lx, y: ly, life: 46, size: 12 * s, grow: 80 * s });
          Sea.scene.burst('spray', lx, ly, 3, 26, { speed: 3, up: 4.6, life: 52, size: 2.6 });
          Sea.scene.burst('foam', lx, ly, 0, 10, { speed: 1.2, up: 0, life: 70, size: 4 });
        }
        if (p >= 1) { m.mode = 'swim'; m.nextSurf = rand(4, 8); }
      } else {
        m.roll *= Math.pow(0.85, k);
        if (m.surf > 0) {
          m.surf -= dt;
          if (!m.blown && m.surf < 1) {
            m.blown = true;   // the blow: a puff of spray from the top of the head
            if (onPage) Sea.scene.burst('spray', m.x + fx * 26 * s, m.y + fy * 26 * s, 6, 7, { speed: 0.5, up: 2.8, life: 34, size: 1.7 });
          }
        } else {
          m.nextSurf -= dt;
          m.hello -= dt;
          const cur = Sea.world.cursor;
          if (cur && m.hello <= 0 && Math.hypot(cur.x - m.x, cur.y - m.y) < 150) { m.nextSurf = 0; m.hello = 7; }
          if (m.nextSurf <= 0) { m.surf = 1.5; m.blown = false; m.nextSurf = rand(5, 10); }
        }
        const zTo = (m.surf > 0 ? -7 : CRUISE) * s;
        const dz = (zTo - m.z) * (1 - Math.pow(0.94, k));
        m.z += dz;
        m.pitch += (clamp(dz * 0.12, -0.25, 0.25) - m.pitch) * 0.1 * k;
      }

      // ----- move -----
      const v = pod.speed * m.pace * (m.mode === 'breach' ? 1.5 : m.mode === 'spy' ? 0.2 : 1) * (pod.leaving ? 1.8 : 1) * k;
      m.x += fx * v; m.y += fy * v;
      m.phase += dt * (m.mode === 'breach' ? 9 : 4.2) * m.pace;

      // ----- the fin cuts a small wake -----
      m.wake += dt;
      if (m.wake > 0.1 && m.mode === 'swim' && onPage) {
        m.wake = 0;
        Sea.scene.emit({ k: 'foam', x: m.x - fx * 16 * s + rand(-3, 3), y: m.y - fy * 16 * s + rand(-3, 3), life: 34, size: rand(1.4, 3.2) * s });
        if (++m.wakeN % 3 === 0) Sea.water.splash(m.x + fx * 8, m.y + fy * 8, 16 * s, -0.3);
      }
    }

    let ph = 0;
    // the tail beats up and down (whales, unlike fish)
    const flex = (v) => {
      if (v[0] >= 10) return v;
      const w = (10 - v[0]) / 74;
      return [v[0], v[1], v[2] + Math.sin(ph - v[0] * 0.05) * 8 * w * w];
    };

    // up to `count` orcas that are swimming on the page, in random order
    const ready = (count) => pod.members
      .filter((m) => m.mode === 'swim' && !m.breachAt && !Sea.world.gone(m.x, m.y, -70))
      .sort(() => Math.random() - 0.5).slice(0, count);
    // they breach one after another, a beat apart
    const breachTogether = (count) => ready(count).forEach((m, i) => { m.breachAt = pod.age + 0.05 + i * 0.35; });

    const ent = {
      update(t, dt) {
        pod.age += dt;
        for (const m of pod.members) step(m, t, dt);

        // ----- play: one breaches, a few breach together, or one spy-hops -----
        pod.playIn -= dt;
        if (pod.playIn <= 0 && !pod.leaving) {
          pod.playIn = rand(4, 9);
          const r = Math.random();
          if (r < 0.45) breachTogether(1);
          else if (r < 0.7) breachTogether(2 + Math.floor(rand(0, 2)));
          else {
            const m = ready(pod.members.length).find((o) => !o.lead || pod.members.length === 1);
            if (m) { m.mode = 'spy'; m.bt = 0; m.surf = 0; }
          }
        }

        // ----- two pods meeting greet each other: both sides leap -----
        const lead = pod.members[0];
        for (const other of pods) {
          if (other === pod || pod.met.has(other) || other.ent.dead) continue;
          const ol = other.members[0];
          if (Math.hypot(ol.x - lead.x, ol.y - lead.y) > 300 || Sea.world.gone(lead.x, lead.y, 0)) continue;
          pod.met.add(other); other.met.add(pod);
          breachTogether(3); other.greet(3);
          pod.playIn = Math.max(pod.playIn, 4);
        }

        if (pod.age > 6 && pod.members.every((m) => Sea.world.gone(m.x, m.y, 230))) {
          this.dead = true; pods.delete(pod);
          for (const m of pod.members) Sea.eco.hunters.delete(m);
        }
      },

      under(c) {
        const path = outline();
        for (const m of pod.members) {
          if (Sea.world.gone(m.x, m.y, 110)) continue;
          const a = 0.42 * clamp(1 - (m.z + 10 * m.s) / (30 * m.s), 0, 1);
          if (a < 0.02) continue;
          c.save();
          c.translate(m.x + 3, m.y + 5); c.rotate(m.yaw); c.scale(m.s, m.s);
          c.fillStyle = `rgba(8,22,44,${a.toFixed(2)})`;
          c.fill(path);
          c.restore();
        }
      },

      shadow(c) {
        for (const m of pod.members) {
          if (m.z > 4) Sea.scene.blobShadow(c, m.x, m.y, m.yaw, 50 * m.s, 13 * m.s, 0.2);
        }
      },

      draw(S) {
        for (const m of pod.members) {
          if (Sea.world.gone(m.x, m.y, 130)) continue;
          ph = m.phase;
          S.mesh(model, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch, roll: m.roll, s: m.s }, { deform: flex });
        }
      },

      // asked to go (switched off in the popup): swim off quickly, no more breaching
      leave() { pod.leaving = true; }
    };
    pod.ent = ent;
    for (const m of pod.members) Sea.eco.hunters.add(m);    // fish and seals flee from them
    pod.greet = breachTogether;
    pods.add(pod);
    return ent;
  }

  // what the user's own orca needs (src/sea/mate.js)
  Sea.kit = Sea.kit || {};
  Sea.kit.orca = {
    model: (pal) => (pal ? build(pal) : Sea.models.once('orca', build)), outline, cruise: CRUISE, slots: SLOTS, speed: 2.1, hunter: true,
    leap: { h: 80, t: 1.7, roll: 1.9, splash: 60 },
    flex: (ph) => (v) => (v[0] >= 10 ? v : [v[0], v[1], v[2] + Math.sin(ph - v[0] * 0.05) * 8 * ((10 - v[0]) / 74) ** 2])
  };

  Sea.creature({
    id: 'orca',
    name: 'Orca pod',
    kind: 'ambient',
    regions: ['north', 'open', 'south'],
    eats: ['seal', 'penguin', 'fish'],
    weight: 3,
    max: 2,
    cooldown: 12,
    spawn
  });
})();
