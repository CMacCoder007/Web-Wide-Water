# Adding a creature

A creature is **one file** in `src/creatures/` that registers itself, plus **one line** in `manifest.json`
(add the file to the `content_scripts` list, anywhere after `src/interact.js` and before `src/boot.js`).
It then appears in the popup by itself, with its own on/off switch and Summon button.

`src/creatures/orca.js` is the worked example. Copy it and change it.

## 1. Register

```js
(() => {
  const Sea = window.Sea;
  if (!Sea) return;

  Sea.creature({
    id: 'dolphin',          // unique, used in settings
    name: 'Dolphins',       // shown in the popup
    kind: 'ambient',        // 'ambient' (everyday), 'event' (big and rare) or 'mischief' (messes with you)
    weight: 3,              // how often the director picks it, compared with the others
    max: 1,                 // how many may be on the page at once
    cooldown: 25,           // seconds before the director may pick it again
    auto: true,             // false = only ever appears when summoned by hand
    spawn                   // function that returns one entity (see below)
  });
})();
```

Optional fields that place it in the ecosystem:

| Field | Meaning |
|---|---|
| `kind: 'small'` | Background life (krill, schools, jellyfish). The director keeps some of this about at all times, separately from the bigger animals. |
| `regions: ['tropical', 'open', 'north']` | Which waters it lives in. Leave it out for everywhere. The user can change this per creature in the popup. |
| `when: 'day'` or `'night'` | Only turns up then. |
| `eats: ['fish', 'krill', 'jelly', 'seal']` | It is three times as likely to arrive when its food is on the page, and much less likely when it is not. |

Food web calls (see the top of `src/sea/eco.js`):

| Call | What it gives you |
|---|---|
| `Sea.eco.find(kinds, x, y, maxDist)` | The nearest prey group: `{ kind, x, y, r, count, take(n, x, y), herd() }`. `take` eats from it; `herd()` called every frame makes a school ball up and stop. |
| `Sea.eco.hunters.add(obj)` | Anything with `x` and `y`. Schools and seals flee from these. Remove it when you leave. |
| `Sea.eco.school({ kind, n, colours, size, radius, speed, timid, dots })` | A ready-made swarm entity of hundreds of cheap shapes. `src/creatures/prey.js` shows how little a new school needs. |
| `Sea.eco.groups.add(group)` | Register your own prey group (see the jellyfish and seals). |
| `Sea.eco.region()`, `Sea.eco.night()`, `Sea.eco.weather()` | Where and when it is, if your creature should behave differently. |

`spawn(opts)` gets `opts.summoned = true` when the user called it up by hand. Use it to arrive sooner or to
bring along whatever the event needs (the megalodon and kraken send for a ship); a summoned creature is never
sent away by the load governor or by a change of waters. Return `null` if it cannot come right now.

## 2. The entity

`spawn()` returns one object. A group (a pod, a school) is still one entity that looks after its members.
Every method is optional except that you must set `dead = true` when it has left, or it stays forever.

| Method | When | What for |
|---|---|---|
| `update(t, dt)` | every frame | Move. `t` is seconds, `dt` is seconds since the last frame (never more than 0.05). Multiply speeds by `dt * 60` so it moves the same on any screen. |
| `under(ctx, t)` | every frame, first | Draw what is seen through the water: a dark silhouette, in plain canvas 2D. |
| `shadow(ctx, t)` | after `under` | Draw a shadow on the water for anything in the air. `Sea.scene.blobShadow(...)` does an ellipse. |
| `draw(S, t)` | after `shadow` | Draw the 3D model: `S.mesh(model, pose, { deform })` or `S.poly(points, rgb)`. Anything below the waterline (z < 0) is cut off automatically. |
| `leave()` | when switched off in the popup | Swim away quickly instead of vanishing. |
| `dead` | | Set to `true` when it is off the page and finished. |

`pose` is `{ x, y, z, yaw, pitch, roll, s }`: page position, height above the water, heading, nose up/down,
roll, and scale. Model axes: **+x forward, +y right, +z up**.

## 3. The model

Build it in code with `new Sea.models.Builder()` (see the top of `src/sea/models.js`): `tube` for bodies,
`box`, `loft` (hulls, ice), `blob`, and `face` for thin fins. Wrap it in
`Sea.models.once('name', build)` so it is only built once.

## 4. Disturbing the water

| Call | Effect |
|---|---|
| `Sea.water.splash(x, y, radius, strength)` | A ripple. Negative strength pushes down (things landing), positive pushes up (things rising). |
| `Sea.water.band(y, thickness, strength)` | A wave front across the whole width. |
| `Sea.scene.emit({ k: 'foam' \| 'ring' \| 'spray' \| 'chunk', x, y, z, life, size, ... })` | One particle. |
| `Sea.scene.burst('spray', x, y, z, count, { speed, up, life, size })` | Many at once. |

Keep it calm: the page has to stay readable. As a guide, the orca's wake is strength `-0.3` and its breach
landing is `-2.6` over a 60px radius. A whale can go bigger; nothing should be bigger for longer.

## 5. Living with the others

| Call | What it gives you |
|---|---|
| `Sea.world.entry(margin)` | `{ x, y, yaw }`: a starting point just off-screen, heading across the page. |
| `Sea.world.gone(x, y, margin)` | True when a point is further than `margin` outside the view. Use it to skip drawing and to decide when to set `dead`. |
| `Sea.world.avoid(x, y, yaw, reach)` | A turn to add to your heading each frame so you steer round ice and the cursor. |
| `Sea.world.collide(x, y, radius)` | For things that must not pass through ice: returns `null`, or `{ x, y, nx, ny }` with the position pushed back out. Ships use `Sea.ships.bump(ship)`, which also handles ship against ship. |
| `Sea.world.obstacles` | A `Set` of `{ x, y, r }` circles. Ice adds itself here and removes itself when it has drifted off. |
| `Sea.world.cursor` | `{ x, y }`, or `null` when the user has switched "creatures notice the cursor" off. |

## Mischief

Only these calls may touch the user's cursor or the page's text. They all refuse (return `false`) when
Mischief mode is off, so call them freely and carry on if they refuse. See `src/sea/mischief.js`.

| Call | Effect |
|---|---|
| `Sea.page.knockAt(x, y)` | Blows the letter under a point off the page. It grows back in about 20 seconds. |
| `Sea.page.eatWordAt(x, y)` | Hides the word under a point. It grows back the same way. |
| `Sea.cursor.capture()` / `place(x, y, rot)` / `release()` | Take the cursor, move the stand-in, give it back. Always give the user a way to win, and check `Sea.cursor.held` each frame: Esc frees it. |
| `Sea.cursor.onDelta(fn)` | Real mouse movement, for shake / pull contests. |
| `Sea.ships.afloat()` and `ship.sinkBy(who)` | Ships on the page, and how to break one (allowed with mischief off too). |

## Rules

- Never block clicks, hide content, take the cursor or change the page's own elements, except through the
  mischief calls above.
- Inline styles only, no `innerHTML`, no `<style>` tags: strict sites block them.
- Hundreds of tiny things (fish, krill) should be drawn as simple shapes in `under()` or as `S.poly`
  triangles, not as full meshes. Check the "ms/frame" figure at the bottom of the popup before and after.
