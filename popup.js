const toggle = document.querySelector("#toggle");
const hostnameLabel = document.querySelector("#hostname");

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
}

async function enableSite() {
  const granted = await chrome.permissions.request({
    origins: currentSite.patterns
  });

  if (!granted) {
    throw new Error("Site access was not granted.");
  }

  const response = await chrome.runtime.sendMessage({
    type: "enable-site",
    site: currentSite,
    tabId: currentTab.id
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unable to enable this site.");
  }
}

async function disableSite() {
  const response = await chrome.runtime.sendMessage({
    type: "disable-site",
    site: currentSite,
    tabId: currentTab.id
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unable to disable this site.");
  }
}

toggle.addEventListener("click", async () => {
  const wasEnabled = enabled;

  enabled = !enabled;
  render();
  toggle.disabled = true;

  try {
    if (wasEnabled) {
      await disableSite();
    } else {
      await enableSite();
    }
  } catch (error) {
    enabled = wasEnabled;
    render();
    console.error(error);
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

    const registeredScripts = await chrome.scripting.getRegisteredContentScripts({
      ids: [currentSite.scriptId]
    });

    enabled = registeredScripts.length > 0;

    await chrome.runtime.sendMessage({
      type: "set-tab-icon",
      tabId: currentTab.id,
      enabled
    });

    toggle.disabled = false;
    render();

    // Commit the loaded position while transitions are still disabled. Without
    // this layout read, Chrome may batch the state and `ready` changes together
    // and animate the switch every time the popup opens.
    void toggle.offsetWidth;

    requestAnimationFrame(() => {
      toggle.classList.add("ready");
    });
  } catch {
    hostnameLabel.textContent = "Unavailable";
  }
}

initialize();
