const toggle = document.querySelector("#toggle");
const hostnameLabel = document.querySelector("#hostname");
const statusLabel = document.querySelector("#status");

let currentTab;
let currentSite;
let enabled = false;

function scriptIdFor(hostname) {
  const safeHostname = hostname.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `allow-copy-paste-${safeHostname}`;
}

function siteFromUrl(rawUrl) {
  const url = new URL(rawUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("This extension only works on regular web pages.");
  }

  return {
    hostname: url.hostname,
    patterns: [
      `http://${url.hostname}/*`,
      `https://${url.hostname}/*`
    ],
    scriptId: scriptIdFor(url.hostname)
  };
}

function render() {
  toggle.setAttribute("aria-checked", String(enabled));
  toggle.querySelector(".sr-only").textContent = enabled
    ? "Disable on this site"
    : "Enable on this site";
  statusLabel.textContent = enabled
    ? "Enabled automatically whenever you visit this site."
    : "Off on this site.";
}

async function getEnabledSites() {
  const { enabledSites = {} } = await chrome.storage.local.get("enabledSites");
  return enabledSites;
}

async function setSiteStored(site, shouldEnable) {
  const enabledSites = await getEnabledSites();

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

async function enableSite() {
  const granted = await chrome.permissions.request({
    origins: currentSite.patterns
  });

  if (!granted) {
    throw new Error("Site access was not granted.");
  }

  await chrome.scripting.registerContentScripts([
    {
      id: currentSite.scriptId,
      matches: currentSite.patterns,
      js: ["content.js"],
      runAt: "document_start",
      allFrames: true,
      persistAcrossSessions: true
    }
  ]);

  await setSiteStored(currentSite, true);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id, allFrames: true },
      files: ["content.js"]
    });
  } catch {
    // Some pages contain frames from hosts we do not have permission to access.
    // The persistent registration is still valid and will handle future loads.
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ["content.js"]
    });
  }
}

async function disableSite() {
  await chrome.scripting.unregisterContentScripts({
    ids: [currentSite.scriptId]
  });

  await setSiteStored(currentSite, false);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id, allFrames: true },
      func: () => globalThis.__allowCopyPasteState__?.disable()
    });
  } catch {
    // The page may have navigated or may contain inaccessible child frames.
  }

  await chrome.permissions.remove({ origins: currentSite.patterns });
}

toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  statusLabel.textContent = enabled ? "Disabling…" : "Enabling…";

  try {
    if (enabled) {
      await disableSite();
    } else {
      await enableSite();
    }

    enabled = !enabled;
    render();
  } catch (error) {
    statusLabel.textContent = error.message || "Something went wrong.";
  } finally {
    toggle.disabled = false;
  }
});

async function initialize() {
  try {
    [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!currentTab?.id || !currentTab.url) {
      throw new Error("Unable to access this tab.");
    }

    currentSite = siteFromUrl(currentTab.url);
    hostnameLabel.textContent = currentSite.hostname;

    const enabledSites = await getEnabledSites();
    const registeredScripts = await chrome.scripting.getRegisteredContentScripts({
      ids: [currentSite.scriptId]
    });

    enabled = registeredScripts.length > 0;

    if (enabled && !enabledSites[currentSite.hostname]) {
      await setSiteStored(currentSite, true);
    } else if (!enabled && enabledSites[currentSite.hostname]) {
      await setSiteStored(currentSite, false);
    }
    toggle.disabled = false;
    render();
  } catch (error) {
    hostnameLabel.textContent = "Unavailable";
    statusLabel.textContent = error.message || "This page is not supported.";
  }
}

initialize();
