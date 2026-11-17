// Humpback whale: the big event, and it should feel like one.
//
// A very large shadow glides in under the page. It comes up to blow, slides
// back down, and then you see it gather speed in the deep before it breaches:
// two thirds of the animal out of the water, long white flippers spread,
// turning onto its back in the air so the pleated white throat shows, hanging
// for a moment, and coming down flat with all its weight. The sea heaves, rings
// roll out, foam is left behind. It rights itself under the surface, swims on,
// lifts its flukes clear and dives away.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn, lerp } = Sea.util;

  const TOP = [40, 50, 66], MID = [60, 74, 94], BELLY = [236, 240, 243], PLEAT = [158, 168, 182];
  const FIN = [198, 208, 220], FLUKE = [44, 54, 70];
  const DEEP = -50, SPEED = 1.0, SIDES = 24;
  const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };

  // Tail to nose: x, half-width, half-height, centre height. The head is a third
  // of the animal, blunt, with the throat pouch hanging below the centre line.
  const SECTIONS = [
    [-160, 3, 3, 2], [-140, 6, 8, 2], [-115, 11, 14, 1], [-85, 19, 21, 0], [-50, 27, 28, 0], [-10, 33, 33, -1],
    [30, 36, 35, -3], [65, 36, 34, -5], [95, 33, 31, -6], [120, 28, 25, -6], [140, 21, 18, -5], [154, 12, 10, -4], [161, 4, 4, -3]
  ];

  // The flipper's centre line from shoulder to tip: x, y, z and width. It leaves the
  // body angled out, then curves back towards the tail and droops, ending blunt.
  // Mirrored for the left side.
  const FLIPPER = [[90, 32, -8, 28], [74, 56, -12, 29], [52, 76, -17, 27], [24, 90, -22, 23], [-4, 97, -26, 17], [-24, 99, -28, 10]];
  // the two edges of the flipper, a little way either side of the centre line
  const FLIPPER_EDGES = FLIPPER.map(([x, y, z, w], i) => {
    const a = FLIPPER[Math.max(0, i - 1)], b = FLIPPER[Math.min(FLIPPER.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const px = (b[1] - a[1]) / l, py = -(b[0] - a[0]) / l;      // across the flipper, towards its leading edge
    const at = (f) => [x + px * w * f, y + py * w * f, z];
    return { lead: at(0.5), mid: at(0.17), trail: at(-0.5) };
  });

  function build() {
    const b = new Sea.models.Builder();
    const step = (Math.PI * 2) / SIDES;
    b.tube(SECTIONS, SIDES, (x, y, z, h) => {
      const f = z / h;                       // -1 = belly, 1 = back
      if (f < -0.3) {
        if (x < -90) return MID;             // the tail stock is dark all round
        if (x < -25) return BELLY;
        // throat pleats: long grooves from the chin to the middle of the belly
        const band = Math.floor((Math.atan2(z, y) + Math.PI * 2) / step + 0.5);
        return band % 2 ? PLEAT : BELLY;
      }
      return f < 0.15 ? MID : TOP;
    });

    // the hump, with its small fin
    b.solid(() => {
      const rear = b.vert(-80, 0, 21), front = b.vert(-38, 0, 28), right = b.vert(-58, 5, 24), left = b.vert(-58, -5, 24);
      const tip = b.vert(-68, 0, 37), crest = b.vert(-56, 0, 35);
      b.face([front, right, crest], TOP); b.face([right, tip, crest], TOP); b.face([right, rear, tip], TOP);
      b.face([rear, left, tip], TOP); b.face([left, crest, tip], TOP); b.face([left, front, crest], TOP);
      b.face([rear, right, front, left], TOP);
    });

    // the knobs on top of the head
    for (const [x, y, z] of [[112, 0, 20], [124, 9, 16], [124, -9, 16], [136, 0, 14], [144, 7, 9], [144, -7, 9], [152, 0, 7]]) {
      b.box(x - 2.5, x + 2.5, y - 2.5, y + 2.5, z - 1, z + 3, TOP);
    }

    for (const sd of [-1, 1]) {
      // long white flippers: a curved paddle in four pieces
      // (dark along the leading edge, pale behind it, so they show on a white page too)
      const side = (key) => FLIPPER_EDGES.map((e) => b.vert(e[key][0], sd * e[key][1], e[key][2]));
      const lead = side('lead'), mid = side('mid'), trail = side('trail');
      for (let i = 1; i < FLIPPER.length; i++) {
        b.face([lead[i - 1], lead[i], mid[i], mid[i - 1]], MID, true);
        b.face([mid[i - 1], mid[i], trail[i], trail[i - 1]], FIN, true);
      }

      // broad flukes with a notch between them
      const L = [[-150, 0, 0], [-158, 22, 1], [-172, 48, 2], [-192, 64, 3]].map(([x, y, z]) => b.vert(x, sd * y, z));
      const T = [[-172, 0, 0], [-180, 16, 1], [-190, 40, 2]].map(([x, y, z]) => b.vert(x, sd * y, z));
      b.face([L[0], L[1], T[1], T[0]], FLUKE, true);
      b.face([L[1], L[2], T[2], T[1]], FLUKE, true);
      b.face([L[2], L[3], T[2]], FLUKE, true);
    }
    return b.mesh();
  }

  // The shape seen through the water, from above.
  let silhouette = null;
  function outline() {
    if (silhouette) return silhouette;
    const half = [
      [-172, 0], [-190, 40], [-192, 64], [-172, 48], [-158, 22], [-150, 5], [-140, 6], [-115, 11], [-85, 19], [-50, 27],
      [-10, 33], [30, 36], [60, 36],
      ...FLIPPER_EDGES.map((e) => e.trail), ...FLIPPER_EDGES.map((e) => e.lead).reverse(),
      [108, 31], [120, 28], [140, 21], [154, 12], [162, 0]
    ];
    const p = new Path2D();
    half.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    for (let i = half.length - 2; i > 0; i--) p.lineTo(half[i][0], -half[i][1]);
    p.closePath();
    return (silhouette = p);
  }

  function spawn(opts = {}) {
    const model = Sea.models.once('humpback', build);
    const start = Sea.world.entry(opts.summoned ? 150 : 340);     // called up by hand, it is with you sooner
    const s = rand(0.9, 1.12);
    const w = {
      x: start.x, y: start.y, yaw: start.yaw, course: start.yaw, z: DEEP * s, pitch: 0, roll: 0,
      phase: 0, seed: rand(0, 9), age: 0, swell: 0, drip: 0, pace: 1,
      // approach -> blow -> sink -> breach -> settle -> cruise -> fluke -> away
      state: 'approach', st: 0, z0: 0, pitch0: 0, land: null, marks: {}, leaving: false
    };
    const go = (state) => { w.state = state; w.st = 0; w.marks = {}; };
    // do something once, the first time a moment is reached
    const once = (name, when, fn) => { if (when && !w.marks[name]) { w.marks[name] = true; fn(); } };
    // a point on the animal's centre line, d px ahead of its middle
    const at = (d) => {
      const c = Math.cos(w.pitch) * d * s;
      return [w.x + Math.cos(w.yaw) * c, w.y + Math.sin(w.yaw) * c, w.z + Math.sin(w.pitch) * d * s];
    };

    let ph = 0;
    // the tail beats up and down
    const flex = (v) => {
      if (v[0] >= 20) return v;
      const k = (20 - v[0]) / 180;
      return [v[0], v[1], v[2] + Math.sin(ph - v[0] * 0.02) * 20 * k * k];
    };

    const BREACH = 3.7;        // seconds, run-up included
    const RUN = 0.22;          // the share of that spent gathering speed under water

    function breachStep(dt) {
      const p = Math.min(1, w.st / BREACH);
      if (p < RUN) {
        // the run-up: nose comes up, it drives for the surface
        const r = p / RUN;
        w.z = lerp(w.z0, -36 * s, r * r);
        w.pitch = lerp(w.pitch0, 1.05, smooth(r));
        w.pace = lerp(1.2, 2.4, r);
        once('bulge', r > 0.55, () => { const n = at(120); Sea.water.splash(n[0], n[1], 90 * s, 1.6); });
        return;
      }
      // the flight: up, over onto its back, and down
      const u = (p - RUN) / (1 - RUN);
      w.z = (-36 + 4 * 138 * u * (1 - u)) * s;
      w.pitch = lerp(1.05, -0.12, smooth(u * 1.12));
      w.roll = smooth((u - 0.14) / 0.58) * Math.PI;
      w.pace = lerp(1.5, 0.45, u);

      once('burst', true, () => {
        const n = at(110);
        Sea.water.splash(n[0], n[1], 80 * s, 2.4);
        Sea.scene.emit({ k: 'ring', x: n[0], y: n[1], life: 50, size: 20 * s, grow: 90 * s });
        Sea.scene.burst('spray', n[0], n[1], 6, 44, { speed: 2.6, up: 5.4, life: 56, size: 3 });
      });

      // water pours off it while it is in the air
      w.drip += dt;
      if (w.drip > 0.04 && w.z > 0 && u < 0.85) {
        w.drip = 0;
        for (let i = 0; i < 2; i++) {
          const q = at(rand(-130, 150));
          if (q[2] > 4) Sea.scene.emit({ k: 'spray', x: q[0] + rand(-20, 20) * s, y: q[1] + rand(-20, 20) * s, z: q[2], vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), vz: rand(-0.5, 0.8), life: 40, size: rand(1.6, 2.8) });
        }
      }

      // the landing: flat on its back, all at once
      once('land', u > 0.5 && w.z < 16 * s, () => {
        const m = at(20);
        w.land = { x: m[0], y: m[1] };
        Sea.water.splash(m[0], m[1], 140 * s, -5);
        for (const d of [-90, 100]) {
          const q = at(d);
          Sea.water.splash(q[0], q[1], 80 * s, -2.4);
          Sea.scene.burst('spray', q[0], q[1], 3, 26, { speed: 3.6, up: 5.6, life: 62, size: 3.2 });
        }
        Sea.scene.emit({ k: 'ring', x: m[0], y: m[1], life: 80, size: 40 * s, grow: 210 * s });
        Sea.scene.burst('spray', m[0], m[1], 4, 80, { speed: 5.2, up: 7.4, life: 78, size: 3.8 });
        Sea.scene.burst('foam', m[0], m[1], 0, 44, { speed: 2.4, life: 170, size: 7 });
      });
      if (p >= 1) go('settle');
    }

    return {
      update(t, dt) {
        const k = dt * 60;
        w.age += dt; w.st += dt;
        const tr = w.state === 'feed' ? 0.014 : 0.005;     // it turns harder when it is working a krill cloud
        w.yaw += clamp(turn(w.yaw, w.course + Math.sin(t * 0.2 + w.seed) * (w.state === 'feed' ? 0 : 0.22)), -tr, tr) * k;
        w.yaw += Sea.world.avoid(w.x, w.y, w.yaw, 200, true) * 0.5 * k;
        const fx = Math.cos(w.yaw), fy = Math.sin(w.yaw);
        const ease = (rate) => 1 - Math.pow(rate, k);
        let zTo = DEEP * s, pitchTo = 0, zRate = 0.965;
        // it lingers at the surface and while it sinks, which also keeps the breach on the page
        const paceTo = w.leaving ? 1.7 : (w.state === 'blow' || w.state === 'sink') ? 0.4 : 1;
        w.pace += (paceTo - w.pace) * ease(0.97);

        if (w.state === 'approach') {
          // wait until it is well onto the page
          if (!Sea.world.gone(w.x, w.y, -Math.min(innerWidth, innerHeight) * 0.25)) {
            go(w.leaving ? 'away' : 'blow');
            // A breach is best seen side-on or going up the page (coming straight down the
            // page it is nose-on to you), so if it is heading down, it swings round first.
            // It also turns towards the open page, so the breach happens in view.
            const toMid = Math.atan2(innerHeight * 0.5 - w.y, innerWidth * 0.5 - w.x);
            w.course = Math.sin(toMid) > 0.2 ? (w.x < innerWidth * 0.5 ? -0.2 : Math.PI + 0.2) : toMid;
          }
        } else if (w.state === 'blow') {
          zTo = -22 * s;            // the back breaks the surface
          once('blow', w.st > 1.5, () => {
            // a tall, bushy blow
            const n = at(100);
            Sea.scene.burst('spray', n[0], n[1], 12, 40, { speed: 0.8, up: 6, life: 60, size: 2.6 });
            Sea.water.splash(n[0], n[1], 40 * s, 0.8);
          });
          if (w.st > 3.6) {
            // if there is krill about, it feeds before anything else
            w.krill = Sea.eco.find(['krill'], w.x, w.y, 800);
            go(w.krill && !Sea.world.gone(w.krill.x, w.krill.y, -40) ? 'feed' : 'sink');
          }
        } else if (w.state === 'feed') {
          // Bubble-net feeding: it circles in on the krill blowing a ring of bubbles
          // that pens them in, then lunges up through the middle with its mouth open.
          const g = w.krill, d = Math.hypot(g.x - w.x, g.y - w.y);
          w.course = Math.atan2(g.y - w.y, g.x - w.x);
          w.pace = 1.3; zTo = -34 * s;
          if (d < 330) {
            g.herd();
            w.net = (w.net || 0) + dt * 2.6;
            for (let i = 0; i < 2; i++) {
              const a = w.net + i * 3.14, r = g.r + 26;
              if (Math.random() < 0.5 * k) Sea.scene.emit({ k: 'ring', x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r, life: 30, size: 2, grow: 12 });
            }
          }
          if (d < g.r * 0.4 + 50 * s) {
            pitchTo = 0.6; zTo = -4 * s;
            once('gulp', true, () => {
              g.take(g.count * 0.5);
              const n = at(110);
              Sea.water.splash(n[0], n[1], 90 * s, 2.2);
              Sea.scene.emit({ k: 'ring', x: n[0], y: n[1], life: 60, size: 20, grow: 120 * s });
              Sea.scene.burst('spray', n[0], n[1], 5, 40, { speed: 2.6, up: 4.6, life: 54, size: 2.8 });
              w.st = 100;      // start the clock on the lunge
            });
          }
          if ((w.marks.gulp && w.st > 101.8) || (!w.marks.gulp && w.st > 16) || g.count <= 0) go('sink');
        } else if (w.state === 'sink') {
          zTo = -84 * s; pitchTo = w.st < 1.2 ? -0.22 : 0.35; zRate = 0.975;
          if (w.st > 2.4) { go('breach'); w.z0 = w.z; w.pitch0 = w.pitch; }
        } else if (w.state === 'breach') {
          breachStep(dt);
        } else if (w.state === 'settle') {
          // the sea closes over it; it rights itself and sinks while the water rebounds
          zTo = -58 * s; zRate = 0.98;
          w.roll = Math.PI + smooth(w.st / 2.2) * Math.PI;
          const l = w.land || w;
          once('rebound', w.st > 0.4, () => {
            Sea.water.splash(l.x, l.y, 100 * s, 2.4);
            Sea.scene.emit({ k: 'ring', x: l.x, y: l.y, life: 90, size: 20 * s, grow: 170 * s });
            Sea.scene.burst('spray', l.x, l.y, 2, 30, { speed: 2, up: 4.4, life: 54, size: 2.6 });
          });
          once('after', w.st > 1.1, () => {
            Sea.water.splash(l.x, l.y, 70 * s, -1.2);
            Sea.scene.emit({ k: 'ring', x: l.x, y: l.y, life: 100, size: 10 * s, grow: 130 * s });
          });
          if (w.st > 2.6) { w.roll = 0; go('cruise'); }
        } else if (w.state === 'cruise') {
          zTo = -30 * s;
          if (w.st > 5 || (w.st > 1.5 && Sea.world.gone(w.x, w.y, -140))) go('fluke');
        } else if (w.state === 'fluke') {
          // nose down, tail up: the flukes lift clear, then slide under
          pitchTo = -0.95; zRate = 0.978;
          zTo = (w.st < 1.8 ? -34 : -200) * s;
          if (w.st > 4.4) go('away');
        } else {
          zTo = -85 * s;
          if (w.pace < 1.4) w.pace += 0.01 * k;
        }

        if (w.state !== 'breach') {
          w.z += (zTo - w.z) * ease(zRate);
          w.pitch += (pitchTo - w.pitch) * ease(0.955);
        }
        w.x += fx * SPEED * w.pace * k; w.y += fy * SPEED * w.pace * k;
        w.phase += dt * (1.6 + w.pace * 1.1);

        // a slow swell above it whenever it is near the surface
        w.swell += dt;
        if (w.swell > 0.28 && w.z > -42 * s && w.state !== 'breach' && !Sea.world.gone(w.x, w.y, 40)) {
          w.swell = 0;
          const d = rand(-100, 110) * s;
          Sea.water.splash(w.x + fx * d, w.y + fy * d, 46 * s, -0.4);
          if (w.z > -27 * s) Sea.scene.emit({ k: 'foam', x: w.x - fx * 70 * s + rand(-16, 16), y: w.y - fy * 70 * s + rand(-16, 16), life: 60, size: rand(3, 6) });
        }

        if (w.age > 8 && Sea.world.gone(w.x, w.y, 370)) this.dead = true;
      },

      under(c) {
        if (Sea.world.gone(w.x, w.y, 240)) return;
        // clearest just under the surface, fainter in the deep, gone when it is in the air
        const depth = -w.z / s;
        const a = depth < 0 ? 0.42 * clamp(1 + depth / 50, 0, 1) : clamp(0.48 - depth * 0.0024, 0.07, 0.48);
        if (a < 0.02) return;
        c.save();
        c.translate(w.x + 5, w.y + 8); c.rotate(w.yaw); c.scale(s * Math.max(0.35, Math.cos(w.pitch)), s);
        c.fillStyle = `rgba(8,24,46,${a.toFixed(2)})`;
        c.fill(outline());
        c.restore();
      },

      shadow(c) {
        if (w.z < 8) return;
        const lift = clamp(w.z / (100 * s), 0, 1);
        Sea.scene.blobShadow(c, w.x + lift * 14, w.y + lift * 18, w.yaw, 130 * s * Math.max(0.4, Math.cos(w.pitch)), 34 * s, 0.24 - lift * 0.08);
      },

      draw(S) {
        if (Sea.world.gone(w.x, w.y, 270)) return;
        // nothing reaches the surface while it is deep and level
        const level = w.state === 'approach' || w.state === 'away' || w.state === 'cruise' || w.state === 'blow';
        if (level && w.z + 40 * s < 0) return;
        ph = w.phase;
        S.mesh(model, { x: w.x, y: w.y, z: w.z, yaw: w.yaw, pitch: w.pitch, roll: w.roll, s }, { deform: flex });
      },

      leave() { w.leaving = true; if (w.state !== 'breach' && w.state !== 'settle') go('away'); }
    };
  }

  Sea.creature({
    id: 'humpback',
    name: 'Humpback whale',
    kind: 'event',
    eats: ['krill'],
    weight: 1,
    max: 1,
    cooldown: 80,
    spawn
  });
})();
