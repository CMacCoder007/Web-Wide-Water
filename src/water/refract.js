// Refraction + shine: turns the wave sim into
//  1. a displacement map fed to an SVG filter, applied as a backdrop-filter on an
//     overlay, so the live page underneath bends with the waves;
//  2. a highlight/shadow canvas on top so the surface reads as wet.
//
// The backdrop filter is the most expensive thing the sea does: the browser has
// to redraw whatever is under it through the filter every time the map changes.
// So it is kept as small as possible:
//   - the overlay only covers the part of the page where the water is actually
//     moving (a fin's wake is a strip, not the whole screen);
//   - it is hidden entirely when the water is flat, and while you are typing;
//   - under load it is redrawn every other frame.
// The overlay ignores the pointer, so the page stays fully usable.
(() => {
  const Sea = window.Sea;
  if (!Sea || !Sea.water || Sea.refract) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SLOPE_GAIN = 110;   // sim slope -> map channel units
  const LIGHT_X = -0.55, LIGHT_Y = -0.83;
  const EPS = 0.015;        // water flatter than this bends the page by well under a pixel
  const PAD = 2;            // cells of margin round the moving water (slopes reach one cell out)
  const QUANT = 8;          // the overlay grows in steps of 8 cells, so it is not re-made every frame

  let root, feImage, feDisp, lens, shine, shineCtx, mapCanvas, mapCtx, mapData, shineData;
  let bw = 0, bh = 0, bx = -1, by = -1, visible = false, skip = false, off1, off2, lastPower = -1;

  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function build() {
    root = document.createElement('div');
    root.setAttribute('data-sea', '');
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;display:none;contain:strict;';

    const svg = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true' });
    svg.style.cssText = 'position:absolute;width:0;height:0;';
    const filter = svgEl('filter', {
      id: 'sea-refract', x: 0, y: 0, width: '100%', height: '100%',
      filterUnits: 'objectBoundingBox', primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB'
    });
    feImage = svgEl('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
    feDisp = svgEl('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'map', scale: Sea.water.power, xChannelSelector: 'R', yChannelSelector: 'G'
    });
    filter.append(feImage, feDisp);
    svg.append(filter);

    lens = document.createElement('div');
    lens.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;-webkit-backdrop-filter:url(#sea-refract);backdrop-filter:url(#sea-refract);';

    shine = document.createElement('canvas');
    shine.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;';
    shineCtx = shine.getContext('2d');

    mapCanvas = document.createElement('canvas');
    // CPU canvas: reading it back with toDataURL is ~8x faster than from a GPU canvas.
    mapCtx = mapCanvas.getContext('2d', { willReadFrequently: true });

    root.append(svg, lens, shine);
    document.documentElement.appendChild(root);
  }

  // size the map, the shine and the overlay to a box of w x h cells
  function size(w, h) {
    bw = w; bh = h;
    mapCanvas.width = shine.width = w;
    mapCanvas.height = shine.height = h;
    mapData = mapCtx.createImageData(w, h);
    shineData = shineCtx.createImageData(w, h);
    const cell = Sea.water.cell;
    feImage.setAttribute('width', w * cell);
    feImage.setAttribute('height', h * cell);
    for (const el of [lens, shine]) { el.style.width = w * cell + 'px'; el.style.height = h * cell + 'px'; }
    bx = by = -1;
  }

  function place(i0, j0) {
    if (i0 === bx && j0 === by) return;
    bx = i0; by = j0;
    // cell i of the sim sits at page x = (i - 1) * cell (the sim has a one-cell border)
    const cell = Sea.water.cell, x = (i0 - 1) * cell, y = (j0 - 1) * cell;
    for (const el of [lens, shine]) el.style.transform = `translate(${x}px,${y}px)`;
  }

  function draw({ h, W, H }) {
    if (!root.isConnected) document.documentElement.appendChild(root);   // the page rebuilt itself
    // calm while you type: nothing bends under the text you are writing
    if (Sea.typing) { hide(); return; }
    if (Sea.perf && Sea.perf.level >= 1 && visible && (skip = !skip)) return;
    if (Sea.water.power !== lastPower) { lastPower = Sea.water.power; feDisp.setAttribute('scale', lastPower); }

    // 1. where is the water moving at all?
    let i0 = W, i1 = -1, j0 = H, j1 = -1;
    for (let j = 0; j < H; j++) {
      const row = j * W;
      let first = -1, lastI = -1;
      for (let i = 0; i < W; i++) {
        const v = h[row + i];
        if (v > EPS || v < -EPS) { if (first < 0) first = i; lastI = i; }
      }
      if (first < 0) continue;
      if (first < i0) i0 = first;
      if (lastI > i1) i1 = lastI;
      if (j < j0) j0 = j;
      j1 = j;
    }
    if (i1 < 0) { hide(); return; }

    // 2. a box round it, in steps, never bigger than the sim
    const want = (lo, hi, max) => {
      lo = Math.max(0, lo - PAD); hi = Math.min(max - 1, hi + PAD);
      let n = Math.min(max, Math.ceil((hi - lo + 1) / QUANT) * QUANT);
      if (lo + n > max) lo = max - n;
      return [lo, n];
    };
    const [x0, w] = want(i0, i1, W), [y0, hh] = want(j0, j1, H);
    if (w !== bw || hh !== bh) size(w, hh);
    place(x0, y0);

    // 3. slopes and light, only inside the box
    const m = mapData.data, s = shineData.data;
    for (let jj = 0; jj < hh; jj++) {
      const j = y0 + jj, jm = j > 0 ? -W : 0, jp = j < H - 1 ? W : 0;
      for (let ii = 0; ii < w; ii++) {
        const i = x0 + ii, k = j * W + i, p = (jj * w + ii) * 4;
        const gx = h[k + (i < W - 1 ? 1 : 0)] - h[k - (i > 0 ? 1 : 0)];
        const gy = h[k + jp] - h[k + jm];
        const r = 128 + gx * SLOPE_GAIN, g = 128 + gy * SLOPE_GAIN;
        m[p] = r < 0 ? 0 : r > 255 ? 255 : r;
        m[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        m[p + 2] = 128; m[p + 3] = 255;

        // Slopes facing the light glint white; slopes facing away go deep blue.
        const lit = (gx * LIGHT_X + gy * LIGHT_Y) * 1.3;
        if (lit > 0) {
          const a = lit * lit * 255;
          s[p] = 255; s[p + 1] = 255; s[p + 2] = 255; s[p + 3] = a > 190 ? 190 : a;
        } else {
          const a = -lit * 80;
          s[p] = 0; s[p + 1] = 45; s[p + 2] = 110; s[p + 3] = a > 60 ? 60 : a;
        }
      }
    }
    mapCtx.putImageData(mapData, 0, 0);
    shineCtx.putImageData(shineData, 0, 0);
    feImage.setAttribute('href', mapCanvas.toDataURL('image/png'));
    if (!visible) { root.style.display = 'block'; visible = true; }
  }

  function hide() {
    if (root && visible) root.style.display = 'none';
    visible = false;
  }

  Sea.refract = {
    start() {
      if (root) return;
      build();
      off1 = Sea.water.onFrame(draw);
      off2 = Sea.water.onSleep(hide);
    },
    stop() {
      if (off1) off1();
      if (off2) off2();
      off1 = off2 = null;
      if (root) root.remove();
      root = null; visible = false; bw = bh = 0; bx = by = -1; lastPower = -1;
    }
  };
})();
