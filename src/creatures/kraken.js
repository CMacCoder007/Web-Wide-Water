// Kraken: a rare visitor. A huge dark shape with two yellow eyes settles under
// the page, and three tentacles arch up out of the water around it.
//
//   - One goes for the nearest ship, wraps it and breaks it (mischief on or off).
//   - One just slaps the water.
//   - One hunts your cursor (mischief mode only). You can outrun it. If it
//     catches the cursor it lifts it into the air and waves it about: shake the
//     mouse hard to break free. Fail, and it takes the cursor under for a moment
//     before giving it back. Esc frees it at once.
//     With mischief off, this one only sways.
//
// In mischief mode it leaves in a cloud of ink: a big blot over about a third of
// the screen that clears in a few seconds. You can click through it, and wipe it
// away with the mouse.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp } = Sea.util;

  const N = 18;                // joints along a tentacle
  const HUNT_S = 8, HOLD_S = 6;
  const SHAKE_NEEDED = 2600;   // px of frantic mouse movement to break free
  const INK_SCALE = 4;
  const FLESH = [150, 44, 84], FLESH_DARK = [96, 24, 52], SUCKER = [244, 196, 212];
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // ---------- ink: its own small canvas, blurred, wipeable ----------
  let ink = null, ictx = null, inkAt = null, inkStart = 0, inkDone = 0, inkRaf = 0, inkR = 300, offWipe = null;

  function squirt(x, y) {
    if (!Sea.active || !Sea.settings.mischief) return;
    clearInk();
    ink = Sea.util.el('canvas', {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', filter: 'blur(9px)'
    });
    ink.width = Math.ceil(innerWidth / INK_SCALE); ink.height = Math.ceil(innerHeight / INK_SCALE);
    ictx = ink.getContext('2d');
    Sea.util.layer().appendChild(ink);
    inkAt = { x, y }; inkStart = performance.now(); inkDone = 0;
    inkR = Math.min(innerWidth, innerHeight) * 0.4;      // the blot covers about a third of the screen
    offWipe = Sea.cursor.onDelta(() => {
      if (!ictx || inkDone < 20 || Sea.cursor.held) return;
      ictx.globalCompositeOperation = 'destination-out';
      ictx.fillStyle = 'rgba(0,0,0,.85)';
      ictx.beginPath();
      ictx.arc(Sea.cursor.x / INK_SCALE, Sea.cursor.y / INK_SCALE, 46 / INK_SCALE, 0, 6.283);
      ictx.fill();
    });
    Sea.water.splash(x, y, 120, -5);
    inkRaf = Sea.raf(stepInk);
  }

  // one step per 1/60 s of real time, however fast the screen refreshes
  function stepInk(now) {
    inkRaf = 0;
    if (!ink) return;
    const due = Math.min(inkDone + 4, Math.floor((now - inkStart) * 0.06));
    for (; inkDone < due; inkDone++) {
      const age = inkDone;
      if (age < 70) {
        ictx.globalCompositeOperation = 'source-over';
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * 6.283, d = Math.random() * Math.min(age * 9, inkR);
          const r = (26 + Math.random() * 60 + age * 0.6) / INK_SCALE;
          ictx.fillStyle = `rgba(${9 + Math.random() * 10 | 0}, 5, ${20 + Math.random() * 14 | 0}, .5)`;
          ictx.beginPath();
          ictx.arc((inkAt.x + Math.cos(a) * d) / INK_SCALE, (inkAt.y + Math.sin(a) * d) / INK_SCALE, r, 0, 6.283);
          ictx.fill();
        }
      } else if (age > 190 && age % 3 === 0) {
        ictx.globalCompositeOperation = 'destination-out';
        ictx.fillStyle = 'rgba(0,0,0,.045)';
        ictx.fillRect(0, 0, ink.width, ink.height);
      }
    }
    if (inkDone > 520) { clearInk(); return; }
    inkRaf = Sea.raf(stepInk);
  }

  function clearInk() {
    Sea.caf(inkRaf); inkRaf = 0;
    if (offWipe) offWipe();
    if (ink) ink.remove();
    ink = ictx = offWipe = null;
  }

  // ---------- tentacles ----------
  const tentacle = (bx, by, ph) => ({ bx, by, ph, tx: bx, ty: by, tz: 0, rise: 0, pts: [], hit: false });

  // an arch from the water at the base, up and over, down to the tip
  function shape(tn, t) {
    const dx = tn.tx - tn.bx, dy = tn.ty - tn.by, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const bend = Math.sin(t * 1.2 + tn.ph) * len * 0.18;
    const cx = (tn.bx + tn.tx) / 2 + nx * bend, cy = (tn.by + tn.ty) / 2 + ny * bend;
    const H = (46 + len * 0.2) * tn.rise;
    tn.pts.length = 0;
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      const w = Math.sin(u * 8 - t * 4 + tn.ph) * 9 * u * tn.rise;
      tn.pts.push({
        x: v * v * tn.bx + 2 * v * u * cx + u * u * tn.tx + nx * w,
        y: v * v * tn.by + 2 * v * u * cy + u * u * tn.ty + ny * w,
        z: Math.sin(Math.PI * Math.pow(u, 0.75)) * H + u * tn.tz * tn.rise - (1 - tn.rise) * 30,
        r: 13 * v + 3.2
      });
    }
  }

  // move a tentacle's tip towards a point, at most max px per 1/60 s; returns the distance left
  function chase(tn, x, y, max) {
    const dx = x - tn.tx, dy = y - tn.ty, d = Math.hypot(dx, dy);
    if (d <= max) { tn.tx = x; tn.ty = y; } else { tn.tx += (dx / d) * max; tn.ty += (dy / d) * max; }
    return d;
  }

  // each segment is a faceted tube: a lit top, two darker flanks, pale suckers beneath
  function drawTentacle(S, tn) {
    const P = tn.pts;
    for (let i = 0; i < N; i++) {
      const a = P[i], b = P[i + 1];
      if (a.z < -2 && b.z < -2) continue;
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      const L1 = [a.x - nx * a.r, a.y - ny * a.r, a.z], R1 = [a.x + nx * a.r, a.y + ny * a.r, a.z];
      const L2 = [b.x - nx * b.r, b.y - ny * b.r, b.z], R2 = [b.x + nx * b.r, b.y + ny * b.r, b.z];
      const T1 = [a.x, a.y, a.z + a.r * 0.9], T2 = [b.x, b.y, b.z + b.r * 0.9];
      const B1 = [a.x, a.y, a.z - a.r * 0.7], B2 = [b.x, b.y, b.z - b.r * 0.7];
      const band = i % 2 ? FLESH : [FLESH[0] * 0.9, FLESH[1] * 0.9, FLESH[2] * 0.9];
      S.poly([L1, T1, T2, L2], band, { two: true });
      S.poly([T1, R1, R2, T2], band, { two: true });
      S.poly([L1, L2, B2, B1], FLESH_DARK, { two: true });
      S.poly([R1, B1, B2, R2], FLESH_DARK, { two: true });
      if (i % 2 === 0 && i > 2) {
        const m = [(a.x + b.x) / 2, (a.y + b.y) / 2 + a.r * 0.5, (a.z + b.z) / 2 - a.r * 0.2], q = a.r * 0.32;
        S.poly([[m[0] - q, m[1], m[2] - q], [m[0] + q, m[1], m[2] - q], [m[0] + q, m[1], m[2] + q], [m[0] - q, m[1], m[2] + q]], SUCKER, { two: true, bias: 2, flat: true });
      }
    }
  }

  function spawn() {
    const { el } = Sea.util;
    const vw = innerWidth, vh = innerHeight;
    const cx = vw * rand(0.36, 0.64), cy = vh * rand(0.42, 0.66);

    const label = el('div', {
      position: 'absolute', left: '0', top: '0', width: '160px', padding: '7px 10px 9px', borderRadius: '12px',
      background: 'rgba(20,10,24,.86)', color: '#fff', font: `700 11px ${FONT}`, letterSpacing: '.07em',
      textAlign: 'center', pointerEvents: 'none', display: 'none', boxSizing: 'border-box'
    }, 'SHAKE TO ESCAPE');
    const track = el('div', { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,.25)', marginTop: '6px', overflow: 'hidden' });
    const bar = el('div', { height: '100%', width: '0%', background: '#ff5c8a', borderRadius: '2px' });
    track.appendChild(bar); label.appendChild(track);
    Sea.util.layer().appendChild(label);

    const tents = [0, 2.1, 4.2].map((a, i) => tentacle(cx + Math.cos(a + 0.4) * 78, cy + Math.sin(a + 0.4) * 56, i * 2.1));
    const [hunter, wrecker, slapper] = tents;
    let phase = 'rise', age = 0, shake = 0, under = 0, loom = 0;
    const setPhase = (p) => { phase = p; age = 0; };
    const offDelta = Sea.cursor.onDelta((dx, dy) => { if (phase === 'hold') shake += Math.abs(dx) + Math.abs(dy); });

    Sea.water.splash(cx, cy, 170, -4.5);
    Sea.scene.emit({ k: 'ring', x: cx, y: cy, life: 60, size: 30, grow: 150 });

    return {
      update(t, dt) {
        const k = dt * 60, vw = innerWidth, vh = innerHeight;
        const mis = Sea.settings.mischief;
        age += dt;
        label.style.display = 'none';
        const leaving = phase === 'retreat';
        loom += ((leaving ? 0 : 1) - loom) * 0.04 * k;
        for (const tn of tents) tn.rise += ((leaving ? 0 : 1) - tn.rise) * (leaving ? 0.07 : 0.05) * k;

        if ((phase === 'hold' || phase === 'drag') && !Sea.cursor.held) setPhase('retreat');   // freed by Esc, or mischief switched off

        if (phase === 'rise' || phase === 'hunt') {
          // the wrecker: find a ship, wrap it, break it
          const prey = phase === 'hunt' && Sea.ships ? Sea.ships.afloat()[0] : null;
          if (prey) {
            wrecker.tz = 6;
            if (chase(wrecker, prey.x, prey.y, 4.6 * k) < 16) {
              prey.sinkBy('kraken');
              Sea.scene.burst('spray', prey.x, prey.y, 4, 14, { speed: 2.2, up: 4.6, life: 44, size: 2.8 });
            }
          } else {
            wrecker.tz = 40;
            chase(wrecker, wrecker.bx + Math.cos(t * 0.7 + 1) * 120, wrecker.by + Math.sin(t * 0.9 + 1) * 90, 4 * k);
          }
          // the slapper: up, then down hard
          const beat = Math.sin(t * 2.6);
          slapper.tz = 70 * Math.max(0, beat);
          chase(slapper, slapper.bx + Math.cos(t * 0.5 + 4) * 150, slapper.by + Math.sin(t * 0.6 + 4) * 110, 5 * k);
          if (beat < -0.96 && !slapper.hit) {
            slapper.hit = true;
            Sea.water.splash(slapper.tx, slapper.ty, 60, -2.8);
            Sea.scene.emit({ k: 'ring', x: slapper.tx, y: slapper.ty, life: 36, size: 8, grow: 60 });
            Sea.scene.burst('spray', slapper.tx, slapper.ty, 2, 9, { speed: 1.8, up: 4, life: 38, size: 2.4 });
          } else if (beat > 0) slapper.hit = false;
        }

        if (phase === 'rise') {
          hunter.tz = 50;
          chase(hunter, hunter.bx + 50, hunter.by - 60, 5 * k);
          if (age > 1.5) setPhase('hunt');
        } else if (phase === 'hunt') {
          if (mis) {
            hunter.tz = 14;
            const d = chase(hunter, Sea.cursor.x, Sea.cursor.y + 10, 6.6 * k);
            if (d < 22 && Sea.cursor.capture()) {
              shake = 0; setPhase('hold');
              Sea.water.splash(hunter.tx, hunter.ty, 50, -2.6);
            }
          } else {
            hunter.tz = 60;
            chase(hunter, hunter.bx + Math.cos(t * 0.6) * 130, hunter.by - 30 + Math.sin(t * 0.8) * 90, 4 * k);
          }
          if (phase === 'hunt' && age > HUNT_S) { squirt(cx, cy); setPhase('retreat'); }   // gives up, and inks anyway
        } else if (phase === 'hold') {
          // lift the prize high and wave it about
          hunter.tz = 110;
          chase(hunter, cx + Math.sin(t * 1.1) * vw * 0.2, cy - 40 + Math.sin(t * 2.2) * vh * 0.14, 5.5 * k);
          chase(wrecker, wrecker.bx + Math.cos(t * 0.7) * 100, wrecker.by + Math.sin(t * 0.9) * 80, 3 * k);
          chase(slapper, slapper.bx + Math.cos(t * 0.5 + 4) * 110, slapper.by + Math.sin(t * 0.6 + 4) * 80, 3 * k);
          shake = Math.max(0, shake - 7 * k);
          const tip = hunter.pts[N] || { x: hunter.tx, y: hunter.ty, z: 0 };
          const scr = Sea.scene.project(tip.x, tip.y, tip.z + 8);
          Sea.cursor.place(scr[0], scr[1], Math.sin(t * 22) * 18 * Math.min(1, shake / 600 + 0.2));
          label.style.display = 'block';
          label.style.transform = `translate(${clamp(scr[0] - 80, 8, vw - 168)}px, ${clamp(scr[1] - 74, 8, vh - 60)}px)`;
          bar.style.width = Math.round(clamp(shake / SHAKE_NEEDED, 0, 1) * 100) + '%';
          if (shake >= SHAKE_NEEDED) {
            Sea.cursor.release();
            squirt(hunter.tx, hunter.ty); setPhase('retreat');
          } else if (age > HOLD_S) setPhase('drag');
        } else if (phase === 'drag') {
          // you lost: it takes the cursor down with it
          hunter.tz = 0;
          const d = chase(hunter, cx, cy, 7 * k);
          const tip = hunter.pts[N] || { x: hunter.tx, y: hunter.ty, z: 0 };
          const scr = Sea.scene.project(tip.x, tip.y, Math.max(0, tip.z));
          Sea.cursor.place(scr[0], scr[1], 40);
          if (d < 12) {
            Sea.cursor.place(-80, -80, 0);
            squirt(cx, cy); under = 1.8; setPhase('retreat');
          }
        } else if (phase === 'retreat') {
          for (const tn of tents) { tn.tz = 0; chase(tn, tn.bx, tn.by, 8 * k); }
          if (under > 0 && (under -= dt) <= 0) {
            // and gives it back
            Sea.cursor.place(cx, cy, 0); Sea.cursor.release();
            Sea.water.splash(cx, cy, 60, -2.6);
          }
          if (age > 2.2 && under <= 0) { this.dead = true; offDelta(); label.remove(); return; }
        }

        for (const tn of tents) shape(tn, t);
        if (Math.random() < 0.25 * k) {
          const tn = tents[Math.floor(Math.random() * 3)];
          Sea.scene.emit({ k: 'ring', x: tn.bx + rand(-8, 8), y: tn.by + rand(-8, 8), life: 28, size: 8, grow: 20 });
          Sea.water.splash(tn.bx, tn.by, 22, rand(-1, 0.7));
        }
      },

      // the body: a vast dark shape just under the surface, with two eyes
      under(c, t) {
        if (loom < 0.02) return;
        c.save();
        c.translate(cx, cy); c.scale(1, 0.72);
        const g = c.createRadialGradient(0, 0, 30, 0, 0, 200);
        g.addColorStop(0, `rgba(52,8,38,${(0.72 * loom).toFixed(2)})`);
        g.addColorStop(0.55, `rgba(28,6,30,${(0.5 * loom).toFixed(2)})`);
        g.addColorStop(1, 'rgba(28,6,30,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 0, 200, 0, 6.283); c.fill();
        c.restore();
        const blink = Math.sin(t * 0.9) > 0.985 ? 0.15 : 1;
        for (const s of [-1, 1]) {
          c.fillStyle = `rgba(255,214,70,${(0.9 * loom).toFixed(2)})`;
          c.beginPath(); c.ellipse(cx + s * 34, cy - 8, 13, 8 * blink, s * 0.25, 0, 6.283); c.fill();
          // the pupils follow your cursor
          const a = Math.atan2(Sea.cursor.y - cy, Sea.cursor.x - (cx + s * 34));
          c.fillStyle = `rgba(20,6,20,${loom.toFixed(2)})`;
          c.beginPath(); c.ellipse(cx + s * 34 + Math.cos(a) * 5, cy - 8 + Math.sin(a) * 3, 3, 6.5 * blink, 0, 0, 6.283); c.fill();
        }
      },

      shadow(c) {
        c.strokeStyle = 'rgba(6,24,50,.22)'; c.lineCap = 'round'; c.lineWidth = 12;
        for (const tn of tents) {
          if (tn.rise < 0.1 || !tn.pts.length) continue;
          c.beginPath();
          for (const p of tn.pts) c.lineTo(p.x + 5 + p.z * 0.25, p.y + 6 + p.z * 0.12);
          c.stroke();
        }
      },

      draw(S) { for (const tn of tents) if (tn.pts.length) drawTentacle(S, tn); },

      leave() { if (Sea.cursor.held) Sea.cursor.release(); if (phase !== 'retreat') setPhase('retreat'); }
    };
  }

  Sea.feature({ id: 'kraken', stop: clearInk, onSettings(s) { if (!s.mischief) clearInk(); } });

  Sea.creature({
    id: 'kraken',
    name: 'Kraken',
    kind: 'monster',
    weight: 0.35,
    max: 1,
    cooldown: 200,
    spawn
  });
})();
