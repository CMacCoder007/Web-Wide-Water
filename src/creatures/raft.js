// The castaway: a man on a raft of lashed logs, with a rag on a pole, drifting
// wherever the water takes him. He comes onto the page and, left alone, drifts
// off it again.
//
// He can be saved. Any honest ship on the page (a merchant, the navy, or your
// own) will make for him, and when it comes alongside he is taken aboard: he
// waves as it approaches, and the empty raft is left to sink. Pirates sail past. Sharks circle him, which does him no harm.
//
//   Sea.castaway   -> { x, y, yaw, saved, rescue(ship) } while he is adrift, else null
(() => {
  const Sea = window.Sea;
  if (!Sea) return;
  const { rand, clamp } = Sea.util;
  const LOG = [128, 92, 54], LOG2 = [104, 74, 44], RAG = [222, 214, 190], SHIRT = [226, 226, 214], SKIN = [214, 164, 124], HAIR = [70, 50, 34];

  function buildRaft() {
    const b = new Sea.models.Builder();
    for (let i = -2; i <= 2; i++) b.box(-20, 20 - Math.abs(i) * 2, i * 6 - 2.6, i * 6 + 2.6, -1, 3, i % 2 ? LOG2 : LOG);     // five logs
    b.box(-13, -10, -14, 14, 3, 4.4, LOG2); b.box(10, 13, -13, 13, 3, 4.4, LOG2);                                             // lashings
    b.box(-15, -13.4, -0.8, 0.8, 3, 34, LOG2);                                                                                // the pole
    b.face([b.vert(-14, 0, 33), b.vert(-14, 0, 22), b.vert(-27, 0, 27)], RAG, true);                                          // and the rag
    b.box(4, 9, 6, 11, 3, 7, [150, 110, 70]);                                                                                 // one small crate
    return b.mesh();
  }
  function buildMan() {
    const b = new Sea.models.Builder();
    b.box(-2.4, 2.4, -3.2, 3.2, 3, 13, SHIRT);          // sitting up
    b.blob(0, 0, 16.4, 3, 3, 3.2, (z) => (z > 17.6 ? HAIR : SKIN), 2, 5);
    b.box(2, 9, -3, -0.6, 3, 5, [90, 78, 60]); b.box(2, 9, 0.6, 3, 3, 5, [90, 78, 60]);   // legs out in front
    return b.mesh();
  }

  function spawn() {
    if (Sea.castaway) return null;
    const raft = Sea.models.once('raft', buildRaft), man = Sea.models.once('castaway', buildMan);
    const start = Sea.world.entry(60);
    const r = {
      x: start.x, y: start.y, yaw: rand(0, 6), spin: rand(-0.002, 0.002), vx: Math.cos(start.yaw) * 0.3, vy: Math.sin(start.yaw) * 0.3,
      age: 0, saved: false, sink: 0, seed: rand(0, 9), wave: 0, hurry: 1,
      rescue(ship) {
        if (r.saved) return;
        r.saved = true;
        Sea.scene.emit({ k: 'ring', x: r.x, y: r.y, life: 50, size: 10, grow: 70 });
        Sea.scene.burst('spray', r.x, r.y, 4, 14, { speed: 1.6, up: 4, life: 40, size: 2 });
        if (ship) ship.kick = 0.2;
        const tag = Sea.util.el('div', {
          position: 'absolute', left: clamp(r.x - 60, 8, innerWidth - 130) + 'px', top: r.y - 44 + 'px', padding: '4px 12px', borderRadius: '3px', pointerEvents: 'none',
          background: 'rgba(240,226,190,.95)', color: '#3b2a1a', border: '1px solid rgba(90,60,30,.55)', font: 'italic 600 13px Georgia, serif', whiteSpace: 'nowrap'
        }, 'Castaway rescued');
        Sea.util.layer().appendChild(tag);
        try { tag.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-30px)', opacity: 1, offset: 0.7 }, { transform: 'translateY(-40px)', opacity: 0 }], { duration: 2800 }).onfinish = () => tag.remove(); } catch (e) { tag.remove(); }
      }
    };
    Sea.castaway = r;

    return {
      update(t, dt) {
        const k = dt * 60;
        r.age += dt;
        // adrift: the swell pushes him about and he turns slowly
        const sl = Sea.water.slopeAt(r.x, r.y);
        r.vx += (-sl.x * 0.03 + Math.cos(t * 0.13 + r.seed) * 0.0012) * k; r.vy += (-sl.y * 0.03 + Math.sin(t * 0.17 + r.seed) * 0.0012) * k;
        // for the first minute the currents keep him roughly on the page, wandering; after that he drifts away
        if (r.age < 60 && r.hurry === 1) { r.vx += (innerWidth / 2 - r.x) * 0.000006 * k; r.vy += (innerHeight / 2 - r.y) * 0.000006 * k; }
        const sp = Math.hypot(r.vx, r.vy), top = 0.3 * r.hurry;
        if (sp > top) { r.vx *= top / sp; r.vy *= top / sp; }
        r.x += r.vx * k; r.y += r.vy * k; r.yaw += r.spin * k;
        const ice = Sea.world.collide(r.x, r.y, 18);          // the raft fetches up against ice and slides round it
        if (ice) { r.x = ice.x; r.y = ice.y; r.vx += ice.nx * 0.02; r.vy += ice.ny * 0.02; }
        // he waves both arms when a ship is close enough to see him
        const ship = !r.saved && Sea.ships ? Sea.ships.all.find((s) => s.afloat && s.kind !== 'pirate' && Math.hypot(s.x - r.x, s.y - r.y) < 420) : null;
        r.wave += ((ship ? 1 : 0) - r.wave) * 0.05 * k;
        if (r.saved) r.sink += dt;
        if (Math.random() < 0.03 * k && !Sea.world.gone(r.x, r.y, 20)) Sea.water.splash(r.x, r.y, 20, -0.25);
        if (r.sink > 9 || (r.age > 8 && Sea.world.gone(r.x, r.y, 80))) { this.dead = true; if (Sea.castaway === r) Sea.castaway = null; }
      },
      shadow(c) { if (r.sink < 4) Sea.scene.blobShadow(c, r.x, r.y, r.yaw, 22, 15, 0.22); },
      draw(S, t) {
        if (Sea.world.gone(r.x, r.y, 60)) return;
        const bob = Math.sin(t * 1.4 + r.seed) * 0.8 - Sea.water.heightAt(r.x, r.y) * 2.5 - Math.max(0, r.sink - 2) * 1.6;
        const pose = { x: r.x, y: r.y, z: bob, yaw: r.yaw, roll: Math.sin(t * 1.1 + r.seed) * 0.06 + r.sink * 0.03, pitch: Math.sin(t * 0.9) * 0.04 };
        S.mesh(raft, pose);
        if (r.saved) return;
        S.mesh(man, pose);
        // arms: down at his sides, or up and waving
        const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
        for (const sd of [-1, 1]) {
          const up = r.wave * (9 + Math.sin(t * 9 + sd) * 3), out = sd * (3.4 + r.wave * 4);
          const P = (lx, ly, lz) => [r.x + lx * c - ly * s, r.y + lx * s + ly * c, bob + lz];
          S.poly([P(-1, sd * 3.2, 12), P(1, sd * 3.2, 12), P(1, out, 9 + up), P(-1, out, 9 + up)], SKIN, { two: true, bias: 3 });
        }
      },
      leave() { r.hurry = 6; r.vx = (r.x - innerWidth / 2) * 0.01; r.vy = (r.y - innerHeight / 2) * 0.01; }
    };
  }

  Sea.feature({ id: 'castaway', stop() { Sea.castaway = null; } });
  Sea.creature({ id: 'castaway', name: 'Castaway on a raft', kind: 'event', regions: ['tropical', 'open'], weight: 1.1, max: 1, cooldown: 90, spawn });
})();
