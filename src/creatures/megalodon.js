// Megalodon: a rare visitor. Most of the time all you get is a very large shadow
// under the page and a tall fin cutting the surface.
//
// It picks something to hunt when it arrives:
//   - a ship, if one is on the page: it comes up underneath, jaws open, and
//     bites it in half. It does this with mischief on or off.
//   - your cursor (mischief mode only). You can dodge it by getting out of its
//     line; it turns, but not quickly. If the mouth reaches the cursor it has
//     it, and keeps swimming. Pull the mouse hard the opposite way to drag it
//     back out: it is a tug of war. If it leaves the page with the cursor, the
//     cursor is handed back a moment later. Esc frees it at once.
//     On the way it eats the words it passes under (they grow back).
//   - nothing: it cruises through, comes up once to show its teeth, and leaves.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;

  const PULL_NEEDED = 750;   // px of mouse travel against the shark
  const CRUISE_Z = -36;      // deep enough that only the fin shows
  const MOUTH_X = 128;       // along the body, in model units
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // ---------- model ----------
  // The body is a tube from the tail to the back of the mouth. The snout is two
  // separate half-cones (upper and lower jaw) so the mouth can open.
  const SECTIONS = [[-150, 3, 7], [-100, 11, 15], [-40, 25, 25], [30, 31, 29], [70, 27, 25], [96, 23, 21]];
  const SKIN_TOP = [52, 72, 90], SKIN_MID = [92, 116, 134], SKIN_BELLY = [228, 234, 238];
  const GUM = [150, 28, 44], TOOTH = [250, 250, 244];

  function body() {
    const b = new Sea.models.Builder();
    b.tube(SECTIONS, 8, (x, y, z, h) => (x > 95 ? GUM : z > h * 0.3 ? SKIN_TOP : z < -h * 0.35 ? SKIN_BELLY : SKIN_MID));
    // dorsal fin: a thin swept-back wedge
    b.solid(() => {
      const rear = b.vert(-24, 0, 20), front = b.vert(38, 0, 24), right = b.vert(8, 4.5, 20), left = b.vert(8, -4.5, 20);
      const tip = b.vert(-22, 0, 76);
      const dark = [40, 58, 76];
      b.face([front, right, tip], dark); b.face([right, rear, tip], dark);
      b.face([rear, left, tip], dark); b.face([left, front, tip], dark);
      b.face([rear, right, front, left], dark);
    });
    // tail fin (upright crescent) and side fins: thin, so two-sided
    const fin = [44, 62, 80];
    b.face([b.vert(-146, 0, 6), b.vert(-196, 0, 56), b.vert(-166, 0, 2)], fin, true);
    b.face([b.vert(-146, 0, -6), b.vert(-186, 0, -40), b.vert(-166, 0, 0)], fin, true);
    for (const sd of [-1, 1]) {
      b.face([b.vert(50, sd * 26, -8), b.vert(8, sd * 84, -16), b.vert(14, sd * 28, -8)], fin, true);
      b.face([b.vert(-96, sd * 10, -4), b.vert(-124, sd * 34, -8), b.vert(-116, sd * 9, -4)], fin, true);
    }
    return b.mesh();
  }

  // One jaw: half a cone from the mouth (x = 96) to the nose, with a flat gum
  // side and a row of teeth along its rim. sign = +1 upper, -1 lower.
  function jaw(sign) {
    const b = new Sea.models.Builder();
    const W = 23, H = 21, K = 5;
    b.solid(() => {
      const ringAt = (x, w, h) => {
        const r = [];
        for (let k = 0; k <= K; k++) { const a = (k / K) * Math.PI; r.push(b.vert(x, Math.cos(a) * w, sign * Math.sin(a) * h)); }
        return r;
      };
      const r0 = ringAt(96, W, H), r1 = ringAt(128, 15, 12);
      const tip = b.vert(sign > 0 ? 156 : 146, 0, 0);
      const skin = sign > 0 ? SKIN_TOP : SKIN_BELLY;
      for (let k = 0; k < K; k++) {
        b.face([r0[k], r0[k + 1], r1[k + 1], r1[k]], k === 0 || k === K - 1 ? SKIN_MID : skin);
        b.face([r1[k], r1[k + 1], tip], skin);
      }
      b.face([r0[0], r1[0], tip, r1[K], r0[K]], GUM); // roof / floor of the mouth
      b.face(r0.slice(), GUM);
    });
    // teeth: little triangles standing on the rim, pointing into the mouth
    const rim = (u, side) => [100 + u * (sign > 0 ? 52 : 43), side * (W - 1) * (1 - u * 0.92)];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const [x0, y0] = rim(i / 7, side), [x1, y1] = rim((i + 1) / 7, side);
        b.face([b.vert(x0, y0, 0), b.vert(x1, y1, 0), b.vert((x0 + x1) / 2, (y0 + y1) / 2 * 0.92, -sign * 8)], TOOTH, true);
      }
    }
    if (sign > 0) { // eyes
      b.box(108, 113, 15.5, 17.5, 6, 10, [14, 16, 20]);
      b.box(108, 113, -17.5, -15.5, 6, 10, [14, 16, 20]);
    }
    return b.mesh();
  }

  let gulpTimer = 0;

  // shared with the ordinary shark, which is the same animal at a third of the size
  Sea.megalodonModel = () => Sea.models.once('megalodon', () => ({ body: body(), upper: jaw(1), lower: jaw(-1) }));

  function spawn() {
    const model = Sea.megalodonModel();
    const { el } = Sea.util;
    const vw = innerWidth, vh = innerHeight;
    const ship0 = Sea.ships ? Sea.ships.afloat()[0] : null;
    // What it is after. With mischief on it may come for your cursor. Otherwise it
    // goes for a ship, and if there is none on the page one sails in for it, so a
    // megalodon always ends in a bite.
    let hunt = Sea.settings.mischief && (!ship0 || Math.random() < 0.6) ? 'cursor' : 'ship';
    let prey = hunt === 'ship' ? ship0 : null, waiting = false;
    if (hunt === 'ship' && !prey && Sea.ships) { prey = Sea.ships.muster('merchant', 1, false).ships[0]; waiting = true; }
    if (hunt === 'ship' && !prey) hunt = 'none';
    const aim = () => (hunt === 'cursor' ? Sea.cursor : hunt === 'ship' && prey ? prey : { x: vw / 2, y: vh / 2 });

    // start off-screen, on a line through the target
    const R = Math.hypot(vw, vh) * 0.62 + 220;
    let a0 = rand(0, 6.283);
    const from = (p) => ({ x: p.x + Math.cos(a0) * R, y: p.y + Math.sin(a0) * R });
    for (let i = 0, p = aim(); i < 16 && !Sea.world.gone(from(p).x, from(p).y, 120); i++) a0 = rand(0, 6.283);
    const p0 = from(aim());
    const sh = {
      x: p0.x, y: p0.y,
      yaw: a0 + Math.PI, z: CRUISE_Z, pitch: 0, jaw: 0, wait: 0,
      // 'wait': lying deep off the page until the ship it was sent has come into view
      state: waiting ? 'wait' : 'approach', speed: 5.2, pull: 0, eaten: 0, tick: 0, committed: false, closest: 1e9, shake: 0, showT: 0
    };

    const label = el('div', {
      position: 'absolute', left: '0', top: '0', width: '160px', padding: '7px 10px 9px', borderRadius: '12px',
      background: 'rgba(12,22,32,.88)', color: '#fff', font: `700 11px ${FONT}`, letterSpacing: '.07em',
      textAlign: 'center', pointerEvents: 'none', display: 'none', boxSizing: 'border-box'
    }, 'PULL IT OUT');
    const track = el('div', { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,.25)', marginTop: '6px', overflow: 'hidden' });
    const bar = el('div', { height: '100%', width: '0%', background: '#5ac8fa', borderRadius: '2px' });
    track.appendChild(bar); label.appendChild(track);
    Sea.util.layer().appendChild(label);

    const offDelta = Sea.cursor.onDelta((dx, dy) => {
      if (sh.state !== 'hold') return;
      // movement against the shark's heading counts; going with it loses ground
      const against = -(dx * Math.cos(sh.yaw) + dy * Math.sin(sh.yaw));
      sh.pull = Math.max(0, sh.pull + (against > 0 ? against : against * 0.4));
    });

    // where the mouth is, on the water and on screen
    const mouth = () => {
      const c = Math.cos(sh.yaw), s = Math.sin(sh.yaw), cp = Math.cos(sh.pitch), sp = Math.sin(sh.pitch);
      const gx = sh.x + c * MOUTH_X * cp, gy = sh.y + s * MOUTH_X * cp, gz = sh.z + MOUTH_X * sp;
      const scr = Sea.scene.project(gx, gy, Math.max(0, gz));
      return { gx, gy, sx: scr[0], sy: scr[1] };
    };

    // tail sway: bends the back half of the body side to side (a fish, not a whale)
    let swayT = 0;
    const swayAt = (x) => { const w = Math.max(0, (60 - x) / 210); return Math.sin(swayT - x * 0.022) * 26 * w * Math.sqrt(w); };
    const sway = (v) => [v[0], v[1] + swayAt(v[0]), v[2]];
    // jaws hinge at the back of the mouth (x = 96)
    const hinge = (angle) => (v) => {
      const x = v[0] - 96, c = Math.cos(angle), s = Math.sin(angle);
      return sway([96 + x * c - v[2] * s, v[1], v[2] * c + x * s]);
    };

    const ent = {
      update(t, dt) {
        const k = dt * 60, vw = innerWidth, vh = innerHeight;
        const ap = (r) => 1 - Math.pow(1 - r, k);
        if (sh.state === 'wait') {
          // keep station off the page, lined up on the ship, until it is well into view
          sh.wait += dt;
          const p = from(prey);
          sh.x = p.x; sh.y = p.y; sh.yaw = a0 + Math.PI;
          if (!prey.afloat || !Sea.world.gone(prey.x, prey.y, -140) || sh.wait > 15) sh.state = 'approach';
          return;
        }
        sh.tick += k;
        swayT = t * (sh.state === 'hold' ? 9 : 6.5);
        const fx = Math.cos(sh.yaw), fy = Math.sin(sh.yaw);
        const m = mouth();
        let pitchTo = 0, zTo = CRUISE_Z, jawTo = 0;

        if (sh.state === 'hold' && !Sea.cursor.held) sh.state = 'leave';   // freed by Esc, or mischief switched off
        if (hunt === 'ship' && !(prey && prey.afloat)) { hunt = 'none'; prey = null; if (sh.state === 'approach') sh.committed = true; }

        if (sh.state === 'approach') {
          const tg = aim();
          const d = hunt === 'cursor' ? Math.hypot(tg.x - m.sx, tg.y - m.sy) : Math.hypot(tg.x - m.gx, tg.y - m.gy);
          if (!sh.committed) sh.yaw += clamp(turn(sh.yaw, Math.atan2(tg.y - sh.y, tg.x - sh.x)), -0.03, 0.03) * k;   // a wide turning circle
          if (d < 300) { pitchTo = 0.8; zTo = -30; jawTo = 0.62; }          // coming up
          if (d < 130) sh.committed = true;                                 // too late to turn
          sh.closest = Math.min(sh.closest, d);
          if (sh.committed && d > sh.closest + 90) sh.state = 'leave';      // missed, or just showing off

          // any ship that ends up in the mouth is lunch
          if (Sea.ships && sh.pitch > 0.4) {
            for (const s of Sea.ships.afloat()) {
              if (Math.hypot(s.x - m.gx, s.y - m.gy) > 44) continue;
              s.sinkBy('megalodon');
              Sea.water.splash(m.gx, m.gy, 90, -4);
              Sea.scene.burst('spray', m.gx, m.gy, 6, 30, { speed: 3, up: 5.4, life: 54, size: 3 });
              if (hunt === 'ship') sh.state = 'leave';
            }
          }
          if (hunt === 'cursor') {
            // eats the words it passes under
            if (sh.tick > 7) {
              sh.tick = 0;
              if (!Sea.world.gone(m.gx, m.gy, 0) && Sea.page.eatWordAt(m.gx + rand(-14, 14), m.gy + rand(-14, 14))) {
                sh.eaten++; Sea.water.splash(m.gx, m.gy, 18, -1);
              }
            }
            if (d < 38 && sh.pitch > 0.45 && Sea.cursor.capture()) {
              sh.state = 'hold'; sh.pull = 0;
              Sea.water.splash(m.sx, m.sy, 80, -4);
              Sea.scene.burst('spray', m.gx, m.gy, 6, 18, { speed: 2.4, up: 5, life: 46, size: 3 });
            }
          }
        } else if (sh.state === 'hold') {
          const u = sh.pull / PULL_NEEDED;
          sh.pull = Math.max(0, sh.pull - 2.2 * k);
          sh.speed += ((1.9 - u * 4.4) - sh.speed) * ap(0.2);                // you can drag it backwards
          pitchTo = 0.92; zTo = -28; jawTo = 0.22 + u * 0.3;
          sh.shake = Math.sin(t * 24) * (0.03 + u * 0.07);
          const j = 1 + u * 3;
          Sea.cursor.place(m.sx - fx * u * 34 + rand(-1.5, 1.5) * j, m.sy - fy * u * 34 + rand(-1.5, 1.5) * j, (sh.yaw * 180) / Math.PI + 90);
          label.style.display = 'block';
          label.style.transform = `translate(${clamp(m.sx - 80, 8, vw - 168)}px, ${clamp(m.sy - 96, 8, vh - 60)}px)`;
          bar.style.width = Math.round(Math.min(1, u) * 100) + '%';
          if (sh.tick > 5) { sh.tick = 0; Sea.scene.burst('spray', m.gx, m.gy, 4, 3, { speed: 2, up: 3.6, life: 34, size: 2.4 }); }

          if (sh.pull >= PULL_NEEDED) {
            // you win
            Sea.cursor.release();
            label.style.display = 'none';
            sh.state = 'leave'; sh.shake = 0;
            Sea.water.splash(m.sx, m.sy, 90, 5);
          } else if (m.sx < -40 || m.sx > vw + 40 || m.sy < -40 || m.sy > vh + 40) {
            // it has left with the cursor: hand it back where it went out
            label.style.display = 'none';
            sh.state = 'gone';
            const ex = clamp(m.sx, 30, vw - 30), ey = clamp(m.sy, 30, vh - 30);
            Sea.cursor.place(-80, -80, 0);
            gulpTimer = setTimeout(() => {
              Sea.cursor.place(ex, ey, 0);
              Sea.cursor.release();
              Sea.water.splash(ex, ey, 70, -3);
            }, 2000);
          }
        } else {
          label.style.display = 'none';
          sh.speed += (8.5 - sh.speed) * ap(0.05);                           // leave / gone: dive and go
        }

        sh.pitch += (pitchTo - sh.pitch) * ap(0.09);
        sh.z += (zTo - sh.z) * ap(0.09);
        sh.jaw += (jawTo - sh.jaw) * ap(0.2);
        sh.x += fx * sh.speed * k; sh.y += fy * sh.speed * k;
        if (sh.state === 'approach' && sh.speed < 5.2) sh.speed += 0.1 * k;

        // the fin cuts a wake; the body shoves the water about
        sh.showT += k;
        if (sh.showT > 2 && !Sea.world.gone(sh.x, sh.y, 60)) {
          sh.showT = 0;
          Sea.scene.emit({ k: 'foam', x: sh.x - fx * 18 + rand(-6, 6), y: sh.y - fy * 18 + rand(-6, 6), life: 40, size: rand(2.5, 5.5) });
          if (Math.random() < 0.6) { const along = rand(-120, 110); Sea.water.splash(sh.x + fx * along, sh.y + fy * along, 34, -0.6); }
        }

        const far = Sea.world.gone(sh.x, sh.y, 420);
        const away = (sh.x - vw / 2) * fx + (sh.y - vh / 2) * fy > 0;
        if (far && away && sh.state !== 'hold') finish();
      },

      // the whole animal seen through the water
      under(c) {
        if (Sea.world.gone(sh.x, sh.y, 260)) return;
        const cy = Math.cos(sh.yaw), sy = Math.sin(sh.yaw);
        const pt = (x, y) => { const yy = y + swayAt(x); return [sh.x + 8 + x * cy - yy * sy, sh.y + 12 + x * sy + yy * cy]; };
        const up = [], down = [];
        for (const [x, w] of [[-196, 2], [-150, 5], [-100, 14], [-40, 31], [10, 39], [22, 96], [52, 40], [96, 30], [130, 19], [158, 0]]) {
          up.push(pt(x, -w * 1.15)); down.push(pt(x, w * 1.15));
        }
        c.fillStyle = `rgba(4,18,40,${(0.38 * clamp(-sh.z / 40, 0.35, 1) + 0.1).toFixed(2)})`;
        c.beginPath();
        c.moveTo(up[0][0], up[0][1]);
        for (const p of up) c.lineTo(p[0], p[1]);
        for (let i = down.length - 1; i >= 0; i--) c.lineTo(down[i][0], down[i][1]);
        c.closePath(); c.fill();
      },

      draw(S) {
        if (Sea.world.gone(sh.x, sh.y, 280)) return;
        const pose = { x: sh.x, y: sh.y, z: sh.z, yaw: sh.yaw + sh.shake, pitch: sh.pitch };
        S.mesh(model.body, pose, { deform: sway });
        S.mesh(model.upper, pose, { deform: hinge(sh.jaw * 0.45) });
        S.mesh(model.lower, pose, { deform: hinge(-sh.jaw) });
      },

      leave() { if (sh.state === 'hold') Sea.cursor.release(); sh.state = 'leave'; }
    };

    function finish() {
      ent.dead = true;
      offDelta();
      label.remove();
    }
    return ent;
  }

  Sea.feature({ id: 'megalodon', stop() { clearTimeout(gulpTimer); } });

  Sea.creature({
    id: 'megalodon',
    name: 'Megalodon',
    kind: 'monster',
    regions: ['open', 'tropical'],
    weight: 0.35,
    max: 1,
    cooldown: 200,
    spawn
  });
})();
