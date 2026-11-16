// Seabirds (gannets): white birds with black wingtips that wheel high over the
// water by day. You see the birds and, on the water below, their shadows. When
// there is a school of fish they gather over it and, one at a time, fold their
// wings and plunge straight in, come up with a fish, sit a moment and take off.
// A bait ball held by dolphins brings them in quickly.
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp, turn } = Sea.util;
  const WHITE = [250, 250, 246], BLACK = [30, 32, 38], HEAD = [250, 222, 140];
  const ALT = 105;

  function drawBird(S, b) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), z = b.z;
    const P = (lx, ly, lz) => [b.x + lx * c - ly * s, b.y + lx * s + ly * c, z + lz];
    const o = { two: true, clip: false };
    // folded for the dive: a dart
    if (b.fold > 0.6) {
      S.poly([P(13, 0, 0), P(-4, 3, 0), P(-15, 0, 0), P(-4, -3, 0)], WHITE, o);
      S.poly([P(-4, 3, 0), P(-18, 5, 0), P(-12, 0, 0)], BLACK, o);
      S.poly([P(-4, -3, 0), P(-18, -5, 0), P(-12, 0, 0)], BLACK, o);
      return;
    }
    const up = Math.sin(b.flap) * 7 * b.beat;          // wingtips rise and fall
    S.poly([P(12, 0, 0), P(0, 3.5, 0), P(-12, 0, 0), P(0, -3.5, 0)], WHITE, o);
    S.poly([P(12, 0, 0.2), P(7, 2, 0.2), P(7, -2, 0.2)], HEAD, o);
    for (const sd of [-1, 1]) {
      S.poly([P(5, sd * 3, 0), P(3, sd * 15, up * 0.5), P(-3, sd * 15, up * 0.5), P(-4, sd * 3, 0)], WHITE, o);
      S.poly([P(3, sd * 15, up * 0.5), P(-1, sd * 25, up), P(-3, sd * 15, up * 0.5)], BLACK, o);
    }
  }

  function spawn() {
    const start = Sea.world.entry(140);
    const flock = { x: start.x, y: start.y, yaw: start.yaw, age: 0, stay: rand(26, 40), diveIn: rand(2, 4), leaving: false };
    const birds = [];
    for (let i = 0, n = 4 + Math.floor(rand(0, 5)); i < n; i++) {
      birds.push({ a: rand(0, 6.283), r: rand(60, 130), w: rand(0.5, 0.8) * (i % 2 ? 1 : -1), z: ALT + rand(-15, 20), alt: ALT + rand(-15, 20), x: start.x, y: start.y, yaw: 0, flap: rand(0, 6), beat: 1, fold: 0, state: 'fly', st: 0, tx: 0, ty: 0, prey: null });
    }

    return {
      update(t, dt) {
        const k = dt * 60, vw = innerWidth, vh = innerHeight;
        flock.age += dt;
        if (flock.age > flock.stay) flock.leaving = true;
        // gather over the fish if there are any, otherwise drift across
        const g = flock.leaving ? null : Sea.eco.find(['fish'], flock.x, flock.y, 900);
        // with no fish about, they follow the user's ship, as gulls follow any boat
        const boat = !g && !flock.leaving && Sea.mate ? Sea.mate.pos() : null;
        const want = g ? Math.atan2(g.y - flock.y, g.x - flock.x)
          : boat ? Math.atan2(boat.y - flock.y, boat.x - flock.x)
          : flock.leaving ? Math.atan2(flock.y - vh / 2, flock.x - vw / 2) : flock.yaw;
        flock.yaw += clamp(turn(flock.yaw, want), -0.03, 0.03) * k;
        const sp = g && Math.hypot(g.x - flock.x, g.y - flock.y) < 30 ? 0.2 : flock.leaving ? 2.6 : 1.5;
        flock.x += Math.cos(flock.yaw) * sp * k; flock.y += Math.sin(flock.yaw) * sp * k;

        if (g && !Sea.world.gone(g.x, g.y, -30) && (flock.diveIn -= dt) <= 0) {
          flock.diveIn = rand(0.8, 2.4);
          const b = birds.find((o) => o.state === 'fly');
          if (b) { b.state = 'dive'; b.st = 0; b.prey = g; b.tx = g.x + rand(-g.r, g.r) * 0.5; b.ty = g.y + rand(-g.r, g.r) * 0.5; b.sx = b.x; b.sy = b.y; b.sz = b.z; }
        }

        for (const b of birds) {
          b.st += dt;
          if (b.state === 'fly' || b.state === 'rise') {
            b.a += b.w * dt;
            const tx = flock.x + Math.cos(b.a) * b.r, ty = flock.y + Math.sin(b.a) * b.r * 0.8;
            const px = b.x, py = b.y;
            b.x += (tx - b.x) * 0.05 * k; b.y += (ty - b.y) * 0.05 * k;
            if (Math.hypot(b.x - px, b.y - py) > 0.05) b.yaw = Math.atan2(b.y - py, b.x - px);
            b.z += (b.alt - b.z) * 0.02 * k;
            b.fold += (0 - b.fold) * 0.1 * k;
            // gannets mostly glide, with a few beats now and then; climbing takes work
            b.beat += ((b.state === 'rise' || Math.sin(t * 0.6 + b.r) > 0.4 ? 1 : 0.12) - b.beat) * 0.06 * k;
            b.flap += dt * 11;
            if (b.state === 'rise' && b.z > b.alt - 12) b.state = 'fly';
          } else if (b.state === 'dive') {
            const p = Math.min(1, b.st / 0.55);
            b.fold = Math.min(1, p * 3);
            b.x = b.sx + (b.tx - b.sx) * p; b.y = b.sy + (b.ty - b.sy) * p;
            b.z = b.sz * (1 - p * p);
            b.yaw = Math.atan2(b.ty - b.sy, b.tx - b.sx);
            if (p >= 1) {
              b.state = 'under'; b.st = 0;
              Sea.water.splash(b.x, b.y, 22, -1.8);
              Sea.scene.emit({ k: 'ring', x: b.x, y: b.y, life: 30, size: 3, grow: 26 });
              Sea.scene.burst('spray', b.x, b.y, 2, 9, { speed: 1.2, up: 4, life: 34, size: 1.8 });
              if (b.prey && b.prey.count > 0) b.prey.take(1);
            }
          } else if (b.state === 'under') {
            if (b.st > 1.1) { b.state = 'sit'; b.st = 0; b.z = 2; b.x += rand(-14, 14); b.y += rand(-14, 14); Sea.water.splash(b.x, b.y, 12, 0.7); }
          } else if (b.state === 'sit') {
            b.z = 2; b.fold = 1;
            if (b.st > 1.4) { b.state = 'rise'; b.beat = 1; Sea.water.splash(b.x, b.y, 12, -0.6); }
          }
        }
        if (flock.leaving && flock.age > 6 && birds.every((b) => Sea.world.gone(b.x, b.y, 140))) this.dead = true;
      },
      shadow(c) {
        for (const b of birds) {
          if (b.state === 'under') continue;
          const h = clamp(b.z / ALT, 0, 1);
          // the higher the bird, the further off and fainter its shadow
          Sea.scene.blobShadow(c, b.x + h * 20, b.y + h * 26, b.yaw + 1.571, 13 - h * 4, 4, 0.2 - h * 0.09);
        }
      },
      draw(S) { for (const b of birds) if (b.state !== 'under' && !Sea.world.gone(b.x, b.y, 120)) drawBird(S, b); },
      leave() { flock.leaving = true; }
    };
  }

  Sea.creature({ id: 'seabirds', name: 'Seabirds', kind: 'ambient', when: 'day', eats: ['fish'], weight: 2, max: 1, cooldown: 40, spawn });
})();
