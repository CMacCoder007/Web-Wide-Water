// Model building kit. A model is a list of 3D points and flat coloured faces,
// built in code; scene.js lights and draws it.
// Local axes: +x forward (nose / bow), +y right, +z up. Units are px.
//
//   const b = new Sea.models.Builder();
//   b.box(x0, x1, y0, y1, z0, z1, colour, topColour)
//   b.loft(outline, rings, topColour)       stack a flat outline at several heights (hulls, ice)
//   b.blob(cx, cy, cz, rx, ry, rz, colour)  faceted ellipsoid
//   b.tube(sections, sides, colourAt)       a body made of rings along x (fish, whales)
//   b.face([i, j, k...], colour, twoSided)  one polygon from b.vert(x, y, z) indices
//   b.solid(() => { ... })                  faces added inside are turned to face outwards
//   b.mesh()                                -> { v, f } to hand to S.mesh()
//
//   Sea.models.once('orca', build)          build a model the first time it is asked for, then reuse it
(() => {
  const Sea = window.Sea;
  if (!Sea || Sea.models) return;

  // Slightly vary each face's colour so flat surfaces still look faceted.
  const tone = (c, amt = 0.07) => { const k = 1 - amt + Math.random() * amt * 2; return [c[0] * k, c[1] * k, c[2] * k]; };

  class Builder {
    constructor() { this.v = []; this.f = []; }
    vert(x, y, z) { this.v.push([x, y, z]); return this.v.length - 1; }
    face(i, c, two) { this.f.push({ i, c: tone(c), two: !!two }); }

    // Faces added inside fn() form one convex solid: flip each so it faces outwards.
    solid(fn) {
      const v0 = this.v.length, f0 = this.f.length;
      fn();
      let cx = 0, cy = 0, cz = 0;
      const n = this.v.length - v0;
      for (let i = v0; i < this.v.length; i++) { cx += this.v[i][0]; cy += this.v[i][1]; cz += this.v[i][2]; }
      cx /= n; cy /= n; cz /= n;
      for (let k = f0; k < this.f.length; k++) {
        const f = this.f[k];
        if (f.two) continue;
        const a = this.v[f.i[0]], b = this.v[f.i[1]], c = this.v[f.i[2]];
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        let fx = 0, fy = 0, fz = 0;
        for (const idx of f.i) { fx += this.v[idx][0]; fy += this.v[idx][1]; fz += this.v[idx][2]; }
        const m = f.i.length;
        if (nx * (fx / m - cx) + ny * (fy / m - cy) + nz * (fz / m - cz) < 0) f.i.reverse();
      }
    }

    box(x0, x1, y0, y1, z0, z1, c, top) {
      this.solid(() => {
        const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const lo = p.map(([x, y]) => this.vert(x, y, z0)), hi = p.map(([x, y]) => this.vert(x, y, z1));
        for (let i = 0; i < 4; i++) this.face([lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]], c);
        this.face(hi.slice(), top || c);
        this.face(lo.slice().reverse(), c);
      });
    }

    // Stack copies of a flat outline at different heights and join them up.
    // rings: [{ z, k (width scale), c (colour of the band below this ring) }]
    loft(outline, rings, topColour) {
      this.solid(() => {
        const idx = rings.map((r) => outline.map(([x, y]) => this.vert(x * (r.kx == null ? 1 : r.kx), y * r.k, r.z)));
        const n = outline.length;
        for (let r = 1; r < rings.length; r++) {
          for (let i = 0; i < n; i++) {
            this.face([idx[r - 1][i], idx[r - 1][(i + 1) % n], idx[r][(i + 1) % n], idx[r][i]], rings[r].c);
          }
        }
        this.face(idx[rings.length - 1].slice(), topColour);
        this.face(idx[0].slice().reverse(), rings[1].c);
      });
    }

    // A faceted ellipsoid.
    blob(cx, cy, cz, rx, ry, rz, colourAt, lat = 3, lon = 6) {
      this.solid(() => {
        const rows = [];
        for (let a = 0; a <= lat; a++) {
          const phi = (a / lat) * Math.PI, row = [];
          const n = (a === 0 || a === lat) ? 1 : lon;
          for (let b = 0; b < n; b++) {
            const th = (b / lon) * Math.PI * 2;
            row.push(this.vert(cx + Math.sin(phi) * Math.cos(th) * rx, cy + Math.sin(phi) * Math.sin(th) * ry, cz + Math.cos(phi) * rz));
          }
          rows.push(row);
        }
        for (let a = 0; a < lat; a++) {
          const A = rows[a], B = rows[a + 1];
          for (let b = 0; b < lon; b++) {
            const b2 = (b + 1) % lon;
            const zMid = cz + Math.cos(((a + 0.5) / lat) * Math.PI) * rz;
            const c = typeof colourAt === 'function' ? colourAt(zMid) : colourAt;
            if (A.length === 1) this.face([A[0], B[b], B[b2]], c);
            else if (B.length === 1) this.face([A[b], B[0], A[b2]], c);
            else this.face([A[b], B[b], B[b2], A[b2]], c);
          }
        }
      });
    }

    // A body made of rings along the x axis, tail to nose.
    // sections: [[x, halfWidth, halfHeight, zCentre?], ...]
    // colourAt(x, y, z, halfHeight) is asked for the colour at the middle of each face
    // (z is measured from the body's centre line).
    tube(sections, sides, colourAt) {
      const K = sides || 8;
      this.solid(() => {
        const rings = sections.map(([x, w, h, zc]) => {
          const r = [];
          for (let k = 0; k < K; k++) {
            const a = (k / K) * Math.PI * 2 + Math.PI / K;
            r.push(this.vert(x, Math.cos(a) * w, (zc || 0) + Math.sin(a) * h));
          }
          return r;
        });
        const mid = (ids, zc) => {
          let x = 0, y = 0, z = 0;
          for (const i of ids) { x += this.v[i][0]; y += this.v[i][1]; z += this.v[i][2]; }
          return [x / ids.length, y / ids.length, z / ids.length - zc];
        };
        for (let s = 1; s < rings.length; s++) {
          const h = (sections[s][2] + sections[s - 1][2]) / 2;
          const zc = ((sections[s][3] || 0) + (sections[s - 1][3] || 0)) / 2;
          for (let k = 0; k < K; k++) {
            const k2 = (k + 1) % K;
            const ids = [rings[s - 1][k], rings[s - 1][k2], rings[s][k2], rings[s][k]];
            const m = mid(ids, zc);
            this.face(ids, colourAt(m[0], m[1], m[2], h));
          }
        }
        const first = sections[0], lastS = sections[sections.length - 1];
        this.face(rings[0].slice(), colourAt(first[0], 0, 0, first[2]));
        this.face(rings[rings.length - 1].slice(), colourAt(lastS[0], 0, 0, lastS[2]));
      });
    }

    mesh() { return { v: this.v, f: this.f }; }
  }

  const cache = {};
  Sea.models = {
    Builder,
    tone,
    once: (key, make) => cache[key] || (cache[key] = make())
  };
})();
