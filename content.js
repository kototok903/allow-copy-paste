(() => {
  const stateKey = "__allowCopyPasteState__";

  if (globalThis[stateKey]) {
    return;
  }

  const allowClipboardEvent = (event) => {
    event.stopImmediatePropagation();
  };

  for (const eventName of ["copy", "cut", "paste"]) {
    window.addEventListener(eventName, allowClipboardEvent, true);
  }

  globalThis[stateKey] = {
    disable() {
      for (const eventName of ["copy", "cut", "paste"]) {
        window.removeEventListener(eventName, allowClipboardEvent, true);
      }

      delete globalThis[stateKey];
    }
  };
})();
