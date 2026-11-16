# Web-Wide-Water

A living sea over whatever web page you are on. The page is the water: it ripples, and a whole ocean of
wildlife, ships and the odd monster crosses it while you browse. With mischief switched off the page is never
touched; with it on, anything the sea does to the page puts itself right within seconds.

It collects no data and makes no network requests. Its only permission is `storage`, to remember your settings.

## Turning it off

- The big switch in the toolbar panel turns it off everywhere.
- "On this site" turns it off for one website.
- **Press Esc three times quickly** on any page: everything stops and the page is exactly as it was.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Refresh any tab that was already open, then click the toolbar icon and switch the sea on.

It cannot run on `chrome://` pages, the new tab page or the Chrome Web Store.
After changing the code: click the reload icon on the extension's card, then refresh your tabs.

## What is in it

- Refracting water: a ripple when you click, a slosh when you scroll, a wake behind the cursor.
- **Orca pods** of all sizes that breach, spy-hop and greet each other.
- A **humpback whale** that blows, breaches onto its back and dives with its flukes up.
- **Ships** that sail across, and **sea battles** between pirates and the navy: broadsides, fires, sinkings.
- Rare monsters: a **megalodon** and a **kraken**. Both will go for any ship on the page.

### A living ecosystem

- **Small life is always about:** krill clouds, schools of sardines, herring or reef fish, jellyfish blooms, drifting ice.
- **Everything bigger comes for it:** dolphins ring a school into a bait ball and dash through it, gannets
  plunge-dive on it, sharks rush it, seals chase herring, turtles pick off jellyfish, manta rays loop
  through krill, humpbacks pen krill with a ring of bubbles and lunge through it, orcas hunt seals.
  Prey that is caught is simply gone in a splash, and numbers recover by themselves.
- **Four waters** with their own casts: Coral Shallows, The Open Blue, The Cold North, The Frozen South. The sea drifts
  between them every few minutes, or you pin one. Who lives where is yours to edit in the control centre.
- **Day and night** by your clock: at night the page dims a little, and moving water, krill and jellyfish glow.
- **Weather** passes through: rain, a rolling swell, fog, the odd storm.

### Events

- **A castaway on a raft** drifts onto the page. Any honest ship (a merchant, the navy, or your own) will
  pick him up; pirates sail past and sharks circle him.
- **Penguins on ice caps** in The Frozen South dive off, porpoise about after krill and shoot back onto the
  ice when a leopard seal or an orca turns up.
- **The Flying Dutchman**, the rarest of all: the sky turns to storm, the ghost ship rises out of the sea
  and a navy armada (with your own ships) fights her. If she loses she sinks back. If she wins, in mischief
  mode she fires at the screen and the glass cracks for about twelve seconds.
- **Collisions:** ships cannot sail through ice or each other. Ice holes a ship that hits it at speed.

### Mischief mode (on by default, one switch)

- Cannonballs that miss blow letters off the page; the megalodon eats words it swims under.
  Nothing is deleted: the text is hidden and grows back after about 20 seconds.
- The megalodon and the kraken can take your cursor. Pull against the shark, shake free of the kraken,
  or press **Esc** to get it back at once. While it is held you cannot click.
- The kraken leaves a blot of ink that clears in a few seconds.

With mischief off the ships and monsters still appear and fight each other, but never touch the cursor or the page.

### Your champion

Design a ship (or a fleet of up to three) or a pod of up to seven orcas, dolphins or turtles in your own
colours. It follows your cursor on every page, wild dolphins ride beside it, and in mischief mode pirates and
monsters may come for it. It is built in the control centre, with a live preview, and only changes when you
press Save.

### Controls

- The toolbar button opens a **quick panel**: on/off, this site, mischief, how busy, hour, weather, summon.
- **Open the control centre** for everything else: moods in one click, how often each creature appears and
  which waters it lives in, monster frequency, splash and wake strength, night darkness, how long regions
  and weather last, and your champion.

### Staying out of the way

- The sea stops completely when its tab is hidden or the window is covered, and (optionally) 20 seconds after
  you switch to another window.
- It watches its own frame time. If the page starts to slow, it redraws the water less often, then stops new
  arrivals, then asks animals to leave until things recover.

Ideas for later: ducks, flying fish, a captain's logbook of everything you have seen.

## For developers

No build step and no dependencies: this folder is the extension.

```
manifest.json
popup/                  the quick panel on the toolbar button
control/                the full control centre (options page), its theme, and the champion preview frame
src/core.js             settings, on/off, pausing, plug-in registries, panic key
src/water/engine.js     wave simulation
src/water/refract.js    bends the live page with the waves, plus highlights
src/sea/scene.js        small 3D renderer on one canvas, and particles
src/sea/models.js       kit for building low-poly models in code
src/sea/world.js        director (what turns up, and when), load governor, obstacles and collisions, cursor
src/sea/eco.js          regions, day and night, weather, the food web, cheap schools
src/sea/mischief.js     cursor capture and page damage, both refused when mischief is off
src/sea/mate.js         the user's own ships or animals
src/interact.js         click ripples, scroll slosh, cursor wake
src/creatures/          one file per creature (prey.js holds the small life)
src/boot.js             starts everything (always last)
demo/index.html         offline test page
docs/ADDING_A_CREATURE.md
```

To add a creature, read [docs/ADDING_A_CREATURE.md](docs/ADDING_A_CREATURE.md).

### Testing without the extension

Serve this folder and open the demo page, which loads the content scripts in manifest order:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/demo/index.html`. Add `?timer` to drive animation from a timer (useful when
the window is in the background), or `?off` to start with the sea off.
