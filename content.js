(() => {
  const stateKey = "__allowCopyPasteState__";

  if (globalThis[stateKey]) {
    return;
  }

  const allowClipboardEvent = (event) => {
    event.stopImmediatePropagation();
  };

  const clipboardInputTypes = new Set([
    "deleteByCut",
    "insertFromPaste",
    "insertFromPasteAsQuotation"
  ]);

  const allowClipboardInput = (event) => {
    if (clipboardInputTypes.has(event.inputType)) {
      event.stopImmediatePropagation();
    }
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

  const selectionStyle = document.createElement("style");
  selectionStyle.textContent = `
    html,
    body,
    body * {
      -webkit-user-select: text !important;
      user-select: text !important;
    }
  `;

  const installSelectionStyle = () => {
    if (!selectionStyle.isConnected) {
      (document.head || document.documentElement)?.append(selectionStyle);
    }
  };

  installSelectionStyle();
  document.addEventListener("DOMContentLoaded", installSelectionStyle, {
    once: true
  });

  for (const eventName of ["copy", "cut", "paste", "selectstart"]) {
    window.addEventListener(eventName, allowClipboardEvent, true);
  }

  window.addEventListener("beforeinput", allowClipboardInput, true);
  window.addEventListener("keydown", allowClipboardShortcut, true);

  globalThis[stateKey] = {
    disable() {
      for (const eventName of ["copy", "cut", "paste", "selectstart"]) {
        window.removeEventListener(eventName, allowClipboardEvent, true);
      }

      window.removeEventListener("beforeinput", allowClipboardInput, true);
      window.removeEventListener("keydown", allowClipboardShortcut, true);
      document.removeEventListener("DOMContentLoaded", installSelectionStyle);
      selectionStyle.remove();

      delete globalThis[stateKey];
    }
  };

  chrome.runtime.sendMessage({ type: "content-active" }).catch(() => {});
})();
