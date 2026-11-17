// Background service worker: only the keyboard shortcut lives here, because a
// browser-wide shortcut can only be heard by the extension itself, not by a page.
//
//   Alt+Shift+C (changeable at chrome://extensions/shortcuts)
//     switches your champion between following your cursor and roaming freely.
//     It writes the setting to storage like any other control; every tab reacts.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-follow') return;
  try {
    const got = await chrome.storage.local.get('sea');
    const s = got.sea || {};
    const mate = { ...(s.mate || {}) };
    if (!mate.kind || mate.kind === 'none') return;          // no champion to command
    mate.follow = mate.follow === 'roam' ? 'cursor' : 'roam';
    await chrome.storage.local.set({ sea: { ...s, mate } });
  } catch (e) {
    console.warn('[Web-Wide-Water] could not switch follow', e);
  }
});
