# Allow Copy & Paste

A minimal Manifest V3 Chrome extension that restores normal copy, cut, and paste behavior on sites you choose.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this directory.

## Use

Open a regular HTTP or HTTPS page and click the extension icon. Turn the switch on to remember that hostname. The extension will run automatically at `document_start` on future visits.

Turn the switch off to unregister the content script, remove the saved hostname, revoke its host permission, and disable the behavior in the current page.

Chrome does not allow extensions to run on protected pages such as `chrome://` URLs or the Chrome Web Store.
