# Changelog

## 0.2.1

Release tidy-up.

- MIT licence.
- `tools/package.js` builds the release zip (only the files the extension needs).
- Manifest names the project home page and the oldest Chrome it supports (102).
- Removed a leftover test hook from the champion preview and an unused import.

## 0.2.0

- **Champion moves smoothly.** It eases after the cursor, turns gradually, slows as it arrives and then
  settles (ships hold position, animals swim slow circles); its pod or fleet settles in formation with it.
- **Alt+Shift+C** switches the champion between following the cursor and roaming freely, on any page.
  The quick panel has the same switch.
- **Summoned events always play out.** The load governor no longer sends away what you summoned, or any
  big event or monster (this is what made the Flying Dutchman sail straight off). A megalodon or kraken
  with nothing to attack brings its own target ship; a passing merchant rescues a castaway nobody found.
- **Lighter on the page.** The water only bends the part of the page where it is moving; the bend pauses
  while you type; a Performance setting (Auto, Smoothest, Full detail).
- **Sturdier.** A creature that errors is removed without affecting the rest, and stood down for the page
  if it keeps failing.
- **Quick panel:** three summon menus (small life, wildlife and ships, monsters and events) that remember
  your last pick.

## 0.1.1

- `tools/check.js`, a one-command check for syntax errors and missing files.

## 0.1.0

First release: refracting water, a food web of 22 creatures and events across four regions, day and
night, weather, mischief mode, a customisable champion, the quick panel and the control centre.
