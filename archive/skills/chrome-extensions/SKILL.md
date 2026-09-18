---
name: chrome-extensions
description: >
  Build and publish Chrome Extensions using Manifest V3 best practices. Use this skill
  whenever the user asks to create, modify, debug, or understand Chrome browser extensions,
  add-ons, or anything involving the Chrome Extensions API. Trigger on mentions of: 'Chrome
  extension', 'browser extension', 'manifest.json', 'content script', 'service worker' (in
  browser context), 'popup' (in browser extension context), 'side panel', 'chrome.* API',
  'declarativeNetRequest', 'omnibox', 'context menu' (in extension context), or any request
  to build functionality that integrates with the Chrome browser UI. Also trigger for
  publishing to the Chrome Web Store: 'publish extension', preparing an extension for
  publishing, responding to a review rejection, writing permission justifications, or
  drafting a privacy policy.
---

# Chrome Extensions

Build production-quality Chrome extensions using Manifest V3 and publish them to the Chrome Web Store.

## Part 1 — Building Extensions

### Mandatory Rules

Each rule is a common cause of a broken build. The one-liner is the gotcha + fix; open the linked reference for the full code pattern **before** writing that feature.

1. **Icons — reference only files you create, or omit them.** Each size is a separate file at its exact pixel dimensions (`icon-16.png` = 16×16, etc.). If you can't generate real PNGs, remove `icons`/`default_icon` entirely — Chrome uses a default. Never reference non-existent files. → `references/extensions/icons.md`
2. **Side panel — you MUST provide a way to open it.** A `"side_panel"` declaration isn't openable on its own. Add `chrome.action.onClicked` → `chrome.sidePanel.open({ windowId })` (fires ONLY when there is no `default_popup`), a popup button calling `sidePanel.open()`, or `setPanelBehavior({ openPanelOnActionClick: true })`. The property is `openPanelOnActionClick`, **not** `openPanelOnActionIconClick` (the "Icon" variant throws a sync TypeError that silently aborts the SW). Don't combine `setPanelBehavior` with `default_popup`. → `references/extensions/side-panel.md`
3. **Code execution — sandboxed iframes only.** Extension CSP blocks `eval()`, `new Function()`, and inline `<script>` in all extension pages. Run untrusted/generated code via a manifest `sandbox` page + `postMessage`, a Blob URL (separate origin), or `srcdoc`. → `references/extensions/csp-sandbox.md`
4. **`tab.url`/`tab.title` need the `tabs` permission.** Without it they silently return `undefined` — no error. → `references/extensions/tab-management.md`
5. **Always async/await — never `.then()` chains.** For a `runtime.onMessage` listener doing async work, wrap the body in an async IIFE and `return true` to keep the response channel open.
6. **Content scripts — don't block the main thread.** Batch large DOM mutations with `requestAnimationFrame` and yield (`scheduler.yield`) between batches. → `references/extensions/content-scripts.md`
7. **Service workers are ephemeral — never store state in globals.** They terminate after ~30s idle; persist to `chrome.storage` and re-read on every event. Use `chrome.alarms`, not `setTimeout`/`setInterval`. → `references/extensions/service-worker.md`
8. **chrome.identity — extension ID differs between dev and production.** The OAuth `client_id` is tied to the extension ID, which changes from unpacked dev to the store. Stabilize the dev ID with a manifest `"key"` (pack once, extract the public key). Document: update the OAuth client with the store-assigned ID after publishing. → `references/extensions/auth-identity.md`
9. **Context menus — show feedback after an action.** Confirm saves/copies with a notification, badge flash, or injected toast. No silent actions. → `references/extensions/context-menus.md`
10. **Prompt API — available in SW, popup, and side panel.** `LanguageModel` works in all extension contexts with no extra permissions, and extensions also get `LanguageModel.params()` (unavailable on the web). General patterns: `modern-web-guidance` skill. → `references/extensions/prompt-api.md`
11. **`chrome.action.*` requires an `"action"` key in manifest.** `setBadgeText`/`setIcon`/`onClicked` need `"action"` present — at minimum `{ "action": {} }`. Without it, `chrome.action` is `undefined` (TypeError).
12. **`activeTab` only works on a direct user gesture — not from side panels.** It grants tab access only via: action-icon click, context-menu item, a `commands` keyboard shortcut, or an accepted omnibox suggestion. NOT from a side-panel/popup button or any programmatic trigger — use `tabs` + specific `host_permissions` there. → `references/extensions/side-panel.md`
13. **DevTools panel URLs are relative to the extension root**, not to the devtools page that calls `chrome.devtools.panels.create()` (e.g. `"devtools/panel/panel.html"`, not `"panel/panel.html"`). → `references/extensions/devtools.md`
14. **Offscreen documents have almost no `chrome.*` access.** Only `chrome.runtime` messaging, `chrome.runtime.getURL`, and standard Web APIs (DOM, fetch, MediaRecorder, Canvas, Web Audio). Do Web-API work (recording/parsing/audio) in the offscreen doc; do all `chrome.*` work (downloads, badges, notifications) in the service worker, bridged via `chrome.runtime.sendMessage`. → `references/extensions/message-passing.md`
15. **Image refs in chrome.* APIs must point to real files.** `notifications.create()` `iconUrl`, `action.setIcon`, context-menu icons — a missing file fails with "Unable to download all specified images." Alternative: generate a data URL at runtime via `OffscreenCanvas`. → `references/extensions/icons.md`
16. **Tab/desktop capture — guard against double-start.** `tabCapture.getMediaStreamId()` throws "Cannot capture a tab with an active stream" on rapid clicks. Use a state machine (`idle → starting → recording → stopping → idle`) stored in `chrome.storage.session`. Applies to any exclusive-resource API: `tabCapture`, `desktopCapture`, `offscreen.createDocument`. → `references/extensions/media-capture.md`
17. **`chrome.desktopCapture.chooseDesktopMedia()` needs a `targetTab` with URL access.** From a service worker you must pass the active tab, and the tab needs its `url` populated (requires `tabs`). Prefer `tabCapture.getMediaStreamId()` for tab-only recording. → `references/extensions/media-capture.md`
18. **`chrome.windows` has NO `.query()` method.** Use `getAll`, `getLastFocused`, `getCurrent`, or `get(windowId)` (also `create`/`update`/`remove`). → `references/extensions/tab-management.md`

### Always Manifest V3

Never generate Manifest V2 code.
- `background.service_worker` not `background.scripts`
- `chrome.action` not `chrome.browserAction`
- `chrome.scripting.executeScript` not `chrome.tabs.executeScript`
- `host_permissions` is separate from `permissions`
- No inline scripts in HTML — use `<script src="file.js">`
- No inline event handlers — use `addEventListener`

---

## Part 2 — Publishing to the Chrome Web Store

Manage `CHROMEWEBSTORE.md` — the single source of truth for all Chrome Web Store listing metadata, permissions justifications, privacy disclosures, version history, and publishing readiness.

### Core Workflow

Whenever you touch a Chrome extension project in a way that affects its store presence, update (or create) `CHROMEWEBSTORE.md` in the project root. It tracks everything the developer must fill into the Chrome Developer Dashboard, so they copy-paste from one doc instead of scrambling at publish time.

**Create it** the moment the user wants to publish, asks to "prepare for the store," is building an extension that will clearly ship, or asks about listing requirements. Use `references/webstore/chromewebstore-template.md` as the starting point — read it before generating the file.

**Update it** whenever: user-facing changes (bump "Last Updated," update feature list + Version History); `manifest.json` permission/host/content-script changes (update Permissions Justification — every permission needs a plain-English reason); a new release (Version History entry); privacy-relevant changes (update Privacy & Data Use + the policy); asset changes (note screenshots to refresh); or a CWS rejection (record the fix + Version History note).

**Fill it out** from actual project files: read `manifest.json` (name, version, description, permissions, host_permissions); scan for data collection (storage, fetch, analytics); check icon files and dimensions; look at the UI to describe features. Write store copy that is specific, honest, and benefit-oriented — the review team rejects vague descriptions. "Makes your life easier" fails; "Highlights search results on any webpage and lets you save highlights to a local list" passes.

### High-risk sections

- **Permissions Justification** is the biggest rejection risk: one specific plain-English reason per permission and per host_permission. "Needed for the extension to work" will be rejected. See `references/webstore/chromewebstore-template.md`.
- **Privacy policy:** `references/webstore/privacy-policy.md`.

### Pre-Publish Checklist

Run through `references/webstore/review-checklist.md`. Most common first-submission failures:
- Every permission and host_permission has a specific justification (not "needed to work").
- Privacy policy URL is live and matches the data-use disclosure form.
- At least 1 screenshot at 1280×800 or 640×400.
- ZIP excludes `.git/`, `node_modules/`, `.env`, `CHROMEWEBSTORE.md`.

### Store Listing Copy

See `references/webstore/store-listing.md`. Key rule: lead with function ("Highlights search terms on any webpage"), not feeling ("Enjoy searching again").

---

## Reference Files

Read the relevant file BEFORE writing code or content:

| Topic | Reference |
|-------|-----------|
| Side panels | `references/extensions/side-panel.md` |
| Content scripts & DOM | `references/extensions/content-scripts.md` |
| Popups | `references/extensions/popup-ui.md` |
| Service worker lifetime | `references/extensions/service-worker.md` |
| Code execution & CSP | `references/extensions/csp-sandbox.md` |
| API calls | `references/extensions/api-calling.md` |
| Declarative Net Request | `references/extensions/declarative-net-request.md` |
| Chrome Prompt API | `references/extensions/prompt-api.md` |
| DevTools panels | `references/extensions/devtools.md` |
| Authentication | `references/extensions/auth-identity.md` |
| Context menus | `references/extensions/context-menus.md` |
| Omnibox | `references/extensions/omnibox.md` |
| Storage | `references/extensions/storage.md` |
| Tab & window management | `references/extensions/tab-management.md` |
| Tab/desktop capture | `references/extensions/media-capture.md` |
| Message passing | `references/extensions/message-passing.md` |
| Icons | `references/extensions/icons.md` |
| CHROMEWEBSTORE.md template | `references/webstore/chromewebstore-template.md` |
| Privacy policy guidance | `references/webstore/privacy-policy.md` |
| Pre-publish review checklist | `references/webstore/review-checklist.md` |
| Store listing tips & rejections | `references/webstore/store-listing.md` |

## Output Checklist

Verify EVERY item before delivering:

- [ ] `manifest_version: 3` — no V2 APIs anywhere
- [ ] All icon files referenced in manifest exist as real files with correct dimensions — or icons are omitted
- [ ] Side panel has an explicit open trigger (not just a manifest declaration)
- [ ] Code execution uses sandbox/blob/srcdoc — no `eval()` in extension pages
- [ ] `tabs` permission declared if `tab.url` or `tab.title` is accessed
- [ ] All code uses `async`/`await` — no `.then()` chains
- [ ] Content scripts batch DOM updates with `requestAnimationFrame`
- [ ] Service worker stores NO state in global variables — uses `chrome.storage`
- [ ] No inline scripts or event handlers in HTML
- [ ] Context menu actions show user confirmation
- [ ] `"action": {}` (or more) present in manifest if using `chrome.action.*` APIs
- [ ] If reading/scripting tabs from a side panel: use `tabs` + `host_permissions` (NOT `activeTab`)
- [ ] DevTools panel paths in `chrome.devtools.panels.create()` are relative to extension root
- [ ] Offscreen documents use ONLY `chrome.runtime` messaging — no `chrome.downloads`, `chrome.action`, etc.
- [ ] All image refs in `chrome.notifications`, `chrome.action.setIcon`, etc. point to real files (or use data URLs)
- [ ] Tab/desktop capture uses state locking to prevent double-start errors
- [ ] `chrome.desktopCapture.chooseDesktopMedia` passes `targetTab` with `tabs` permission
- [ ] `chrome.windows` calls use `getAll`/`getLastFocused`/`getCurrent` — NOT `.query()` (it doesn't exist)
- [ ] `sidePanel.setPanelBehavior` uses `openPanelOnActionClick` — NOT `openPanelOnActionIconClick`
- [ ] Error handling on all async operations
- [ ] `host_permissions` scoped to specific domains (not `<all_urls>` unless needed)
- [ ] `return true` in `onMessage` listeners with async responses
