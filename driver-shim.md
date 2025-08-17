Got you, Mr. Sohn. Below is a clean, MV3-friendly shim that reproduces your `ChromeDriver` surface using Chrome Extension APIs—primarily `chrome.debugger` for CDP, plus `tabs`, `webNavigation`, `scripting`, and `downloads` where appropriate.

I’ll give you:

1. a quick mapping from your methods → MV3 APIs
2. a minimal `manifest.json` skeleton
3. a production-ready TypeScript driver (`ChromeExtensionDriver`) that mirrors your interface and behaviors
4. domain wrappers pattern (e.g. `DOM`, `Runtime`) hooked to the same driver
5. notes on limits & gotchas (downloads path, auto-attach, service worker lifecycle)

---

# 1) Method-to-API mapping

| Your call                                                              | Extension/API you’ll use                                         | Notes                                                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sendAndGetDevToolsCommand(method, params)`                            | `chrome.debugger.sendCommand(target, method, params)`            | Returns the CDP result. You’ll centralize enable/disable for domains here.                                                                           |
| `sendDevToolsCommand(method, params)`                                  | `chrome.debugger.sendCommand(...)`                               | Fire-and-forget wrapper.                                                                                                                             |
| `createCDPConnection('page')`                                          | `chrome.debugger.attach` + `Target.setAutoAttach`                | Attach to tab target; auto-attach to iframes/workers and plumb `chrome.debugger.onEvent`.                                                            |
| `get(url)`                                                             | `Page.navigate` (CDP) **or** `chrome.tabs.update({url})`         | I recommend CDP `Page.navigate` + waits tied to `Page.lifecycleEvent`/`loadEventFired`.                                                              |
| `getCurrentUrl()`                                                      | `chrome.tabs.get(tabId)` **or** `Page.getNavigationHistory`      | Tabs is simpler; CDP history is useful for robust back/forward.                                                                                      |
| `navigate().back()`                                                    | `Page.getNavigationHistory` → `Page.navigateToHistoryEntry`      | Works even if `tabs.goBack` isn’t available/consistent.                                                                                              |
| `navigate().forward()`                                                 | same as above                                                    |                                                                                                                                                      |
| `navigate().refresh()`                                                 | `Page.reload`                                                    |                                                                                                                                                      |
| `wait(fn, timeout)`                                                    | Poll via `Runtime.evaluate` or await a CDP event                 | Provide both: polling + event waiter helpers.                                                                                                        |
| `executeScript(...)`                                                   | `Runtime.evaluate` (CDP) **or** `chrome.scripting.executeScript` | Use CDP for MAIN world; `scripting` for library injection if needed.                                                                                 |
| `setNetworkConditions()`                                               | `Network.emulateNetworkConditions` (CDP)                         | Needs `Network.enable` first.                                                                                                                        |
| `setDownloadPath()`                                                    | **No direct API to change base folder**                          | Use `chrome.downloads.onDeterminingFilename` to choose subpaths under default. Or CDP `Browser.setDownloadBehavior` is locked down—don’t rely on it. |
| DOM / CSS / A11y / Console / Overlay / Input / Runtime / Page / Target | `chrome.debugger.sendCommand` with those CDP domain methods      | One thin wrapper per domain that delegates to the driver.                                                                                            |
| Network interception                                                   | `Network.*` and/or `Fetch.*` (CDP)                               | For request interception/modification use `Fetch.enable`. For observation only, `Network.enable` is enough.                                          |

---

# 2) Minimal MV3 `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Chromedriver Shim (MV3)",
  "version": "0.1.0",
  "permissions": [
    "debugger",
    "tabs",
    "scripting",
    "webNavigation",
    "downloads",
    "storage"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_title": "Shim" }
}
```

> Heads-up: with `debugger` attached, the built-in DevTools cannot attach to the same target.

---

# 3) TypeScript driver shim (drop-in for your `ChromeDriver`)

This mirrors your interface and keeps method names/semantics aligned.

```ts
// chrome-extension-driver.ts
// MV3 service worker context (or a shared module imported by the SW)

type DevToolsTarget = chrome.debugger.Debuggee;

export interface ChromeExtensionDriver {
  sendAndGetDevToolsCommand<T = any>(method: string, params?: any): Promise<T>;
  sendDevToolsCommand(method: string, params?: any): Promise<void>;
  setNetworkConditions(conds: {
    offline?: boolean;
    latency?: number;            // ms
    downloadThroughput?: number; // bytes/s
    uploadThroughput?: number;   // bytes/s
    connectionType?: string;
  }): Promise<void>;
  setDownloadPath(_unused?: any): Promise<void>; // see notes
  get(url: string): Promise<void>;
  getCurrentUrl(): Promise<string>;
  navigate(): {
    back(): Promise<void>;
    forward(): Promise<void>;
    refresh(): Promise<void>;
  };
  wait<T>(cond: () => Promise<T | boolean>, timeoutMs?: number, pollMs?: number): Promise<T | boolean>;
  executeScript<R = any>(expression: string, opts?: { awaitPromise?: boolean; returnByValue?: boolean }): Promise<R>;
  createCDPConnection(kind?: 'page'): Promise<void>;
  detach(): Promise<void>;
}

export class ChromeDriverShim implements ChromeExtensionDriver {
  private readonly tabId: number;
  private readonly target: DevToolsTarget;
  private attached = false;
  private listenersBound = false;

  constructor(tabId: number) {
    this.tabId = tabId;
    this.target = { tabId };
  }

  // ----- attach / connection -----

  async createCDPConnection(_kind: 'page' = 'page'): Promise<void> {
    if (this.attached) return;
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(this.target, '1.3', () => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        this.attached = true;
        resolve();
      });
    });

    // Useful defaults: auto-attach to child targets (iframes/workers)
    await this.sendAndGetDevToolsCommand('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    });

    // Enable commonly used domains upfront (match your inventory)
    await Promise.all([
      'Page', 'Runtime', 'DOM', 'CSS', 'Console', 'Network', 'Overlay', 'Accessibility'
    ].map(domain => this.sendDevToolsCommand(`${domain}.enable`, {})));

    // Optionally listen for events
    if (!this.listenersBound) {
      chrome.debugger.onEvent.addListener(this.onEvent);
      chrome.debugger.onDetach.addListener(this.onDetach);
      this.listenersBound = true;
    }
  }

  private onEvent = (source: DevToolsTarget, method: string, params?: any) => {
    if (!this.isOurTarget(source)) return;
    // Example: forward or route to domain handlers
    // console.debug('[CDP]', method, params);
  };

  private onDetach = (source: DevToolsTarget, reason?: string) => {
    if (!this.isOurTarget(source)) return;
    this.attached = false;
    // console.warn('Debugger detached:', reason);
  };

  private isOurTarget(source: DevToolsTarget): boolean {
    return !!source.tabId && source.tabId === this.tabId;
  }

  async detach(): Promise<void> {
    if (!this.attached) return;
    await new Promise<void>((resolve) => {
      chrome.debugger.detach(this.target, () => resolve());
    });
    this.attached = false;
  }

  // ----- core CDP -----

  async sendAndGetDevToolsCommand<T = any>(method: string, params?: any): Promise<T> {
    if (!this.attached) await this.createCDPConnection('page');
    return await new Promise<T>((resolve, reject) => {
      chrome.debugger.sendCommand(this.target, method as any, params, (result: any) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(`${method}: ${err.message}`));
        resolve(result as T);
      });
    });
  }

  async sendDevToolsCommand(method: string, params?: any): Promise<void> {
    await this.sendAndGetDevToolsCommand(method, params);
  }

  // ----- navigation -----

  async get(url: string): Promise<void> {
    await this.sendAndGetDevToolsCommand('Page.navigate', { url });
    await this.waitForLoad(); // DOMContentLoaded or load; see below
  }

  async getCurrentUrl(): Promise<string> {
    // Simple: tabs API
    const tab = await chrome.tabs.get(this.tabId);
    return tab.url || '';
  }

  navigate() {
    return {
      back: async () => {
        const hist = await this.sendAndGetDevToolsCommand<{
          currentIndex: number; entries: Array<{ id: number; url: string }>
        }>('Page.getNavigationHistory');
        const idx = hist.currentIndex - 1;
        if (idx >= 0) {
          await this.sendDevToolsCommand('Page.navigateToHistoryEntry', { entryId: hist.entries[idx].id });
          await this.waitForLoad();
        }
      },
      forward: async () => {
        const hist = await this.sendAndGetDevToolsCommand<{
          currentIndex: number; entries: Array<{ id: number; url: string }>
        }>('Page.getNavigationHistory');
        const idx = hist.currentIndex + 1;
        if (idx < hist.entries.length) {
          await this.sendDevToolsCommand('Page.navigateToHistoryEntry', { entryId: hist.entries[idx].id });
          await this.waitForLoad();
        }
      },
      refresh: async () => {
        await this.sendDevToolsCommand('Page.reload', { ignoreCache: false });
        await this.waitForLoad();
      }
    };
  }

  private async waitForLoad(opts: { waitFor?: 'DOMContentLoaded' | 'load' } = { waitFor: 'load' }) {
    // Use Runtime.evaluate polling to keep it deterministic in SW context
    const want = opts.waitFor === 'DOMContentLoaded' ? ['interactive', 'complete'] : ['complete'];
    await this.wait(async () => {
      const res = await this.sendAndGetDevToolsCommand<{
        result: { value: string }
      }>('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true
      });
      return want.includes(res.result.value);
    }, 30_000, 150);
  }

  // ----- waits / execution -----

  async wait<T>(cond: () => Promise<T | boolean>, timeoutMs = 10_000, pollMs = 100): Promise<T | boolean> {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const out = await cond();
      if (out) return out;
      if (Date.now() - start > timeoutMs) throw new Error('wait: timeout');
      await new Promise(r => setTimeout(r, pollMs));
    }
  }

  async executeScript<R = any>(
    expression: string,
    opts: { awaitPromise?: boolean; returnByValue?: boolean } = { awaitPromise: false, returnByValue: true }
  ): Promise<R> {
    const { result, exceptionDetails } = await this.sendAndGetDevToolsCommand<any>('Runtime.evaluate', {
      expression,
      awaitPromise: opts.awaitPromise ?? false,
      returnByValue: opts.returnByValue ?? true
    });
    if (exceptionDetails) throw new Error(`executeScript error: ${exceptionDetails.text || 'unknown'}`);
    return (opts.returnByValue ? result?.value : result) as R;
  }

  // ----- network / downloads -----

  async setNetworkConditions(conds: {
    offline?: boolean;
    latency?: number;
    downloadThroughput?: number;
    uploadThroughput?: number;
    connectionType?: string;
  }): Promise<void> {
    await this.sendDevToolsCommand('Network.enable', {});
    await this.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline: !!conds.offline,
      latency: conds.latency ?? 0,
      downloadThroughput: conds.downloadThroughput ?? -1,
      uploadThroughput: conds.uploadThroughput ?? -1,
      connectionType: conds.connectionType ?? 'none'
    });
  }

  // You cannot change the root download directory in an extension.
  // Implement filename routing under the default dir via chrome.downloads.*
  async setDownloadPath(_unused?: any): Promise<void> {
    // No-op by design; see notes section for recommended pattern with onDeterminingFilename.
  }
}
```

---

# 4) Domain wrappers (pattern)

Keep your domain classes thin; they just delegate to `driver.sendAndGetDevToolsCommand`. Example for DOM/Runtime:

```ts
// domains/DOM.ts
export class DOMDomain {
  constructor(private driver: ChromeExtensionDriver) {}
  describeNode(params: any) {
    return this.driver.sendAndGetDevToolsCommand('DOM.describeNode', params);
  }
  resolveNode(params: any) {
    return this.driver.sendAndGetDevToolsCommand('DOM.resolveNode', params);
  }
  focus(params: any) {
    return this.driver.sendDevToolsCommand('DOM.focus', params);
  }
  getOuterHTML(params: any) {
    return this.driver.sendAndGetDevToolsCommand('DOM.getOuterHTML', params);
  }
  getDocument(params = { depth: -1, pierce: true }) {
    return this.driver.sendAndGetDevToolsCommand('DOM.getDocument', params);
  }
  querySelector(params: any) {
    return this.driver.sendAndGetDevToolsCommand('DOM.querySelector', params);
  }
  querySelectorAll(params: any) {
    return this.driver.sendAndGetDevToolsCommand('DOM.querySelectorAll', params);
  }
  getBoxModel(params: any) {
    return this.driver.sendAndGetDevToolsCommand('DOM.getBoxModel', params);
  }
}

// domains/Runtime.ts
export class RuntimeDomain {
  constructor(private driver: ChromeExtensionDriver) {}
  callFunctionOn(params: any) {
    return this.driver.sendAndGetDevToolsCommand('Runtime.callFunctionOn', params);
  }
  evaluate(params: any) {
    return this.driver.sendAndGetDevToolsCommand('Runtime.evaluate', params);
  }
}
```

Do the same for `Accessibility`, `CSS`, `Console`, `DOMDebugger`, `DOMSnapshot`, `Input`, `Overlay`, `Page`, `Target`. This keeps your existing call sites almost unchanged.

---

# 5) Downloads path reality & recommended pattern

* Chrome extensions cannot set an arbitrary **root** download path.
* You **can** choose a subfolder and file name under the user’s default downloads directory:

```ts
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  // Route PDFs under a subdir, for example:
  const subpath = item.mime === 'application/pdf' ? 'my-automation/pdfs/' : 'my-automation/';
  suggest({ filename: `${subpath}${item.filename}`, conflictAction: 'overwrite' });
});
```

If you absolutely need an external folder, you’d have to hand the bytes to your own native layer (Native Messaging host) or ask the user to change Chrome’s default directory.

---

# 6) Service-worker lifecycle & stability

* The background SW can be suspended. Keep **all tab/session state in memory** of the SW and rehydrate on `chrome.runtime.onStartup` or when your UI pings it.
* CDP attachments die when the SW unloads. If you need long-running sessions, keep the SW alive while debugging (e.g., with a minimal offscreen document or a UI page); and handle `chrome.debugger.onDetach` to re-attach on demand.

---

# 7) Auto-attach to frames/workers

You already enable:

```ts
await driver.sendDevToolsCommand('Target.setAutoAttach', {
  autoAttach: true,
  flatten: true,
  waitForDebuggerOnStart: false
});
```

Then route `chrome.debugger.onEvent` for:

* `Target.attachedToTarget` → optionally `Runtime.enable`/`Page.enable` in that session (flattened means same session).
* `Page.lifecycleEvent` → navigation readiness
* `Network.*` / `Fetch.*` → request tracking/interception
* `Runtime.consoleAPICalled` → console mirroring

---

# 8) Optional: using `tabs`/`scripting` when it’s simpler

* Library injection: `chrome.scripting.executeScript({ target: { tabId }, files: ['lib.js'], world: 'MAIN' })` if you truly need in-page helpers. Otherwise prefer `Runtime.evaluate` to avoid world boundaries.
* For basic URL and title: `chrome.tabs.get(tabId)` is cheaper than CDP.

---

# 9) Putting it together (usage sketch)

```ts
const tab = await chrome.tabs.create({ url: 'about:blank' });
const driver = new ChromeDriverShim(tab.id!);

await driver.createCDPConnection('page');
await driver.get('https://example.com');
const url = await driver.getCurrentUrl();

await driver.sendDevToolsCommand('Overlay.highlightNode', {
  highlightConfig: { showInfo: true, borderColor: { r: 255, g: 0, b: 0, a: 0.66 } },
  nodeId: (await driver.sendAndGetDevToolsCommand('DOM.getDocument', { depth: 0 })).root.nodeId
});

await driver.executeScript('document.body.setAttribute("data-foo", "bar")');
await driver.navigate().refresh();
await driver.detach();
```

---

## Key differences vs Selenium/ChromeDriver

* No WebSocket: extensions talk CDP via `chrome.debugger.sendCommand`, not `ws://`.
* Only one debugger per target: your extension and Chrome DevTools cannot debug the same tab concurrently.
* Download path control is constrained.
* MV3 lifecycle: handle SW suspend/detach robustly.

---

If you want, I can tailor this driver to your exact file layout (`MCP.ts`, `CDP.ts`, `DOM.ts`, etc.) so the imports and types drop in with zero churn.

Using Chrome Extension Debugger as a WebDriver Shim
Overview
To replace the Selenium-based driver with Chrome’s extension debugger (DevTools Protocol) as a drop-in shim, we can create a controller class that mimics a browser driver. This controller will manage multiple tab sessions, use the chrome.debugger API for DevTools commands, and ensure content scripts (and pages) are ready before executing commands. Chrome’s debugger API is essentially an alternate transport for the DevTools Protocol, allowing an extension to attach to one or more tabs and send CDP commands to control them
developer.chrome.com
. All the necessary CDP domains (Page, DOM, CSS, Network, Runtime, etc.) are available to extensions
developer.chrome.com
developer.chrome.com
, making it possible to emulate nearly all the Selenium driver’s capabilities inside the extension environment.
Controller Design: Managing Pages/Tabs Lifecycle
We introduce a Browser Controller class (or an “ExtensionDriver”) with an internal _tabs (or _pages) property to track attached tabs. Each entry in _tabs represents a browser tab session that the extension controls. The controller will provide methods to:
Attach to an existing tab – e.g. attachToTab(tabId) attaches the debugger to a given tabId and registers it in _tabs. This uses chrome.debugger.attach({tabId}, protocolVersion) to initiate a DevTools session for that tab. We can attach to multiple tabs simultaneously; the debugger API routes events with a tabId so we know which tab they belong to
developer.chrome.com
. (In modern Chrome, multiple attachments are supported, though older versions had a bug that detached all sessions when one detached
stackoverflow.com
.)
Open a new tab – e.g. newTab(url) creates a blank tab or navigates to url, attaches to it, and stores it in _tabs. This can wrap chrome.tabs.create followed by chrome.debugger.attach. We may also expose a simpler navigate(tabId, url) method or mimic Selenium’s driver.get(url) by sending a CDP Page.navigate command to the attached tab’s session (or using chrome.tabs.update for navigation).
Manage tab sessions – The controller should handle proper cleanup. For example, implement detachTab(tabId) or a destructor that calls chrome.debugger.detach when a tab is closed or no longer needed. We can listen to chrome.debugger.onDetach and Chrome’s tab events (chrome.tabs.onRemoved) to auto-remove entries from _tabs when a tab or debugging session ends. This prevents stale sessions and aligns with lifecycle management expectations.
Data structure: _tabs could be a map or dictionary of { tabId: SessionInfo }. The SessionInfo might include the tab’s Debuggee identifier and possibly a sessionId if using flattened sessions for iframes (Chrome 125+ supports child targets via a sessionId
developer.chrome.com
). In simpler terms, for each attached tab, we store its tabId and any state needed (like whether a content script is injected, etc.). This allows the controller to iterate or reference multiple pages, similar to Puppeteer’s browser.pages() concept. Domain interface: Each attached tab can get its own set of CDP domain handlers (similar to the cdp object in your code). For example, when we attach, we can instantiate a CDP helper for that tab: const cdp = new CDP(extensionDriver); and call await cdp.init(); (enabling domains for that session). Internally, our extension-backed extensionDriver.sendAndGetDevToolsCommand(...) will use chrome.debugger.sendCommand. We should pass the Debuggee {tabId} and the method name/params to sendCommand, and return the result (possibly wrapped in a Promise for async/await usage). This way, classes like Page, DOM, Runtime can call driver.sendAndGetDevToolsCommand("Page.someMethod", {...}) and it will be routed to the correct tab’s session. Example: Basic controller structure (pseudo-TypeScript for clarity):
class BrowserController {
  private _tabs: Map<number, TabSession> = new Map();

  async attachToTab(tabId: number) {
    // Attach debugger to tab
    await chrome.debugger.attach({ tabId }, "1.3");
    // Initialize session info and CDP domains
    const session: TabSession = new TabSession(tabId);
    await session.initCDP();  // enable domains, etc.
    this._tabs.set(tabId, session);
  }

  async newTab(url: string) {
    const tab = await chrome.tabs.create({ url, active: false });
    await this.attachToTab(tab.id!);
    return tab.id;
  }

  async detachTab(tabId: number) {
    if (this._tabs.has(tabId)) {
      await chrome.debugger.detach({ tabId });
      this._tabs.delete(tabId);
    }
  }

  // ... perhaps methods like getSession(tabId) to retrieve the TabSession/CDP
}
Here TabSession would encapsulate the DevTools connection for one tab, including domain handlers (console, dom, etc.) similar to your CDP class instance. With this design, developers can manage multiple pages: for example, open several tabs and keep their sessions in _tabs. The controller ensures each is attached and can be controlled independently. Chrome’s API supports targeting commands by tab ID, and events from chrome.debugger.onEvent include the source.tabId so we can direct events to the correct session object. Routing events: We can register a single chrome.debugger.onEvent.addListener in the controller. This listener will receive all CDP events from any attached target. We then route them by source.tabId. For instance, if an event Console.messageAdded comes in for tab X, we call the corresponding TabSession or domain handler for tab X to process it (e.g. store console message). The Chrome team notes that a single onEvent listener will receive events for all attached targets (distinguished by the Debuggee)
groups.google.com
, so our routing by tabId is essential for managing multiple sessions concurrently.
Polling for Content Script (Page Readiness)
Before executing actions on a newly navigated page, we need to ensure the page (and any content script helpers) are fully loaded and ready. In practice, this means waiting until our content script is injected and responsive with a timeout to avoid hanging. There are known race conditions where sending DevTools commands too early (e.g. immediately after attaching or navigating) can fail because the target page isn’t ready to receive them
stackoverflow.com
. We can address this by actively polling until the content script acknowledges readiness or a maximum timeout elapses. Content script role: Suppose we have a content script that assists with certain tasks (for example, it might expose helpful functions or just serve as a heartbeat to confirm the page DOM is loaded). When this script loads, it could set a flag or listen for a ping. For example, in the content script:
// contentScript.js
window._extReady = true;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === "ping") sendResponse({ status: "ok" });
});
Here _extReady is a flag in the page context (if the script runs in an isolated world, we might instead rely on messaging alone). The extension controller can detect this by either evaluating window._extReady via the debugger or by sending a test message. Polling via messaging: A straightforward way to check if the content script is alive is using extension messaging. If we do chrome.tabs.sendMessage(tabId, "ping", ...) and get no response or an error (runtime.lastError saying no receiver), that means the content script isn’t loaded yet. We can retry until we get a response or hit a timeout. This pattern is recommended by developers – essentially keep trying until the receiving end exists
stackoverflow.com
. For example:
async function waitForContentScript(tabId: number, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let gotResponse = false;
    try {
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, "ping", (response) => {
          if (chrome.runtime.lastError || !response) {
            reject();  // No listener yet
          } else {
            resolve(null);
          }
        });
      });
      gotResponse = true;
    } catch { /* no receiver, retry */ }

    if (gotResponse) {
      return;  // content script responded, ready
    }
    await new Promise(r => setTimeout(r, 100));  // short delay before retry
  }
  throw new Error("Content script not available after timeout");
}
By pinging the content script like this, we verify that: (a) the page has loaded enough for scripts to run, and (b) our extension’s script is injected and listening. This method leverages the fact that if no content script is listening, chrome.runtime.lastError will indicate the message couldn’t connect, which we treat as “not ready”
stackoverflow.com
. We keep polling in a loop (e.g. every 100ms) until success or a timeout. Alternate approach: Another way is to use tab update events or CDP page events. For instance, Chrome emits chrome.tabs.onUpdated events with status and url properties. We can listen for the specific tab’s update where status === "complete", meaning the page finished loading. Or as recommended by experts, wait for the first info.url update event after navigation
stackoverflow.com
 – this indicates the navigation has started. In fact, one workaround for early DevTools commands is to wait until the tab’s URL is set (navigation committed) before sending the command
stackoverflow.com
. For example, after calling chrome.tabs.update or Page.navigate, use chrome.tabs.onUpdated to detect the tabId with an info.url, then proceed. This ensures the target is in a stable state to receive commands like Emulation or DOM queries. In practice, combining both strategies is wise:
Wait for navigation to start (tabs.onUpdated with URL or use CDP’s Page.frameNavigated event).
Wait for page load to complete (tabs.onUpdated with status "complete" or CDP Page.loadEventFired).
Finally, ping the content script to ensure our script injected at document_idle is active.
These steps can be encapsulated in the controller. For example, in newTab(url) after attaching, we might call await waitForContentScript(tab.id!) before returning control. This guarantees that any subsequent actions (like taking a DOM snapshot or clicking an element) happen when the page is ready, avoiding race conditions.
Service Worker and Side Panel Considerations
Because this code runs in a Manifest V3 extension context (either a background service worker or a persistent side-panel page), a few adjustments are needed compared to a Node environment:
Persistent state: A service worker is ephemeral; it might unload when idle. Attaching a debugger session might keep it alive indirectly (since events can wake it), but it’s safer to ensure the SW remains active during critical sequences. Using a side panel (which is a long-lived page) can simplify persistence, as it stays open while the user interacts. The controller can run in either, but if using a service worker, consider using chrome.alarms or long-lived connections (like Port messaging or chrome.debugger.onEvent listeners) to prevent it from sleeping mid-operation.
APIs: In a service worker, certain APIs like chrome.tabs.create or chrome.scripting.executeScript are asynchronous and return Promises (as shown above). We use await accordingly. Also, ensure the extension’s manifest has the needed permissions: "debugger" in permissions, and appropriate "host_permissions" (e.g. <all_urls> if controlling arbitrary pages) so we can inject scripts and read page details
stackoverflow.com
stackoverflow.com
. Without host permissions or activeTab, the content script injection or messaging might fail.
Isolation: By default, extension content scripts run in an isolated world, which means their JavaScript context is separate from the page’s scripts. This usually doesn’t affect DOM interrogation via DevTools (CDP’s DOM domain or Runtime.evaluate can interact with the page context). However, if we rely on a flag like window._extReady set by the content script, note that Runtime.evaluate (which runs in the page’s context by default) might not see a variable set in the isolated content script context. In such cases, using the messaging approach (which doesn’t depend on sharing JS context) is preferred for checking content script readiness.
Parallel tasks: The controller can juggle multiple tabs, but remember that a single background worker thread will handle events sequentially. Heavy operations (like capturing a screenshot and processing it) might block the worker. If using a side panel (which is essentially a UI page), you could offload some tasks there. Alternatively, since each DevTools command is asynchronous, the extension can interleave operations on different tabs, but for truly simultaneous actions consider spawning separate web workers or simply accept sequential control.
Consistency with Node.js Driver Interface
To make the extension-based driver a drop-in replacement, we should match the interface of the original Selenium/WebDriver as closely as possible. That way, higher-level code (like your MCP server tools) doesn’t need major changes. Here are some specifics to align:
Navigation methods: In Selenium, driver.get(url) navigates to a page, and driver.navigate().back() goes back in history. We can implement get(url) in our extension driver to call chrome.debugger.sendCommand(... 'Page.navigate', {url}) and then wait for load. History navigation can be done via the DevTools Page domain: e.g., use Page.getNavigationHistory and Page.navigateToHistoryEntry for back/forward. We might implement navigate() to return an object with methods .back(), .forward(), .refresh() for compatibility. For example, driver.navigate().back() could call:
const history = await sendCommand("Page.getNavigationHistory", {}); then pick entries[currentIndex-1] and send Page.navigateToHistoryEntry with that ID.
Or simply evaluate history.back() in the page context via Runtime.evaluate (this triggers the same effect, since it’s just a user navigation action). The DevTools approach is more robust (works even if the page has its own onpopstate handlers etc., since it simulates browser back directly).
Element interaction: If your DomInteractionsOperator relies on JavaScript execution (like finding an element by a description then clicking it), our extension driver must support executing scripts in-page. We can implement a method analogous to WebDriver’s executeScript using chrome.debugger.sendCommand(..., "Runtime.evaluate", { expression: "...", ... }). In fact, the Runtime domain allows evaluation of JS in the page context. The extension driver can wrap this to return values in a similar structure to WebDriver. Likewise, sendKeys or clicking can use the CDP Input.dispatchMouseEvent or Input.dispatchKeyEvent to simulate user input. All these input and DOM operations are possible with the allowed DevTools domains
developer.chrome.com
developer.chrome.com
.
Console logs: In the Selenium setup, cdp.console.getMessages() likely collected messages via event listeners on Console.messageAdded. In the extension, we’ll enable the Console domain (Console.enable) and use chrome.debugger.onEvent to catch Console.messageAdded events for each tab. We can store logs per tab in the _tabs session object. The get_console_logs tool can then stringify the stored messages just as before. This is to illustrate that events need to be handled similarly – ensure that after attaching, we call sendCommand("Console.enable") (and other domain enables) just like in the original cdp.init(). Our shim’s job is to forward these calls to chrome.debugger and handle the responses/events.
Snapshots and overlays: Domains like DOMSnapshot, Overlay, etc., which you used for getting page snapshots and highlighting elements, are supported in the extension environment
developer.chrome.com
developer.chrome.com
. The extension driver simply passes those through. One thing to note: capturing screenshots via Page.captureScreenshot returns a base64 image string. In an extension, that may be large, but it should work. Just be mindful of not exhausting memory in the service worker (you might convert large base64 to blob and release memory if needed). Visual enhancements (like drawing green boxes on the screenshot via Node’s canvas in VisualSnapshotTaker) might not run in a service worker since Node-specific modules (fs, canvas) aren’t available. If needed, you could use an HTML canvas in a side panel page or use the Overlay domain to draw highlights directly in the page (via Overlay.highlightNode etc.). For now, the key is that our controller allows retrieving the raw data (DOM snapshot, screenshot bytes) and then the existing logic can handle it or might be adjusted for the extension context.
Unified API surface: We can design the extension’s ChromeDriver shim such that it has the same methods as the Selenium WebDriver that the rest of your code expects. For example:
sendAndGetDevToolsCommand(method, params) – implemented via chrome.debugger.sendCommand.
createCDPConnection(sessionType) – in Selenium, this might open a CDP connection for a given target (e.g., page or iframe). In our case, since we’re already attached, we might not need a separate call; but we could simulate it by just returning an identifier or the same {tabId} as a handle. Essentially, the cdpSession in your code can just be the debuggee id itself (for the main frame) because the extension uses that for all commands. If we adopt Chrome’s flat session mode for child iframes, createCDPConnection('page') could ensure Target.setAutoAttach (with flatten: true) is enabled
developer.chrome.com
developer.chrome.com
, then return without error. The domain classes (like Target, DOMSnapshot) can then operate normally.
Navigation and element methods as discussed, matching return types and behavior of Selenium as closely as possible.
By keeping the same method names and return structures, the rest of the MCP server and tools can work unchanged. For instance, the do_navigate-to tool calls await driver.get(url). Our driver’s get will perform Page.navigate and return when done (perhaps returning nothing or some “ok” string as in your current implementation). Similarly, get_current_page_url calls driver.getCurrentUrl() – we implement that to call chrome.tabs.get(tabId) or use Runtime.evaluate('location.href') to retrieve the URL.
Example Usage
Using the above design, here’s how a developer might use the new controller in practice (similar to how they would use a WebDriver in Node):
const controller = new BrowserController();

// Open a new page and navigate to a URL
const tabId = await controller.newTab('https://example.com');  
console.log(`Attached to tab ${tabId}`);

// Wait for page ready (controller does this internally in newTab)
await controller.evaluate(tabId, "document.title");  // sample evaluation via Runtime

// Perform some actions on the page
await controller.sendCDPCommand(tabId, "Runtime.evaluate", 
  { expression: "document.querySelector('button#submit').click()" });

// Retrieve a page snapshot (text content for example)
const snapshot = await controller.sendCDPCommand(tabId, "DOMSnapshot.captureSnapshot", 
  { computedStyles: [] });
console.log("Snapshot captured, DOM node count:", snapshot.domNodes.length);

// Detach and close the tab when done
await controller.detachTab(tabId);
chrome.tabs.remove(tabId);
In this snippet:
newTab opens a page and attaches the debugger.
evaluate and sendCDPCommand are utility methods to run JS or send arbitrary CDP commands through our shim (wrapping chrome.debugger.sendCommand under the hood).
We then detach and optionally close the tab. The controller’s internal _tabs list is updated accordingly.
Because the controller handles multiple tabs, a developer could call await controller.newTab(url2) to open another tab, and the internal _tabs would have two sessions. They can switch context by specifying the desired tabId when sending commands or performing actions. Events like console logs or network events would be separated per tab and could be retrieved via something like controller.getLogs(tabId).
Conclusion
Deep integration with the Chrome extension debugger API allows us to emulate a WebDriver-like controller entirely within the browser. We created a controller with a _tabs registry to manage multiple pages, ensuring each is attached to the DevTools Protocol and cleaned up appropriately. We also implemented a polling strategy to await content script availability before issuing commands – this avoids issues where commands might fail if run too early
stackoverflow.com
. The design works in a service worker or side panel context, with attention to keeping the service worker alive during critical operations. Finally, by matching the interface of the Node.js/Selenium driver (same method names and behaviors), this solution can serve as a drop-in shim, meaning the higher-level logic (your MCP tools and agent prompts) can remain unchanged while the driver implementation switches from an external Selenium to the in-extension controller. This approach provides the best of both worlds: the convenience and power of Chrome’s DevTools Protocol (as used by Puppeteer) and the integration within an extension environment, controlling the user’s browser directly. By following the steps above – structured tab management, careful synchronization (polling) for readiness, and interface parity – we can perfect the controller and ensure it operates as robustly as a traditional WebDriver. Sources:
Chrome Extension Debugger API – Chrome Developers Documentation
developer.chrome.com
developer.chrome.com
 (supports attaching to multiple tabs and lists available CDP domains for extensions).
Stack Overflow discussion on using chrome.debugger – highlighting the need to wait for the page URL to be set before sending certain commands
stackoverflow.com
.
Stack Overflow answer on messaging errors – recommendation to keep retrying if “receiving end does not exist” (content script not yet loaded)
stackoverflow.com
.
Example of using chrome.tabs.onUpdated to detect navigation start (info.url)
stackoverflow.com
, which can be used as a signal that the tab navigation has commenced.
Citations

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger

javascript - chrome.debugger.detach({tabId}) detachs not just the tab with tabId but all other tabs - Stack Overflow

https://stackoverflow.com/questions/70823393/chrome-debugger-detachtabid-detachs-not-just-the-tab-with-tabid-but-all-othe

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger

chrome.experimental.debugger documentation: events are not per tab

https://groups.google.com/g/google-chrome-developer-tools/c/eGufuLb0QZk

javascript - chrome.debugger.sendCommand doesn't work on extension but works on console - Stack Overflow

https://stackoverflow.com/questions/69022999/chrome-debugger-sendcommand-doesnt-work-on-extension-but-works-on-console

google chrome extension - Port error: Could not establish connection. Receiving end does not exist. In Chromiume - Stack Overflow

https://stackoverflow.com/questions/9106519/port-error-could-not-establish-connection-receiving-end-does-not-exist-in-chr

"Scroll to Text" not working in Extension - Stack Overflow

https://stackoverflow.com/questions/68803825/scroll-to-text-not-working-in-extension/68852058#68852058

google chrome extension - Port error: Could not establish connection. Receiving end does not exist. In Chromiume - Stack Overflow

https://stackoverflow.com/questions/9106519/port-error-could-not-establish-connection-receiving-end-does-not-exist-in-chr

google chrome extension - Port error: Could not establish connection. Receiving end does not exist. In Chromiume - Stack Overflow

https://stackoverflow.com/questions/9106519/port-error-could-not-establish-connection-receiving-end-does-not-exist-in-chr

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger
CDP.ts

file://file-9YS8w45bsV1yQdfXSvJYzq
CDP.ts

file://file-9YS8w45bsV1yQdfXSvJYzq

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger

chrome.debugger  |  API  |  Chrome for Developers

https://developer.chrome.com/docs/extensions/reference/api/debugger
MCP.ts