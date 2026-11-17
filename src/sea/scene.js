// Scene: a tiny low-poly 3D renderer, drawn on one canvas over the page.
// The view is from above. The water surface is the page itself, so a point on
// the water at page position (x, y) is drawn exactly at (x, y); height above
// the water (z) leans up the screen, which is what makes the models read as
// little solid objects on your browser.
//
// Everything is flat-shaded polygons: each face gets one colour from its angle
// to the sun. Faces are cut off cleanly at the waterline (z = 0), so anything
// that sinks really does go under, and anything that rises really comes up.
//
//   Sea.scene.add(entity) / remove(entity)
//       entity.update(t, dt)        move (t = seconds, dt = seconds since last frame, at most 0.05)
//       entity.under(ctx, t)        draw things below the surface (silhouettes in the deep)
//       entity.shadow(ctx, t)       draw its shadow on the water
//       entity.draw(S, t)           S.mesh(mesh, pose, opts) / S.poly(points3D, rgb, opts)
//       entity.over(ctx, t)         draw flat things above everything (rarely needed)
//       entity.dead                 set true to be removed
//   Sea.scene.project(x, y, z)      -> [screenX, screenY]
//   Sea.scene.emit(particle)        chunk | smoke | fire | spray | foam | ring
//   Sea.scene.burst(kind, x, y, z, n, opts)
//   Sea.scene.blobShadow(ctx, x, y, yaw, rx, ry, alpha)
//
// The canvas only exists, and the loop only runs, while there is something to draw.
(() => {
  const Sea = window.Sea;
  if (!Sea || Sea.scene) return;

  const LEAN_X = 0.14, LEAN_Y = 0.62;  // screen offset per px of height
  // Never draw more than about 60 times a second; 30 while you are typing or in
  // the Smoothest performance setting, so the page gets the time back.
  const minFrameMs = () => (Sea.typing || Sea.settings.perf === 'smooth' ? 31 : 14);

  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const CAM = norm([-LEAN_X, LEAN_Y, 1]);   // direction from the scene towards the viewer
  const SUN = norm([-0.5, 0.25, 0.83]);     // direction from the scene towards the light

  let cv = null, ctx = null, raf = 0, dpr = 1, vw = 0, vh = 0, last = 0, on = false;
  const ents = new Set();
  let parts = [];
  let faces = [];
  const stats = { ms: 0, fps: 0, faces: 0 };

  const project = (x, y, z) => [x + z * LEAN_X, y - z * LEAN_Y];

  function ensure() {
    if (!on) return;
    if (!cv) {
      cv = Sea.util.el('canvas', {
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none'
      });
      ctx = cv.getContext('2d');
    }
    // some sites rebuild the whole document; if our canvas was thrown out, put it back
    if (!cv.isConnected) Sea.util.layer().appendChild(cv);
    // under load the canvas drops to one pixel per CSS pixel: a quarter of the fill work on sharp screens
    const want = Sea.perf && Sea.perf.level >= 2 ? 1 : Math.min(2, devicePixelRatio || 1);
    if (vw !== innerWidth || vh !== innerHeight || !cv.width || want !== dpr) {
      vw = innerWidth; vh = innerHeight;
      dpr = want;
      cv.width = Math.max(1, Math.round(vw * dpr)); cv.height = Math.max(1, Math.round(vh * dpr));
    }
    if (!raf && !Sea.paused) raf = Sea.raf(frame);
  }
  const PART_CAP = [700, 450, 300, 200];   // particles allowed at each load level

  // ---------- submitting geometry ----------
  // pose: { x, y, z, yaw, pitch, roll, s }. Local axes: +x forward, +y right, +z up.
  function place(pose, v) {
    let x = v[0], y = v[1], z = v[2];
    if (pose.roll) { const c = Math.cos(pose.roll), s = Math.sin(pose.roll); const y2 = y * c - z * s; z = y * s + z * c; y = y2; }
    if (pose.pitch) { const c = Math.cos(pose.pitch), s = Math.sin(pose.pitch); const x2 = x * c - z * s; z = z * c + x * s; x = x2; }
    const cy = Math.cos(pose.yaw || 0), sy = Math.sin(pose.yaw || 0), k = pose.s || 1;
    return [pose.x + (x * cy - y * sy) * k, pose.y + (x * sy + y * cy) * k, (pose.z || 0) + z * k];
  }

  // Keep the part of a polygon that is above the water.
  function clipWater(p) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const ina = a[2] >= 0, inb = b[2] >= 0;
      if (ina) out.push(a);
      if (ina !== inb) { const t = a[2] / (a[2] - b[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]); }
    }
    return out;
  }

  function poly(p, rgb, opts) {
    const o = opts || {};
    if (o.clip !== false) {
      // quick reject: wholly under water
      let any = false;
      for (let i = 0; i < p.length; i++) if (p[i][2] > 0) { any = true; break; }
      if (!any) return;
    }
    // face normal (the same cross product the model builder used to orient faces)
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    let n = norm([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]);
    const facing = n[0] * CAM[0] + n[1] * CAM[1] + n[2] * CAM[2];
    if (facing <= 0) {
      if (!o.two) return;                    // back face
      n = [-n[0], -n[1], -n[2]];
    }
    if (o.clip !== false) { p = clipWater(p); if (p.length < 3) return; }
    const lit = o.flat ? 1 : 0.5 + 0.62 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
    let dx = 0, dy = 0, dz = 0;
    const flat = new Array(p.length * 2);
    for (let i = 0; i < p.length; i++) {
      const q = p[i];
      dx += q[0]; dy += q[1]; dz += q[2];
      flat[i * 2] = q[0] + q[2] * LEAN_X; flat[i * 2 + 1] = q[1] - q[2] * LEAN_Y;
    }
    const k = 1 / p.length;
    faces.push({
      flat, alpha: o.alpha == null ? 1 : o.alpha,
      depth: (dx * CAM[0] + dy * CAM[1] + dz * CAM[2]) * k + (o.bias || 0),
      css: `rgb(${Math.min(255, rgb[0] * lit) | 0},${Math.min(255, rgb[1] * lit) | 0},${Math.min(255, rgb[2] * lit) | 0})`
    });
  }

  const S = {
    project,
    poly,
    // opts.deform(v) can bend the model before it is posed (tail sway, jaw hinge).
    mesh(mesh, pose, opts) {
      const o = opts || {};
      const V = mesh.v, W = new Array(V.length);
      for (let i = 0; i < V.length; i++) W[i] = place(pose, o.deform ? o.deform(V[i]) : V[i]);
      for (const f of mesh.f) {
        const p = new Array(f.i.length);
        for (let j = 0; j < f.i.length; j++) p[j] = W[f.i[j]];
        poly(p, f.c, { two: f.two, clip: o.clip, alpha: o.alpha, bias: o.bias });
      }
    }
  };

  // ---------- particles ----------
  // { k, x, y, z, vx, vy, vz, life, size, c:[r,g,b] }   speeds are px per 1/60 s, life is in 1/60 s
  function emit(p) {
    if (!on || parts.length > PART_CAP[Sea.perf ? Sea.perf.level : 0]) return;
    p.max = p.life; p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 0.4;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.vz = p.vz || 0; p.z = p.z || 0;
    parts.push(p);
    ensure();
  }

  function shard(p, sides) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = p.rot + (i / sides) * 6.283;
      // tumble: squash one axis so it looks like a flat chip turning over
      pts.push([p.x + Math.cos(a) * p.size, p.y + Math.sin(a) * p.size * Math.cos(p.rot * 1.7), p.z + Math.sin(a) * p.size * Math.sin(p.rot * 1.7)]);
    }
    return pts;
  }

  function stepParticles(k) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= k; p.rot += p.vr * k;
      p.x += p.vx * k; p.y += p.vy * k; p.z += p.vz * k;
      if (p.k === 'chunk' || p.k === 'spray') {
        p.vz -= (p.k === 'chunk' ? 0.32 : 0.22) * k;
        if (p.z < 0 && p.vz < 0) {
          // lands in the water
          if (p.k === 'chunk') {
            Sea.water.splash(p.x, p.y, 12, -0.9);
            emit({ k: 'ring', x: p.x, y: p.y, life: 26, size: 4 });
            if (p.floats) { p.k = 'float'; p.z = 0; p.vx *= 0.2; p.vy *= 0.2; p.vz = 0; p.life = p.max = 380; continue; }
          }
          p.life = 0;
        }
      } else if (p.k === 'smoke') { p.vx *= 0.97; p.vy *= 0.97; p.size *= 1.012; }
      else if (p.k === 'fire') { p.size *= 0.95; }
      else if (p.k === 'float') { p.vx *= 0.98; p.vy *= 0.98; }
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  function drawSurfaceParticles() {
    for (const p of parts) {
      const f = Math.max(0, p.life / p.max);
      if (p.k === 'ring') {
        const r = p.size + (1 - f) * (p.grow || 34);
        ctx.strokeStyle = `rgba(255,255,255,${(f * 0.8).toFixed(2)})`;
        ctx.lineWidth = 1 + f * 2;
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) { const a = (i / 8) * 6.283 + p.rot; ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8); }
        ctx.stroke();
      } else if (p.k === 'glow') {
        // living light: brightens, then fades
        ctx.fillStyle = `rgba(110,255,225,${(Math.sin(f * Math.PI) * 0.85).toFixed(2)})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else if (p.k === 'foam') {
        ctx.fillStyle = `rgba(255,255,255,${(f * 0.75).toFixed(2)})`;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = p.rot + i * 1.571; ctx.lineTo(p.x + Math.cos(a) * p.size, p.y + Math.sin(a) * p.size * 0.7); }
        ctx.fill();
      }
    }
  }

  function pushAirParticles() {
    for (const p of parts) {
      const f = Math.max(0, p.life / p.max);
      if (p.k === 'chunk') poly(shard(p, p.sides || 4), p.c, { two: true, clip: false });
      else if (p.k === 'float') poly(shard({ ...p, rot: p.rot * 0.05, z: 0.6 }, 4), p.c, { two: true, clip: false, alpha: Math.min(1, f * 4) });
      else if (p.k === 'smoke') poly(shard({ ...p, rot: p.rot * 0.2 }, 6), p.c, { two: true, clip: false, alpha: f * 0.75, flat: true });
      else if (p.k === 'fire') poly(shard(p, 3), p.c, { two: true, clip: false, alpha: Math.min(1, f * 1.6), flat: true });
      else if (p.k === 'spray') poly(shard(p, 3), [255, 255, 255], { two: true, clip: false, alpha: f, flat: true });
    }
  }

  // ---------- frame ----------
  function frame(now) {
    raf = 0;
    if (!cv) return;
    if (Sea.paused) { last = 0; return; }       // stop dead; resume() picks it up
    if (last && now - last < minFrameMs()) { raf = Sea.raf(frame); return; }
    const t0 = performance.now();
    const t = now / 1000;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    if (last) stats.fps = stats.fps * 0.9 + (1000 / Math.max(1, now - last)) * 0.1;
    last = now;

    // Every creature runs inside its own guard: one that goes wrong is removed
    // quietly and everything else carries on (see fail() below).
    for (const e of ents) {
      if (e.update) { try { e.update(t, dt); } catch (err) { fail(e, err); } }
      if (e.dead) ents.delete(e);
    }
    try { stepParticles(dt * 60); } catch (err) { parts = []; }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, vw, vh);
    ctx.lineJoin = 'round';
    // flat 2D drawing gets a save/restore each, so a creature that fails half way
    // through cannot leave the canvas turned, faded or blurred for the others
    const flat = (e, fn) => {
      if (!e[fn] || e.dead) return;
      ctx.save();
      try { e[fn](ctx, t); } catch (err) { fail(e, err); }
      ctx.restore();
    };
    for (const e of ents) flat(e, 'under');
    try { drawSurfaceParticles(); } catch (err) { parts = []; }
    for (const e of ents) flat(e, 'shadow');

    faces = [];
    for (const e of ents) {
      if (!e.draw || e.dead) continue;
      const n = faces.length;
      try { e.draw(S, t); } catch (err) { faces.length = n; fail(e, err); }
    }
    try { pushAirParticles(); } catch (err) { parts = []; }
    faces.sort((a, b) => a.depth - b.depth);
    // The thin outline that seals hairline gaps doubles the drawing work, so it is
    // dropped when the page is under strain.
    const seal = !(Sea.perf && Sea.perf.level >= 2);
    ctx.lineWidth = 0.7;
    for (const f of faces) {
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = ctx.strokeStyle = f.css;
      ctx.beginPath();
      const a = f.flat;
      ctx.moveTo(a[0], a[1]);
      for (let i = 2; i < a.length; i += 2) ctx.lineTo(a[i], a[i + 1]);
      ctx.closePath();
      ctx.fill();
      if (seal && f.alpha === 1) ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const e of ents) flat(e, 'over');

    stats.faces = faces.length;
    stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;

    if (ents.size || parts.length) ensure();
    else { cv.remove(); cv = ctx = null; vw = vh = 0; last = 0; stats.ms = 0; stats.faces = 0; }
  }

  // A creature that throws is taken out of the sea at once (the director notices
  // and stops sending that kind if it keeps happening). One warning per page, not
  // one per frame.
  let warned = 0;
  function fail(e, err) {
    e.dead = true; e.failed = true;
    if (warned++ < 3) console.warn('[Web-Wide-Water] a creature failed and was removed:', err);
  }

  // An elliptical shadow on the water, turned to match a heading.
  function blobShadow(c, x, y, yaw, rx, ry, alpha) {
    c.save();
    c.translate(x + 6, y + 7); c.rotate(yaw);
    c.fillStyle = `rgba(6,24,50,${alpha})`;
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 6.283); c.fill();
    c.restore();
  }

  Sea.scene = {
    stats, project, emit, blobShadow,
    add(e) { if (!on) return e; ents.add(e); ensure(); return e; },
    remove(e) { ents.delete(e); },
    resume() { if (on && (ents.size || parts.length)) ensure(); },
    get count() { return ents.size; },
    // a handy burst: n particles thrown outwards and upwards
    burst(k, x, y, z, n, opts) {
      const o = opts || {};
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = (o.speed || 2) * (0.4 + Math.random());
        emit({
          k, x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (o.up || 3) * (0.5 + Math.random()),
          life: (o.life || 50) * (0.6 + Math.random() * 0.8) | 0, size: (o.size || 3) * (0.6 + Math.random() * 0.8),
          c: o.colours ? o.colours[i % o.colours.length] : (o.c || [120, 80, 40]), floats: o.floats && Math.random() < 0.4,
          sides: o.sides
        });
      }
    }
  };

  Sea.feature({
    id: 'scene',
    start() { on = true; },
    stop() {
      on = false;
      Sea.caf(raf); raf = 0; last = 0;
      ents.clear(); parts = []; faces = [];
      if (cv) cv.remove();
      cv = ctx = null; vw = vh = 0; stats.ms = 0; stats.faces = 0;
    }
  });
})();
