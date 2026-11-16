// Mischief: the two ways the sea is allowed to mess with you, both only while
// "Mischief mode" is on in the popup. With it off, every call here refuses, so
// creatures can call them without checking.
//
// 1. Cursor capture. A web page can't move the real pointer, so when a monster
//    grabs the cursor we hide the real one and show a stand-in the monster
//    controls. The real pointer keeps moving unseen, and its movements are how
//    you fight back (shaking, pulling). While it is held nothing can be clicked.
//    Esc frees it at once.
//
//      Sea.cursor.x / .y            real pointer position
//      Sea.cursor.onDelta(fn)       fn(dx, dy) on every real pointer move; returns an unsubscribe
//      Sea.cursor.capture()         take the cursor; false if refused or already held
//      Sea.cursor.place(x, y, rot)  move the stand-in
//      Sea.cursor.release()         the stand-in springs back to the real pointer
//      Sea.cursor.held
//
// 2. Page damage. A letter can be blown off the page, or a whole word eaten. The
//    text is only hidden, never deleted, and it grows back by itself after about
//    20 seconds. Turning the sea (or mischief) off puts everything back at once.
//
//      Sea.page.knockAt(x, y)       blow away the letter under a viewport point
//      Sea.page.eatWordAt(x, y)     swallow the word under a viewport point
(() => {
  const Sea = window.Sea;
  if (!Sea || Sea.cursor) return;
  const { rand } = Sea.util;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const allowed = () => Sea.active && Sea.settings.mischief;

  // ---------- cursor ----------
  let x = innerWidth / 2, y = innerHeight / 2;
  const subs = new Set();
  let shield = null, fake = null, held = false, fx = 0, fy = 0, frot = 0, backRaf = 0;

  function onMove(e) {
    const dx = e.clientX - x, dy = e.clientY - y;
    x = e.clientX; y = e.clientY;
    if (dx || dy) for (const fn of subs) fn(dx, dy);
  }
  function onKey(e) { if (e.key === 'Escape' && (held || backRaf)) drop(); }

  function arrow() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 22 30'); svg.setAttribute('width', 22); svg.setAttribute('height', 30);
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M2 2 L2 23 L7.6 17.8 L11.8 27.4 L15.2 25.9 L11.1 16.6 L18.8 16.6 Z');
    p.setAttribute('fill', '#111'); p.setAttribute('stroke', '#fff');
    p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  }

  function show() {
    if (fake) fake.style.transform = `translate(${(fx - 2).toFixed(1)}px, ${(fy - 2).toFixed(1)}px) rotate(${frot.toFixed(1)}deg)`;
  }

  function drop() {
    Sea.caf(backRaf); backRaf = 0; held = false;
    if (shield) shield.remove();
    if (fake) fake.remove();
    shield = fake = null;
  }

  Sea.cursor = {
    get x() { return x; },
    get y() { return y; },
    get held() { return held; },
    onDelta(fn) { subs.add(fn); return () => subs.delete(fn); },

    capture() {
      if (held || backRaf || !allowed()) return false;
      held = true;
      const { el } = Sea.util;
      shield = el('div', { position: 'absolute', inset: '0', pointerEvents: 'auto', cursor: 'none' });
      fake = el('div', {
        position: 'absolute', left: '0', top: '0', pointerEvents: 'none', lineHeight: '0',
        willChange: 'transform', transformOrigin: '2px 2px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.4))'
      });
      fake.appendChild(arrow());
      Sea.util.layer().append(shield, fake);
      fx = x; fy = y; frot = 0; show();
      return true;
    },

    place(px, py, rot = 0) {
      if (!held) return;
      fx = px; fy = py; frot = rot; show();
    },

    release() {
      if (!held) return;
      held = false;
      let vx = 0, vy = 0;
      const back = () => {
        vx = (vx + (x - fx) * 0.14) * 0.7; vy = (vy + (y - fy) * 0.14) * 0.7;
        fx += vx; fy += vy; frot *= 0.8; show();
        if (Math.hypot(x - fx, y - fy) < 2 && Math.hypot(vx, vy) < 1.2) { backRaf = 0; drop(); }
        else backRaf = Sea.raf(back);
      };
      backRaf = Sea.raf(back);
    },

    drop
  };

  // ---------- page damage ----------
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|NOSCRIPT|IFRAME|SVG|CODE|PRE)$/i;
  const REGROW_MS = 20000, MAX_HOLES = 220;
  let holes = [];   // { el, timer }

  // the text node and character under a viewport point, if it is ordinary page text
  function locate(px, py) {
    if (!allowed()) return null;
    let range = null;
    try { range = document.caretRangeFromPoint(px, py); } catch (e) { return null; }
    const node = range && range.startContainer;
    if (!node || node.nodeType !== 3) return null;
    const parent = node.parentElement;
    if (!parent || Sea.util.isOurs(parent) || SKIP.test(parent.tagName) || parent.isContentEditable) return null;
    const i = Math.min(range.startOffset, node.data.length - 1);
    if (i < 0 || !node.data[i] || !node.data[i].trim()) return null;
    return { node, parent, i };
  }

  // hide characters a..b of a text node without changing the layout
  function hide(node, parent, a, b) {
    try {
      const tail = node.splitText(a);
      tail.splitText(b - a);
      const el = document.createElement('span');
      el.setAttribute('data-sea', '');
      el.style.visibility = 'hidden';
      parent.insertBefore(el, tail);
      el.appendChild(tail);
      const h = { el, timer: 0 };
      h.timer = setTimeout(() => mend(h, false), REGROW_MS + rand(0, 4000));
      holes.push(h);
      if (holes.length > MAX_HOLES) mend(holes[0], true);
      return true;
    } catch (e) { return false; }
  }

  function mend(h, instant) {
    clearTimeout(h.timer);
    holes = holes.filter((o) => o !== h);
    const el = h.el;
    const unwrap = () => {
      const p = el.parentNode;
      if (!p) return;
      while (el.firstChild) p.insertBefore(el.firstChild, el);
      el.remove();
      p.normalize();
    };
    if (instant || !el.isConnected) { unwrap(); return; }
    el.style.visibility = 'visible';
    try { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900 }).onfinish = unwrap; } catch (e) { unwrap(); }
  }

  function knockAt(px, py) {
    const at = locate(px, py);
    if (!at) return false;
    const r = document.createRange();
    r.setStart(at.node, at.i); r.setEnd(at.node, at.i + 1);
    const box = r.getBoundingClientRect();
    if (!box.width || !box.height || box.height > 200) return false;
    const cs = getComputedStyle(at.parent), ch = at.node.data[at.i];
    if (!hide(at.node, at.parent, at.i, at.i + 1)) return false;

    // the letter itself is thrown clear, spinning, and fades
    const f = Sea.util.el('span', {
      position: 'absolute', left: box.left + 'px', top: box.top + 'px', margin: '0', padding: '0', display: 'block',
      font: cs.font, color: cs.color, lineHeight: box.height + 'px', whiteSpace: 'pre', pointerEvents: 'none', willChange: 'transform'
    }, ch);
    Sea.util.layer().appendChild(f);
    const dx = rand(-70, 70), up = rand(40, 90), spin = rand(-500, 500);
    try {
      f.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${-up}px) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${rand(10, 40)}px) rotate(${spin}deg)`, opacity: 0 }
      ], { duration: 1100, easing: 'ease-out' }).onfinish = () => f.remove();
    } catch (e) { f.remove(); }
    Sea.water.splash(box.left, box.top + box.height / 2, 16, 1.2);
    return true;
  }

  function eatWordAt(px, py) {
    const at = locate(px, py);
    if (!at) return false;
    const str = at.node.data;
    let a = at.i, b = at.i + 1;
    while (a > 0 && str[a - 1].trim()) a--;
    while (b < str.length && str[b].trim()) b++;
    return hide(at.node, at.parent, a, b);
  }

  const mendAll = () => { for (const h of holes.slice()) mend(h, true); };
  Sea.page = { knockAt, eatWordAt, mendAll, get holes() { return holes.length; } };

  Sea.feature({
    id: 'mischief',
    start() {
      window.addEventListener('pointermove', onMove, { capture: true, passive: true });
      window.addEventListener('keydown', onKey, true);
    },
    stop() {
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('keydown', onKey, true);
      drop(); mendAll();
    },
    // mischief switched off while something has hold of the cursor or the page
    onSettings(s) { if (!s.mischief) { if (held || backRaf) drop(); mendAll(); } }
  });
})();
