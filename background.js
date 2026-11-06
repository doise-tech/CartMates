// The toolbar icon opens the same drawer you see on the page, so there is one Cartmates, not three.
// On pages the extension can't touch (new tab, chrome:// pages, the Web Store), it opens the full-page version instead.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab?.id) throw new Error('no tab');
    await chrome.tabs.sendMessage(tab.id, { type: 'cm-toggle' });
  } catch {
    await chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
  }
});
