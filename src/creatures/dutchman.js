// The Flying Dutchman: the ghost ship of the old sailors' legend, and the rarest
// thing in this sea. (Our own design; the legend is centuries old.)
//
//   The omen     the sky turns to storm, and a green light spreads under the water.
//   The rising   she comes up bow first out of the deep, three masts of rotten
//                sail, the sea pouring off her.
//   The battle   a navy armada of four sails in to meet her, and your own ships
//                join the line if you have any. It is a real fight: every hit
//                and every sinking counts, and it can go either way.
//   If she loses she heels over and slides back under.
//   If she wins  every ship is gone. In mischief mode she then turns her guns
//                on you: three shots straight at the screen, and the glass
//                cracks. The cracks heal after about twelve seconds, and you
//                can read and click through them. Then she sails off and sinks.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;

  const SIZE = 1.75, GLOW = [70, 255, 170];
  const HP = 11;      // tuned so the armada wins about as often as it loses
  const PALETTE = { hull: [26, 40, 38], trim: [70, 112, 94], deck: [40, 58, 52], sail: [58, 84, 74], flag: [12, 16, 16], masts: 3, stripes: true };

  // ---------- the broken glass ----------
  let glass = null, healTimer = 0;
  function crack(x, y) {
    const layer = Sea.util.layer(), vw = innerWidth, vh = innerHeight;
    if (!glass || !glass.isConnected) {
      glass = Sea.util.el('canvas', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      glass.width = vw; glass.height = vh;
      layer.appendChild(glass);
    }
    const c = glass.getContext('2d');
    // rays running out from the hole, each a crooked line; remember points along them for the rings
    const rays = [], n = 9 + Math.floor(rand(0, 5));
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 6.283 + rand(-0.2, 0.2), len = rand(130, 430), pts = [[x, y]];
      let a = a0, d = 0;
      while (d < len) { const step = rand(18, 46); d += step; a += rand(-0.22, 0.22); const p = pts[pts.length - 1]; pts.push([p[0] + Math.cos(a) * step, p[1] + Math.sin(a) * step]); }
      rays.push(pts);
    }
    const stroke = (style, width, dx) => {
      c.strokeStyle = style; c.lineWidth = width; c.lineJoin = 'bevel';
      c.beginPath();
      for (const pts of rays) pts.forEach((p, i) => (i ? c.lineTo(p[0] + dx, p[1] + dx) : c.moveTo(p[0] + dx, p[1] + dx)));
      // two broken rings joining the rays, as real glass does
      for (const at of [2, 4]) {
        rays.forEach((pts, i) => {
          const a = pts[Math.min(at, pts.length - 1)], b = rays[(i + 1) % n][Math.min(at, rays[(i + 1) % n].length - 1)];
          if (Math.random() < 0.8) { c.moveTo(a[0] + dx, a[1] + dx); c.lineTo(b[0] + dx, b[1] + dx); }
        });
      }
      c.stroke();
    };
    stroke('rgba(10,20,30,.45)', 2.2, 1.5);      // the shadow side of each crack
    stroke('rgba(255,255,255,.9)', 1.3, 0);      // and the bright edge
    c.fillStyle = 'rgba(8,14,20,.8)'; c.beginPath(); c.arc(x, y, 9, 0, 6.283); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.stroke();

    // the whole sea jolts (only our own layer: the page itself is never moved)
    try { layer.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(9px,-6px)' }, { transform: 'translate(-7px,5px)' }, { transform: 'translate(4px,2px)' }, { transform: 'translate(0,0)' }], { duration: 320 }); } catch (e) { /* no jolt */ }
    clearTimeout(healTimer);
    healTimer = setTimeout(heal, 12000);
  }
  function heal(now) {
    clearTimeout(healTimer);
    const g = glass; glass = null;
    if (!g) return;
    if (now) { g.remove(); return; }
    try { g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1800 }).onfinish = () => g.remove(); } catch (e) { g.remove(); }
  }

  function banner(text) {
    const tag = Sea.util.el('div', {
      position: 'absolute', left: '50%', top: '64px', transform: 'translateX(-50%)', padding: '8px 22px', borderRadius: '3px', pointerEvents: 'none',
      background: 'rgba(16,30,28,.92)', color: '#bff5dc', border: '1px solid rgba(110,255,190,.5)',
      font: 'italic 600 15px Georgia, serif', letterSpacing: '.06em', whiteSpace: 'nowrap', boxShadow: '0 0 24px rgba(70,255,170,.35)'
    }, text);
    Sea.util.layer().appendChild(tag);
    try { tag.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 5200 }).onfinish = () => tag.remove(); } catch (e) { tag.remove(); }
  }

  let abroad = false;     // only ever one

  function spawn() {
    if (abroad || !Sea.ships) return null;
    abroad = true;
    const model = Sea.models.once('dutchman', () => Sea.ships.build(PALETTE));
    const vw = innerWidth, vh = innerHeight;
    const d = {
      kind: 'ghost', fighting: true, afloat: false, size: SIZE, aim: 0.5, hp: HP, model,
      x: vw * rand(0.35, 0.65), y: vh * rand(0.4, 0.6), yaw: rand(0, 6.283), vx: 0, vy: 0, roll: 0, kick: 0, speed: 0,
      z: -80, pitch: 0.75, state: 'omen', st: 0, reload: 3, orbit: Math.random() < 0.5 ? 1 : -1, wisp: 0, sunk: 0, shots: [], fired: 0, ph: rand(0, 9),
      sinkBy() {},                       // no monster of this sea can take her
      onSunk() { if (d.state === 'battle') go('defeated'); }
    };
    const go = (s) => {
      d.state = s; d.st = 0;
      if (s === 'defeated') { d.afloat = false; banner('The Dutchman is driven back to the deep'); }
      if (s === 'victory') { banner('The fleet is lost'); }
      if (s === 'leave') d.afloat = false;
    };
    const foes = () => Sea.ships.all.filter((s) => s.afloat && (s.kind === 'navy' || (s.kind === 'player' && Sea.settings.mischief)));
    const end = () => { abroad = false; Sea.ships.remove(d); Sea.eco.omen(null); };

    Sea.eco.omen('storm');
    banner('The Flying Dutchman rises');

    return {
      update(t, dt) {
        const k = dt * 60, vw = innerWidth, vh = innerHeight;
        d.st += dt;
        const fx = Math.cos(d.yaw), fy = Math.sin(d.yaw);

        if (d.state === 'omen') {
          // the water boils where she will come up
          if (Math.random() < 0.5 * k) { const a = rand(0, 6.283), r = rand(0, 110); Sea.scene.emit({ k: 'ring', x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r, life: 30, size: 2, grow: 16 }); }
          if (Math.random() < 0.2 * k) Sea.water.splash(d.x + rand(-90, 90), d.y + rand(-70, 70), 30, rand(-1.2, 1.2));
          if (d.st > 3.6) go('rise');
        } else if (d.state === 'rise') {
          const u = Math.min(1, d.st / 5.5), e = u * u * (3 - 2 * u);
          d.z = -80 * (1 - e); d.pitch = 0.75 * (1 - e); d.roll = Math.sin(d.st * 2.2) * 0.08 * (1 - u);
          if (Math.random() < 0.6 * k) {
            const along = rand(-70, 80) * SIZE;
            Sea.scene.burst('spray', d.x + fx * along, d.y + fy * along, 8 + e * 30, 3, { speed: 1.8, up: 3.6, life: 40, size: 2.6 });
            Sea.water.splash(d.x + fx * along, d.y + fy * along, 44, rand(0.8, 2));
          }
          if (u >= 1) {
            d.afloat = true; Sea.ships.add(d);
            Sea.water.splash(d.x, d.y, 150, -3.6);
            Sea.scene.emit({ k: 'ring', x: d.x, y: d.y, life: 80, size: 40, grow: 220 });
            Sea.ships.muster('navy', 4, true);          // the armada answers
            go('battle');
          }
        } else if (d.state === 'battle') {
          const list = foes();
          let near = null, nd = 1e9;
          for (const s of list) { const q = Math.hypot(s.x - d.x, s.y - d.y); if (q < nd) { nd = q; near = s; } }
          let want = Math.atan2(vh / 2 - d.y, vw / 2 - d.x);
          if (near) {
            const bearing = Math.atan2(near.y - d.y, near.x - d.x);
            want = nd > 250 ? bearing + 0.4 * d.orbit : bearing + (Math.PI / 2) * d.orbit;     // close, then lie broadside on
            d.reload -= dt;
            if (d.reload <= 0 && nd < 380) {
              const abeam = Math.sin(turn(d.yaw, bearing));
              if (Math.abs(abeam) > 0.4) {
                const side = abeam > 0 ? 1 : -1, foe = near;
                for (let i = 0; i < 3; i++) setTimeout(() => { if (d.afloat && foe.afloat && Sea.active) Sea.ships.fire(d, foe, side); }, i * 140);
                d.reload = rand(2.3, 3);
              } else d.reload = 0.3;
            }
          }
          const m = 110;
          if (d.x < m || d.x > vw - m || d.y < m || d.y > vh - m) want = Math.atan2(vh / 2 - d.y, vw / 2 - d.x);
          const tn = clamp(turn(d.yaw, want), -0.014, 0.014);
          d.yaw += tn * k;
          d.speed += (1.05 - d.speed) * 0.03 * k;
          d.kick *= Math.pow(0.93, k);
          d.roll += (tn * 9 + Math.sin(t * 1.1 + d.ph) * 0.05 + d.kick - d.roll) * 0.12 * k;
          d.z = Math.sin(t * 1.3) * 1.2; d.pitch = Math.sin(t * 0.9) * 0.03;
          if (d.hp <= 0) go('defeated');
          else if (!list.length && d.st > 8) go('victory');                                   // nobody left to fight
          else if (d.st > 80) go(d.hp > HP / 2 ? 'victory' : 'defeated');                    // a long fight goes to whoever is ahead
        } else if (d.state === 'defeated') {
          // she heels right over and goes back where she came from
          const u = Math.min(1, d.st / 7), e = u * u;
          d.roll += (1.0 - d.roll) * 0.02 * k; d.z = -95 * e; d.pitch = -0.35 * e; d.speed *= Math.pow(0.97, k);
          if (Math.random() < 0.3 * k) {
            Sea.scene.burst('fire', d.x + rand(-50, 50), d.y + rand(-30, 30), 10, 2, { speed: 1, up: 1.4, life: 26, size: 6, colours: [[120, 255, 190], [60, 220, 150]] });
            Sea.scene.emit({ k: 'ring', x: d.x + rand(-80, 80), y: d.y + rand(-60, 60), life: 34, size: 4, grow: 30 });
            Sea.water.splash(d.x + rand(-70, 70), d.y + rand(-50, 50), 30, rand(-1.4, 1));
          }
          if (u >= 1) { this.dead = true; end(); return; }
        } else if (d.state === 'victory') {
          // she turns on whoever is watching
          d.speed *= Math.pow(0.96, k);
          d.z = Math.sin(t * 1.3) * 1.2;
          if (Sea.settings.mischief && d.fired < 3 && d.st > 1.6 + d.fired * 0.7) {
            d.fired++;
            const side = d.fired % 2 ? 1 : -1;
            const sx = d.x - Math.sin(d.yaw) * side * 16, sy = d.y + Math.cos(d.yaw) * side * 16;
            d.shots.push({ sx, sy, tx: vw * rand(0.2, 0.8), ty: vh * rand(0.2, 0.8), t: 0 });
            Sea.scene.burst('fire', sx, sy, 12, 6, { speed: 1.4, up: 0.8, life: 14, size: 5, colours: [[150, 255, 200], [70, 230, 160]] });
            Sea.scene.burst('smoke', sx, sy, 12, 5, { speed: 0.8, up: 0.5, life: 50, size: 6, c: [170, 210, 195] });
            d.kick = -side * 0.25;
          }
          if (d.st > (Sea.settings.mischief ? 5.4 : 3)) go('leave');
        } else {
          // away, and under
          const out = Math.atan2(d.y - vh / 2, d.x - vw / 2);
          d.yaw += clamp(turn(d.yaw, out), -0.014, 0.014) * k;
          d.speed += (1.7 - d.speed) * 0.03 * k;
          const u = Math.min(1, d.st / 9);
          d.z = -90 * u * u; d.pitch = -0.3 * u;
          if (u >= 1 || Sea.world.gone(d.x, d.y, 200)) { this.dead = true; end(); return; }
        }

        d.vx = Math.cos(d.yaw) * d.speed; d.vy = Math.sin(d.yaw) * d.speed;
        d.x += d.vx * k; d.y += d.vy * k;
        if (d.state === 'battle') Sea.ships.bump(d);      // she shoulders other ships aside, and ice does not harm her
        for (const s of d.shots) {
          s.t += dt / 0.75;
          if (s.t >= 1 && !s.done) { s.done = true; crack(s.tx, s.ty); }
        }
        // green vapour off her decks, and a slow heave in the water around her
        if ((d.wisp += dt) > 0.16 && d.z > -50) {
          d.wisp = 0;
          Sea.scene.emit({ k: 'smoke', x: d.x + rand(-60, 60), y: d.y + rand(-16, 16), z: 14 + d.z, vz: 0.6, vx: rand(-0.2, 0.2), life: 70, size: rand(4, 8), c: [110, 210, 170] });
          if (d.state === 'battle') Sea.water.splash(d.x - fx * 70, d.y - fy * 70, 20, -0.4);
        }
      },

      // the light under her
      under(c, t) {
        const a = d.state === 'omen' ? Math.min(1, d.st / 3) : d.state === 'leave' || d.state === 'defeated' ? Math.max(0, 1 - d.st / 6) : 1;
        if (a <= 0.02) return;
        const R = 210 + Math.sin(t * 2) * 14;
        c.save();
        c.translate(d.x, d.y); c.scale(1, 0.7);
        const g = c.createRadialGradient(0, 0, 10, 0, 0, R);
        g.addColorStop(0, `rgba(${GLOW[0]},${GLOW[1]},${GLOW[2]},${(0.34 * a).toFixed(2)})`);
        g.addColorStop(0.5, `rgba(20,110,80,${(0.22 * a).toFixed(2)})`);
        g.addColorStop(1, 'rgba(10,60,50,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 0, R, 0, 6.283); c.fill();
        c.restore();
      },
      shadow(c) { if (d.z > -30) Sea.scene.blobShadow(c, d.x, d.y, d.yaw, 46 * SIZE, 15 * SIZE, 0.3); },
      draw(S) {
        if (d.state === 'omen') return;
        const pose = { x: d.x, y: d.y, z: d.z, yaw: d.yaw, roll: d.roll, pitch: d.pitch, s: SIZE };
        S.mesh(model.stern, pose); S.mesh(model.bow, pose);
      },
      // her shot coming straight at the glass: it grows as it nears
      over(c) {
        for (const s of d.shots) {
          if (s.t >= 1) continue;
          const u = s.t, x = s.sx + (s.tx - s.sx) * u, y = s.sy + (s.ty - s.sy) * u - Math.sin(Math.PI * u) * 60, r = 4 + u * u * 44;
          c.fillStyle = 'rgba(14,18,20,.95)'; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
          c.fillStyle = 'rgba(140,255,200,.35)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, 6.283); c.fill();
        }
      },
      leave() { if (d.state !== 'defeated' && d.state !== 'leave') go('leave'); }
    };
  }

  Sea.feature({
    id: 'dutchman',
    stop() { abroad = false; clearTimeout(healTimer); glass = null; },
    onSettings(s) { if (!s.mischief) heal(true); }
  });

  Sea.creature({ id: 'dutchman', name: 'The Flying Dutchman', kind: 'monster', weight: 0.12, max: 1, cooldown: 900, spawn });
})();
