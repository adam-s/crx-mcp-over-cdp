import type Protocol from 'devtools-protocol';

// Chrome Debugger API types

// --- Public interfaces (now strongly typed) ---
export interface CDPSession {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  on(event: string, callback: (params: unknown) => void): void;
  off(event: string, callback: (params: unknown) => void): void;
}

export interface IChromeExtensionDriver {
  createCDPConnection(): Promise<CDPSession>;
  sendAndGetDevToolsCommand<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  sendDevToolsCommand(method: string, params?: Record<string, unknown>): Promise<void>;

  get(url: string): Promise<void>;
  getCurrentUrl(): Promise<string>;
  createNewTab(url?: string): Promise<void>;
  getExtensionUrl(path: string): string;
  navigate(): {
    back(): Promise<void>;
    forward(): Promise<void>;
    refresh(): Promise<void>;
  };
  wait<T>(cond: () => Promise<T | boolean>, timeoutMs?: number): Promise<T | boolean>;

  // Runtime.evaluate convenience with typed return payload when using returnByValue
  executeScript<R = unknown>(expression: string): Promise<R>;

  findLandingPageTab(): Promise<chrome.tabs.Tab | null>;
  activateTab(tabId: number): Promise<void>;
  openLandingPageSmart(): Promise<chrome.tabs.Tab>;

  // Match CDP's emulateNetworkConditions request (with safe defaults filled in)
  setNetworkConditions(
    conditions: Partial<Protocol.Network.EmulateNetworkConditionsRequest>,
  ): Promise<void>;

  setDownloadPath(path: string): Promise<void>; // no-op (documented)
  performSearch(searchQuery: string): Promise<void>;
  detach(): Promise<void>;
}

// --- Implementation ---
export class ChromeExtensionDriver implements IChromeExtensionDriver {
  private tabId?: number;
  private attached = false;
  private cdpConnectionPromise?: Promise<CDPSession>;

  // Store listeners keyed by event method (e.g., "Network.responseReceived")
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor() {}

  async createCDPConnection(): Promise<CDPSession> {
    // If we're already creating a connection, return the same promise to avoid race conditions
    if (this.cdpConnectionPromise) {
      console.log('🔄 Reusing existing CDP connection promise');
      return this.cdpConnectionPromise;
    }

    this.cdpConnectionPromise = this._createCDPConnectionInternal();
    return this.cdpConnectionPromise;
  }

  private async _createCDPConnectionInternal(): Promise<CDPSession> {
    if (!chrome.debugger) {
      throw new Error('chrome.debugger API not available (missing "debugger" permission?)');
    }

    // If we don't have a tab ID, try to find a suitable tab or create one
    if (!this.tabId) {
      // First, try to find an existing tab with a non-restricted URL
      const allTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      let suitableTab = allTabs.find(tab => tab.url && !this.isRestrictedUrl(tab.url));

      // If no active tab is suitable, look at all tabs
      if (!suitableTab) {
        const allWindowTabs = await chrome.tabs.query({});
        suitableTab = allWindowTabs.find(tab => tab.url && !this.isRestrictedUrl(tab.url));
      }

      if (suitableTab?.id) {
        this.tabId = suitableTab.id;
        console.log(`Found suitable existing tab: ${suitableTab.url}`);

        // Switch to the suitable tab to make it active
        await this.activateTab(this.tabId);
      } else {
        // No suitable tab found, create a new tab with example.com (will be navigated by agent)
        console.log('No suitable tab found, creating new tab with example.com');
        const newTab = await chrome.tabs.create({ url: 'https://example.com' });
        if (!newTab.id) {
          throw new Error('Failed to create new tab');
        }
        this.tabId = newTab.id;

        // Wait for the new tab to be ready
        await this.waitForTabReady();

        // Activate the new tab
        await this.activateTab(this.tabId);
      }
    } else {
      // We have a tab ID, check if it's accessible
      try {
        const tab = await chrome.tabs.get(this.tabId);
        if (tab.url && this.isRestrictedUrl(tab.url)) {
          console.log(`Current tab has restricted URL: ${tab.url}, creating new tab`);
          // Create a new tab with example.com (will be navigated by agent)
          const newTab = await chrome.tabs.create({ url: 'https://example.com' });
          if (!newTab.id) {
            throw new Error('Failed to create new tab');
          }

          // Detach from the old tab if attached
          if (this.attached) {
            try {
              await chrome.debugger.detach({ tabId: this.tabId });
            } catch (error) {
              console.warn('Failed to detach from old tab:', error);
            }
            this.attached = false;
          }

          this.tabId = newTab.id;

          // Wait for the new tab to be ready
          await this.waitForTabReady();

          // Activate the new tab
          await this.activateTab(this.tabId);
        }
      } catch (error) {
        // Tab might have been closed or become invalid
        console.log('Current tab is no longer valid, creating new tab');
        const newTab = await chrome.tabs.create({ url: 'https://example.com' });
        if (!newTab.id) {
          throw new Error('Failed to create new tab');
        }

        // Detach from the old tab if attached
        if (this.attached) {
          try {
            await chrome.debugger.detach({ tabId: this.tabId });
          } catch (detachError) {
            console.warn('Failed to detach from old tab:', detachError);
          }
          this.attached = false;
        }

        this.tabId = newTab.id;

        // Wait for the new tab to be ready
        await this.waitForTabReady();

        // Activate the new tab
        await this.activateTab(this.tabId);
      }
    }

    // Wait for the tab to be ready before attaching debugger
    await this.waitForTabReady();

    // Check if debugger is already attached
    try {
      console.log(`Attaching debugger to tab ${this.tabId}...`);
      await chrome.debugger.attach({ tabId: this.tabId }, '1.3'); // stable channel
      this.attached = true;
      console.log('Debugger attached successfully');
    } catch (error) {
      // If already attached, we can still use the debugger
      if (error instanceof Error && error.message.includes('already attached')) {
        this.attached = true;
        console.log('Debugger already attached, continuing with existing session');
      } else {
        console.error('Debugger attachment failed:', error);

        // Try to detach first and then reattach
        try {
          console.log('Attempting to detach and reattach debugger...');
          await chrome.debugger.detach({ tabId: this.tabId });
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit
          await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
          this.attached = true;
          console.log('Successfully reattached debugger');
        } catch (reattachError) {
          console.error('Reattachment also failed:', reattachError);
          throw error; // Throw the original error
        }
      }
    }

    // Wire events -> our listener registry (typed when registering via .on())
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (!this.tabId) return;
      if (source.tabId !== this.tabId) return;

      const set = this.eventListeners.get(method);
      if (!set) return;

      // Fan out to listeners
      for (const cb of set) {
        try {
          // params may be undefined for zero-payload events
          cb(params);
        } catch (e) {
          console.warn('[CDP event handler error]', method, e);
        }
      }
    });

    // Enable common domains up front (all are allowed by debugger API)
    await Promise.all([
      this.sendDevToolsCommand('Page.enable'),
      this.sendDevToolsCommand('Runtime.enable'),
      this.sendDevToolsCommand('DOM.enable'),
      this.sendDevToolsCommand('CSS.enable'),
      this.sendDevToolsCommand('Console.enable'),
      this.sendDevToolsCommand('Network.enable'),
      this.sendDevToolsCommand('Overlay.enable'),
      this.sendDevToolsCommand('Accessibility.enable'),
    ]);

    // Return a typed session façade
    const session: CDPSession = {
      send: async <T = unknown>(method: string, params?: Record<string, unknown>) => {
        return this.sendAndGetDevToolsCommand<T>(method, params);
      },
      on: (event: string, callback: (params: unknown) => void) => {
        if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
        this.eventListeners.get(event)!.add(callback);
      },
      off: (event: string, callback: (params: unknown) => void) => {
        this.eventListeners.get(event)?.delete(callback);
      },
    };

    return session;
  }

  async sendAndGetDevToolsCommand<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.attached || !this.tabId) {
      throw new Error('Debugger not attached');
    }

    // The debugger API returns object | undefined; cast to mapped return type
    const result = await chrome.debugger.sendCommand({ tabId: this.tabId }, method, params);

    return result as T;
  }

  async sendDevToolsCommand(method: string, params?: Record<string, unknown>): Promise<void> {
    // Ignore any non-void returns for "fire-and-forget" semantics
    await this.sendAndGetDevToolsCommand(method, params);
  }

  // --- Navigation helpers ---
  private isRestrictedUrl(url: string): boolean {
    try {
      const { protocol } = new URL(url);
      return (
        protocol === 'chrome:' ||
        protocol === 'chrome-extension:' ||
        protocol === 'moz-extension:' ||
        protocol === 'about:' ||
        protocol === 'data:' ||
        protocol === 'file:'
      );
    } catch {
      return true;
    }
  }

  async get(url: string): Promise<void> {
    console.log(`🌐 Driver.get() called with URL: ${url}`);
    if (this.isRestrictedUrl(url)) {
      throw new Error(`Cannot navigate to restricted URL: ${url}`);
    }
    console.log(`📡 Sending Page.navigate command...`);
    await this.sendDevToolsCommand('Page.navigate', { url });
    console.log(`⏳ Waiting for page load...`);
    await this.waitForLoad();
    console.log(`🎯 Focusing page...`);
    await this.focusPage();
    console.log(`✅ Driver.get() completed successfully`);
  }

  async createNewTab(url?: string): Promise<void> {
    const defaultUrl = url || 'https://example.com';
    if (this.isRestrictedUrl(defaultUrl)) {
      throw new Error(`Cannot create tab with restricted URL: ${defaultUrl}`);
    }

    const newTab = await chrome.tabs.create({ url: defaultUrl });
    if (!newTab.id) throw new Error('Failed to create new tab');

    if (this.attached && this.tabId) {
      await chrome.debugger.detach({ tabId: this.tabId });
      this.attached = false;
    }
    this.tabId = newTab.id;

    await this.waitForTabReady();
    // Don't call createCDPConnection() here to avoid recursive tab creation
    // The caller should handle CDP connection setup if needed
    await this.focusPage();
  }

  getExtensionUrl(path: string): string {
    return chrome.runtime.getURL(path);
  }

  private async waitForTabReady(): Promise<void> {
    await this.wait(async () => {
      if (!this.tabId) return false;
      try {
        const tab = await chrome.tabs.get(this.tabId);
        // Accept both 'complete' and 'loading' states, as 'loading' means the tab is accessible
        return tab.status === 'complete' || tab.status === 'loading';
      } catch {
        return false;
      }
    }, 5_000); // Reduced timeout from 10s to 5s

    // Add a small delay to ensure the tab is fully ready for debugger attachment
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async getCurrentUrl(): Promise<string> {
    if (!this.tabId) throw new Error('No tab attached');
    const tab = await chrome.tabs.get(this.tabId);
    return tab.url || '';
  }

  navigate() {
    return {
      back: async () => {
        const hist =
          await this.sendAndGetDevToolsCommand<Protocol.Page.GetNavigationHistoryResponse>(
            'Page.getNavigationHistory',
          );
        const idx = hist.currentIndex - 1;
        if (idx >= 0) {
          await this.sendDevToolsCommand('Page.navigateToHistoryEntry', {
            entryId: hist.entries[idx].id,
          });
          await this.waitForLoad();
        }
      },
      forward: async () => {
        const hist =
          await this.sendAndGetDevToolsCommand<Protocol.Page.GetNavigationHistoryResponse>(
            'Page.getNavigationHistory',
          );
        const idx = hist.currentIndex + 1;
        if (idx < hist.entries.length) {
          await this.sendDevToolsCommand('Page.navigateToHistoryEntry', {
            entryId: hist.entries[idx].id,
          });
          await this.waitForLoad();
        }
      },
      refresh: async () => {
        await this.sendDevToolsCommand('Page.reload', { ignoreCache: false });
        await this.waitForLoad();
      },
    };
  }

  async wait<T>(cond: () => Promise<T | boolean>, timeoutMs = 10_000): Promise<T | boolean> {
    const start = Date.now();
    let attempts = 0;
    console.log(`⏱️ wait() started with timeout: ${timeoutMs}ms`);
    for (;;) {
      attempts++;
      const out = await cond();
      if (out) {
        console.log(
          `✅ wait() completed successfully after ${attempts} attempts (${Date.now() - start}ms)`,
        );
        return out;
      }
      if (Date.now() - start > timeoutMs) {
        console.error(`⏰ wait() timed out after ${attempts} attempts (${Date.now() - start}ms)`);
        throw new Error('wait: timeout');
      }
      if (attempts % 10 === 0) {
        console.log(
          `⏳ wait() still waiting... (attempt ${attempts}, ${Date.now() - start}ms elapsed)`,
        );
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  async executeScript<R = unknown>(expression: string): Promise<R> {
    const res = await this.sendAndGetDevToolsCommand<Protocol.Runtime.EvaluateResponse>(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
        // You can extend with serializationOptions if you need structured clones
      },
    );

    if (res.exceptionDetails) {
      const text =
        res.exceptionDetails.text || res.exceptionDetails.exception?.description || 'unknown';
      throw new Error(`executeScript error: ${text}`);
    }
    // When returnByValue is true, result.value contains JSON-serializable result
    return (res.result as Protocol.Runtime.RemoteObject & { value?: R }).value as R;
  }

  private async waitForLoad(): Promise<void> {
    console.log(`⏳ waitForLoad() started, waiting for document.readyState === 'complete'`);
    // Either wait for readyState or use the Page.loadEventFired event (both are stable)
    await this.wait(async () => {
      try {
        const r = await this.sendAndGetDevToolsCommand<Protocol.Runtime.EvaluateResponse>(
          'Runtime.evaluate',
          {
            expression: 'document.readyState',
            returnByValue: true,
          },
        );
        const readyState = r.result.value;
        console.log(`📄 Current readyState: ${readyState}`);
        return readyState === 'complete';
      } catch (error) {
        console.error(`❌ Error checking readyState:`, error);
        return false;
      }
    }, 30_000);
    console.log(`✅ waitForLoad() completed`);
  }

  private async focusPage(): Promise<void> {
    if (!this.tabId) {
      throw new Error('No tab attached');
    }

    try {
      // Focus the tab
      await chrome.tabs.update(this.tabId, { active: true });

      // Focus the window containing the tab
      const tab = await chrome.tabs.get(this.tabId);
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }

      // Focus the page content using CDP
      await this.sendAndGetDevToolsCommand('Runtime.evaluate', {
        expression: `
                    (() => {
                        // Focus the document
                        document.focus();
                        
                        // Focus the body element
                        if (document.body) {
                            document.body.focus();
                        }
                        
                        // Try to focus any interactive element if available
                        const focusableElement = document.querySelector('input, button, a, [tabindex]:not([tabindex="-1"])');
                        if (focusableElement) {
                            focusableElement.focus();
                        }
                        
                        return true;
                    })()
                `,
        returnByValue: true,
      });

      // Small delay to ensure focus is established
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.warn('Failed to focus page:', error);
      // Don't throw error as focus is not critical
    }
  }

  // --- Landing page discovery/activation ---
  async findLandingPageTab(): Promise<chrome.tabs.Tab | null> {
    const landingPageUrl = chrome.runtime.getURL('landing.html');

    const currentWindow = await chrome.windows.getCurrent();
    const currentWindowTabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const inCurrent = currentWindowTabs.find(t => t.url === landingPageUrl);
    if (inCurrent) return inCurrent;

    const allWindows = await chrome.windows.getAll();
    for (const w of allWindows) {
      if (w.id === currentWindow.id) continue;
      const tabs = await chrome.tabs.query({ windowId: w.id });
      const found = tabs.find(t => t.url === landingPageUrl);
      if (found) return found;
    }
    return null;
  }

  async activateTab(tabId: number): Promise<void> {
    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  }

  async openLandingPageSmart(): Promise<chrome.tabs.Tab> {
    const landingPageUrl = chrome.runtime.getURL('landing.html');
    const existing = await this.findLandingPageTab();
    if (existing?.id) {
      await this.activateTab(existing.id);
      return existing;
    }
    const currentWindow = await chrome.windows.getCurrent();
    const tab = await chrome.tabs.create({ url: landingPageUrl, windowId: currentWindow.id });
    if (!tab.id) throw new Error('Failed to create landing page tab');
    return tab;
  }

  // --- Network emulation (typed) ---
  async setNetworkConditions(
    conditions: Partial<Protocol.Network.EmulateNetworkConditionsRequest>,
  ): Promise<void> {
    await this.sendDevToolsCommand('Network.enable');

    const {
      offline = false,
      latency = 0,
      downloadThroughput = -1,
      uploadThroughput = -1,
      connectionType = 'none',
      // Experimental WebRTC fields (leave undefined unless you need them)
      packetLoss,
      packetQueueLength,
      packetReordering,
    } = conditions;

    await this.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline,
      latency,
      downloadThroughput,
      uploadThroughput,
      connectionType,
      packetLoss,
      packetQueueLength,
      packetReordering,
    });
  }

  async setDownloadPath(/*_path: string*/): Promise<void> {
    // Not supported for extensions; document using chrome.downloads listeners instead.
    console.warn(
      'setDownloadPath is not supported in Chrome extensions. Use chrome.downloads.onDeterminingFilename.',
    );
  }

  async performSearch(searchQuery: string): Promise<void> {
    if (!this.tabId) {
      throw new Error('No tab attached');
    }

    try {
      console.log('🔍 Starting search for:', searchQuery);

      // First, try to find the search input field and set it up without scrolling
      const searchInput = await this.sendAndGetDevToolsCommand<Protocol.Runtime.EvaluateResponse>(
        'Runtime.evaluate',
        {
          expression: `
                    (() => {
                        const searchInput = document.querySelector('input[type="search"], input[name="q"], input[placeholder*="search"], input[placeholder*="Search"], input[type="text"]');
                        if (searchInput) {
                            console.log('Found search input:', searchInput);
                            
                            // Store current scroll position
                            const scrollX = window.scrollX;
                            const scrollY = window.scrollY;
                            
                            // Focus the input without scrolling
                            searchInput.focus({ preventScroll: true });
                            
                            // Clear any existing value
                            searchInput.value = '';
                            
                            // Set the new value
                            searchInput.value = '${searchQuery}';
                            
                            // Trigger input event
                            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                            
                            // Restore scroll position if it changed
                            if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
                                window.scrollTo(scrollX, scrollY);
                            }
                            
                            return true;
                        }
                        console.log('No search input found');
                        return false;
                    })()
                `,
          returnByValue: true,
        },
      );

      if (searchInput.result.value) {
        console.log('✅ Search input found and value set');

        // Small delay to ensure the input is properly set
        await new Promise(resolve => setTimeout(resolve, 200));

        // Submit the search form without scrolling
        const submitResult = await this.sendAndGetDevToolsCommand('Runtime.evaluate', {
          expression: `
                        (() => {
                            const searchInput = document.querySelector('input[type="search"], input[name="q"], input[placeholder*="search"], input[placeholder*="Search"], input[type="text"]');
                            if (searchInput) {
                                console.log('Submitting search...');
                                
                                // Store current scroll position
                                const scrollX = window.scrollX;
                                const scrollY = window.scrollY;
                                
                                // Try multiple submission methods
                                let submitted = false;
                                
                                // Method 1: Try to find and click a search button
                                const searchButton = document.querySelector('button[type="submit"], input[type="submit"], button[aria-label*="Search"], button[title*="Search"]');
                                if (searchButton && !submitted) {
                                    console.log('Clicking search button');
                                    searchButton.click();
                                    submitted = true;
                                }
                                
                                // Method 2: Try form submission
                                const form = searchInput.closest('form');
                                if (form && !submitted) {
                                    console.log('Submitting form');
                                    form.submit();
                                    submitted = true;
                                }
                                
                                // Method 3: Simulate Enter key press
                                if (!submitted) {
                                    console.log('Simulating Enter key press');
                                    // Create and dispatch keydown event
                                    const keydownEvent = new KeyboardEvent('keydown', { 
                                        key: 'Enter', 
                                        code: 'Enter', 
                                        keyCode: 13, 
                                        which: 13, 
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    searchInput.dispatchEvent(keydownEvent);
                                    
                                    // Create and dispatch keypress event
                                    const keypressEvent = new KeyboardEvent('keypress', { 
                                        key: 'Enter', 
                                        code: 'Enter', 
                                        keyCode: 13, 
                                        which: 13, 
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    searchInput.dispatchEvent(keypressEvent);
                                    
                                    // Create and dispatch keyup event
                                    const keyupEvent = new KeyboardEvent('keyup', { 
                                        key: 'Enter', 
                                        code: 'Enter', 
                                        keyCode: 13, 
                                        which: 13, 
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    searchInput.dispatchEvent(keyupEvent);
                                    
                                    submitted = true;
                                }
                                
                                // Method 4: Try to trigger any click handlers on the input
                                if (!submitted) {
                                    console.log('Clicking input as fallback');
                                    searchInput.click();
                                    submitted = true;
                                }
                                
                                // Restore scroll position if it changed
                                if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
                                    window.scrollTo(scrollX, scrollY);
                                }
                                
                                console.log('Search submission result:', submitted);
                                return submitted;
                            }
                            return false;
                        })()
                    `,
          returnByValue: true,
        });

        console.log(
          '✅ Search submission completed:',
          (submitResult as Protocol.Runtime.EvaluateResponse).result.value,
        );

        // Wait for navigation to complete
        await this.waitForLoad();
        console.log('✅ Page load completed after search');
      } else {
        throw new Error('Search input field not found');
      }
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  async detach(): Promise<void> {
    if (this.attached && this.tabId) {
      await chrome.debugger.detach({ tabId: this.tabId });
      this.attached = false;
    }
  }
}
