const OFF_ICONS = {
  16: "icons/off-16.png",
  32: "icons/off-32.png",
  48: "icons/off-48.png",
  128: "icons/off-128.png"
};

const ON_ICONS = {
  16: "icons/on-16.png",
  32: "icons/on-32.png",
  48: "icons/on-48.png",
  128: "icons/on-128.png"
};

let mutationQueue = Promise.resolve();

function enqueueMutation(task) {
  mutationQueue = mutationQueue.catch(() => {}).then(task);
  return mutationQueue;
}

function scriptIdFor(hostname) {
  const safeHostname = hostname.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `allow-copy-paste-${safeHostname}`;
}

function siteForHostname(hostname) {
  return {
    hostname,
    patterns: [`http://${hostname}/*`, `https://${hostname}/*`],
    scriptId: scriptIdFor(hostname)
  };
}

function hostnameFromPattern(pattern) {
  const match = pattern.match(/^https?:\/\/([^/]+)\/\*$/);
  return match?.[1] ?? null;
}

async function setTabIcon(tabId, enabled) {
  await chrome.action.setIcon({
    tabId,
    path: enabled ? ON_ICONS : OFF_ICONS
  });
}

async function setSiteStored(site, shouldEnable) {
  const { enabledSites = {} } = await chrome.storage.local.get("enabledSites");

  if (shouldEnable) {
    enabledSites[site.hostname] = {
      patterns: site.patterns,
      scriptId: site.scriptId
    };
  } else {
    delete enabledSites[site.hostname];
  }

  await chrome.storage.local.set({ enabledSites });
}

async function registerSite(site) {
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [site.scriptId]
  });

  const registration = {
    id: site.scriptId,
    matches: site.patterns,
    js: ["content.js"],
    runAt: "document_start",
    allFrames: true,
    persistAcrossSessions: true
  };

  if (existing.length > 0) {
    await chrome.scripting.updateContentScripts([registration]);
  } else {
    await chrome.scripting.registerContentScripts([registration]);
  }
}

async function injectIntoTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"]
    });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
    } catch {
      // The tab may have navigated or closed while permission was being granted.
    }
  }
}

async function disableInTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => globalThis.__allowCopyPasteState__?.disable()
    });
  } catch {
    // The tab may have navigated, closed, or contain inaccessible child frames.
  }
}

async function matchingTabs(patterns) {
  try {
    return await chrome.tabs.query({ url: patterns });
  } catch {
    return [];
  }
}

async function enableSite(site, preferredTabId) {
  await registerSite(site);
  await setSiteStored(site, true);

  const tabs = await matchingTabs(site.patterns);
  const tabIds = new Set(tabs.map((tab) => tab.id).filter(Number.isInteger));

  if (Number.isInteger(preferredTabId)) {
    tabIds.add(preferredTabId);
  }

  await Promise.all([...tabIds].map((tabId) => setTabIcon(tabId, true)));

  // Registration and stored state are complete at this point. Injection into
  // an already-open page is best-effort and must not hold the popup response
  // open, especially on pages with many or slow child frames.
  for (const tabId of tabIds) {
    void injectIntoTab(tabId);
  }
}

async function disableSite(site, preferredTabId) {
  const registrations = await chrome.scripting.getRegisteredContentScripts({
    ids: [site.scriptId]
  });

  if (registrations.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [site.scriptId] });
  }

  await setSiteStored(site, false);

  const tabs = await matchingTabs(site.patterns);
  const tabIds = new Set(tabs.map((tab) => tab.id).filter(Number.isInteger));

  if (Number.isInteger(preferredTabId)) {
    tabIds.add(preferredTabId);
  }

  await Promise.all([...tabIds].map(async (tabId) => {
    await disableInTab(tabId);
    await setTabIcon(tabId, false);
  }));

  await chrome.permissions.remove({ origins: site.patterns });
}

chrome.permissions.onAdded.addListener((permissions) => {
  const hostnames = new Set(
    (permissions.origins ?? []).map(hostnameFromPattern).filter(Boolean)
  );

  for (const hostname of hostnames) {
    enqueueMutation(() => enableSite(siteForHostname(hostname))).catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    setTabIcon(tabId, false).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.type === "content-active" &&
    sender.tab?.id !== undefined &&
    sender.frameId === 0
  ) {
    setTabIcon(sender.tab.id, true).catch(() => {});
    return false;
  }

  if (message?.type === "set-tab-icon") {
    setTabIcon(message.tabId, message.enabled)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "enable-site") {
    enqueueMutation(() => enableSite(message.site, message.tabId))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "disable-site") {
    enqueueMutation(() => disableSite(message.site, message.tabId))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
