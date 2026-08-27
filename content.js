(() => {
  const stateKey = "__allowCopyPasteState__";

  if (globalThis[stateKey]) {
    return;
  }

  const selectionRule = `
    -webkit-user-select: text !important;
    user-select: text !important;
  `;

  const selectionStyle = document.createElement("style");
  selectionStyle.textContent = `
    html,
    body,
    body * {
      ${selectionRule}
    }
  `;

  const shadowSelectionStyles = new Map();
  const repairedSelectionStyles = new Map();

  const installSelectionStyle = () => {
    if (!selectionStyle.isConnected) {
      (document.head || document.documentElement)?.append(selectionStyle);
    }
  };

  const shadowObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        discoverShadowRoots(node);
      }
    }
  });

  const installShadowSelectionStyle = (shadowRoot) => {
    let style = shadowSelectionStyles.get(shadowRoot);

    if (!style) {
      style = document.createElement("style");
      style.textContent = `
        :host,
        * {
          ${selectionRule}
        }
      `;
      shadowSelectionStyles.set(shadowRoot, style);
      shadowObserver.observe(shadowRoot, { childList: true, subtree: true });
    }

    if (!style.isConnected) {
      shadowRoot.append(style);
    }
  };

  function discoverShadowRoots(root) {
    if (root instanceof Element && root.shadowRoot) {
      installShadowSelectionStyle(root.shadowRoot);
      discoverShadowRoots(root.shadowRoot);
    }

    if (
      !(root instanceof Document) &&
      !(root instanceof DocumentFragment) &&
      !(root instanceof Element)
    ) {
      return;
    }

    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) {
        installShadowSelectionStyle(element.shadowRoot);
        discoverShadowRoots(element.shadowRoot);
      }
    }
  }

  const selectionProperties = ["user-select", "-webkit-user-select"];

  const repairSelectionForElements = (elements) => {
    for (const element of elements) {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
        continue;
      }

      const root = element.getRootNode();
      if (root instanceof ShadowRoot) {
        installShadowSelectionStyle(root);
      }

      if (getComputedStyle(element).userSelect !== "none") {
        continue;
      }

      if (!repairedSelectionStyles.has(element)) {
        repairedSelectionStyles.set(
          element,
          selectionProperties.map((property) => ({
            property,
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property)
          }))
        );
      }

      for (const property of selectionProperties) {
        element.style.setProperty(property, "text", "important");
      }
    }
  };

  const interactionPath = (event) =>
    typeof event.composedPath === "function"
      ? event.composedPath()
      : [event.target];

  const repairSelectionAtPointer = (event) => {
    if (event.type === "pointermove" && event.buttons === 0) {
      return;
    }

    const elements = interactionPath(event);
    repairSelectionForElements(elements);

    // A page may apply user-select: none from its own pointer handler after
    // our capture listener runs. Check the same path again once dispatch ends.
    if (event.type === "pointerdown") {
      queueMicrotask(() => repairSelectionForElements(elements));
    }
  };

  const allowClipboardEvent = (event) => {
    if (event.type === "selectstart") {
      repairSelectionForElements(interactionPath(event));
    }

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

  installSelectionStyle();
  shadowObserver.observe(document, { childList: true, subtree: true });
  discoverShadowRoots(document);
  document.addEventListener("DOMContentLoaded", installSelectionStyle, {
    once: true
  });

  for (const eventName of ["copy", "cut", "paste", "selectstart"]) {
    window.addEventListener(eventName, allowClipboardEvent, true);
  }

  window.addEventListener("beforeinput", allowClipboardInput, true);
  window.addEventListener("keydown", allowClipboardShortcut, true);
  window.addEventListener("pointerdown", repairSelectionAtPointer, true);
  window.addEventListener("pointermove", repairSelectionAtPointer, true);

  globalThis[stateKey] = {
    disable() {
      for (const eventName of ["copy", "cut", "paste", "selectstart"]) {
        window.removeEventListener(eventName, allowClipboardEvent, true);
      }

      window.removeEventListener("beforeinput", allowClipboardInput, true);
      window.removeEventListener("keydown", allowClipboardShortcut, true);
      window.removeEventListener("pointerdown", repairSelectionAtPointer, true);
      window.removeEventListener("pointermove", repairSelectionAtPointer, true);
      document.removeEventListener("DOMContentLoaded", installSelectionStyle);
      shadowObserver.disconnect();
      selectionStyle.remove();

      for (const style of shadowSelectionStyles.values()) {
        style.remove();
      }
      shadowSelectionStyles.clear();

      for (const [element, properties] of repairedSelectionStyles) {
        for (const { property, value, priority } of properties) {
          if (value) {
            element.style.setProperty(property, value, priority);
          } else {
            element.style.removeProperty(property);
          }
        }
      }
      repairedSelectionStyles.clear();

      delete globalThis[stateKey];
    }
  };

  chrome.runtime.sendMessage({ type: "content-active" }).catch(() => {});
})();
