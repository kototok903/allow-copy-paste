(() => {
  const stateKey = "__allowCopyPasteState__";

  if (globalThis[stateKey]) {
    return;
  }

  const allowClipboardEvent = (event) => {
    event.stopImmediatePropagation();
  };

  const allowClipboardShortcut = (event) => {
    const hasClipboardModifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (
      hasClipboardModifier &&
      !event.altKey &&
      ["c", "x", "v"].includes(key)
    ) {
      event.stopImmediatePropagation();
    }
  };

  for (const eventName of ["copy", "cut", "paste"]) {
    window.addEventListener(eventName, allowClipboardEvent, true);
  }

  window.addEventListener("keydown", allowClipboardShortcut, true);

  globalThis[stateKey] = {
    disable() {
      for (const eventName of ["copy", "cut", "paste"]) {
        window.removeEventListener(eventName, allowClipboardEvent, true);
      }

      window.removeEventListener("keydown", allowClipboardShortcut, true);

      delete globalThis[stateKey];
    }
  };

  chrome.runtime.sendMessage({ type: "content-active" }).catch(() => {});
})();
