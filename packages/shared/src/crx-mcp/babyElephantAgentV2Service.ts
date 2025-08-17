// babyElephantAgentV2Service.ts
// Service layer for Baby Elephant Agent V2 that integrates with CRXMCPService infrastructure
// This handles the bridge between the service and the agent implementation

import { runAgentV2, type AgentTools, type AgentIO } from './babyElephantAgent.v2';
import type { ChromeExtensionDriver } from './chromeExtensionDriver';
import type { DomInteractionsOperator } from './DomInteractionsOperator';
import type { A11yTreeSnapshotTaker } from './A11yTreeSnapshotTaker';

export interface BabyElephantAgentV2ServiceDependencies {
  driver: ChromeExtensionDriver;
  domInteractionsOperator: DomInteractionsOperator;
  a11yTreeSnapshotTaker: A11yTreeSnapshotTaker;
  getCurrentPageUrl: () => Promise<string>;
  getPageSnapshotAsJpegScreenshot: () => Promise<string>;
  navigateTo: (url: string) => Promise<string>;
}

export interface BabyElephantAgentV2Options {
  startUrl?: string;
  maxSteps?: number;
  devMode?: boolean;
}

export class BabyElephantAgentV2Service {
  constructor(private dependencies: BabyElephantAgentV2ServiceDependencies) {}

  // Helper method to safely serialize results
  private _safeStringify(obj: unknown): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (error) {
      return `Error serializing result: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async runBabyElephantAgentV2(
    task: string,
    apiKey: string,
    options: BabyElephantAgentV2Options = {},
  ): Promise<string> {
    try {
      const { driver, domInteractionsOperator, a11yTreeSnapshotTaker } = this.dependencies;

      // Create tools interface for v2 agent
      const tools: AgentTools = {
        navigateTo: async (url: string) => {
          const result = await this.dependencies.navigateTo(url);
          return result;
        },
        takeScreenshot: async () => {
          const result = await this.dependencies.getPageSnapshotAsJpegScreenshot();
          return result;
        },
        takeDomSnapshot: async () => {
          // Instead of full DOM dump, return a focused summary using A11y tree
          if (!a11yTreeSnapshotTaker) {
            return 'A11y tree snapshot not available';
          }
          const a11ySnapshot = await a11yTreeSnapshotTaker.takeSnapshot();
          // Truncate if too long to avoid token limits
          if (a11ySnapshot.length > 10000) {
            return a11ySnapshot.substring(0, 10000) + '\n... (truncated for brevity)';
          }
          return a11ySnapshot;
        },
        clickElement: async (selector: string) => {
          // Use the existing CDP infrastructure to find elements and click them
          return this._safeStringify({
            success: false,
            message: `Selector-based clicking not yet implemented for selector: ${selector}. Try finding the element ID first with takeDomSnapshot, then use clickNodeById(id).`,
          });
        },
        typeText: async (selector: string, text: string) => {
          // Use the existing CDP infrastructure to find elements and type into them
          return this._safeStringify({
            success: false,
            message: `Selector-based typing not yet implemented for selector: ${selector}, text: ${text}. Try finding the element ID first with takeDomSnapshot, then use typeIntoNodeById(id, text).`,
          });
        },
        extractImageUrls: async () => {
          try {
            // Universal image scraping script that adapts to different websites
            const urls: string[] = await driver.executeScript<string[]>(`(function() {
              console.log('🔍 Starting universal image URL extraction...');
              
              // Detect current website
              const hostname = window.location.hostname.toLowerCase();
              console.log('Current site:', hostname);
              
              // Website-specific strategies
              const strategies = [
                // Strategy 1: Google Images
                () => {
                  if (hostname.includes('google.com')) {
                    const imgElements = document.querySelectorAll('[data-src*="images"], img[src*="googleusercontent"], img[src*="gstatic"]');
                    console.log('Google Images strategy - found:', imgElements.length);
                    return Array.from(imgElements);
                  }
                  return [];
                },
                
                // Strategy 2: DuckDuckGo Images
                () => {
                  if (hostname.includes('duckduckgo.com')) {
                    const imgElements = document.querySelectorAll('img[src*="external-content.duckduckgo.com"], img[data-src*="external-content.duckduckgo.com"], .tile--img__img');
                    console.log('DuckDuckGo Images strategy - found:', imgElements.length);
                    return Array.from(imgElements);
                  }
                  return [];
                },
                
                // Strategy 3: Reddit
                () => {
                  if (hostname.includes('reddit.com')) {
                    const imgElements = document.querySelectorAll('img[src*="redd.it"], img[src*="redgifs"], img[src*="imgur"], .ImageBox-image, [data-test-id="post-content"] img');
                    console.log('Reddit strategy - found:', imgElements.length);
                    return Array.from(imgElements);
                  }
                  return [];
                },
                
                // Strategy 4: Bing Images
                () => {
                  if (hostname.includes('bing.com')) {
                    const imgElements = document.querySelectorAll('.iusc img, .imgpt img, img[src*="tse"]');
                    console.log('Bing Images strategy - found:', imgElements.length);
                    return Array.from(imgElements);
                  }
                  return [];
                },
                
                // Strategy 5: Generic - Large images (likely content, not UI)
                () => {
                  const imgElements = Array.from(document.querySelectorAll('img')).filter(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width >= 100 && rect.height >= 100; // Reasonable size images
                  });
                  console.log('Generic large images strategy - found:', imgElements.length);
                  return imgElements;
                },
                
                // Strategy 6: All HTTP/HTTPS images
                () => {
                  const imgElements = document.querySelectorAll('img[src^="http"], img[data-src^="http"]');
                  console.log('HTTP images strategy - found:', imgElements.length);
                  return Array.from(imgElements);
                },
                
                // Strategy 7: All img elements (last resort)
                () => {
                  const imgElements = document.querySelectorAll('img');
                  console.log('All images strategy - found:', imgElements.length);
                  return Array.from(imgElements);
                }
              ];
              
              let imgs = [];
              for (const strategy of strategies) {
                imgs = strategy();
                if (imgs.length > 0) break;
              }
              
              console.log('Total images found:', imgs.length);
              
              const extract = (img) => {
                // Try multiple attributes in order of preference
                const srcAttrs = ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-url'];
                let chosen = null;
                
                for (const attr of srcAttrs) {
                  const value = img.getAttribute(attr);
                  if (value && !value.startsWith('data:') && !value.includes('base64')) {
                    chosen = value;
                    break;
                  }
                }
                
                // Try srcset as fallback
                if (!chosen) {
                  const srcset = img.getAttribute('srcset');
                  if (srcset) {
                    const parts = srcset.split(',');
                    // Get the highest resolution version
                    const highRes = parts[parts.length - 1]?.trim()?.split(' ')?.[0];
                    if (highRes && !highRes.startsWith('data:')) chosen = highRes;
                  }
                }

                if (!chosen) return null;
                
                try {
                  const url = new URL(chosen, window.location.href).toString();
                  
                  // Enhanced filtering for UI/non-content images
                  const excludePatterns = [
                    'icon', 'logo', 'avatar', 'profile', 'favicon', 'sprite',
                    'static-assets', 'feature-image', 'ui-', 'button-', 'nav-',
                    'header-', 'footer-', 'sidebar-', 'menu-', 'search-',
                    '/assets/', '/static/', '/images/ui/', '/img/ui/',
                    'placeholder', 'loading', 'spinner', 'arrow', 'chevron'
                  ];
                  
                  // Check if URL contains any exclude patterns
                  if (excludePatterns.some(pattern => url.toLowerCase().includes(pattern))) {
                    console.log('Filtered out UI image:', url);
                    return null;
                  }
                  
                  // For DuckDuckGo specifically, only include external-content URLs for image search
                  if (hostname.includes('duckduckgo.com')) {
                    const acceptable = ['external-content.duckduckgo.com', 'bing.com', 'yandex', 'imgur.com', 'redd.it', 'googleusercontent.com'];
                    if (!acceptable.some(dom => url.includes(dom))) {
                      console.log('Filtered out DuckDuckGo non-search image:', url);
                      return null;
                    }
                  }
                  
                  console.log('Accepted URL:', url);
                  return url;
                } catch (e) {
                  console.log('Failed to parse URL:', chosen, e.message);
                  return null;
                }
              };

              const dedup = new Set();
              for (const img of imgs) {
                const url = extract(img);
                if (url) {
                  dedup.add(url);
                  if (dedup.size >= 15) break; // Get a good variety
                }
              }
              
              const result = Array.from(dedup);
              console.log('Final extracted URLs:', result.length, result.slice(0, 3));
              return result;
            })()`);
            console.log('Universal image extraction completed, found:', urls.length, 'URLs');
            return urls;
          } catch (error) {
            console.error('Universal image extraction failed:', error);
            return [];
          }
        },
        clickNodeById: async (backendNodeId: number) => {
          try {
            await domInteractionsOperator.doClick(backendNodeId);
            return `Successfully clicked element ${backendNodeId}`;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `Failed to click element ${backendNodeId}: ${errorMessage}`;
          }
        },
        typeIntoNodeById: async (backendNodeId: number, text: string) => {
          try {
            await domInteractionsOperator.doSetValue(backendNodeId, text);

            // Heuristic: try to submit the form / press Enter if a search box was likely edited.
            // We do this best-effort and ignore errors.
            try {
              await driver.executeScript<boolean>(`(function() {
                // Prefer submitting the nearest form; otherwise synthesize Enter on the active element
                const active = document.activeElement as HTMLElement | null;
                const trySubmit = (el: Element | null) => {
                  if (!el) return false;
                  // @ts-ignore - form may exist on inputs
                  const f = (el as any).form || el.closest('form');
                  if (f && typeof f.submit === 'function') { f.submit(); return true; }
                  return false;
                };

                if (trySubmit(active)) return true;

                // Fallback: synthesize Enter key press to trigger site handlers
                if (active) {
                  const kd = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                  const ku = new KeyboardEvent('keyup',   { key: 'Enter', bubbles: true });
                  active.dispatchEvent(kd);
                  active.dispatchEvent(ku);
                  return true;
                }
                return false;
              })()`);
            } catch {
              /* non-fatal */
            }

            return `Successfully typed "${text}" into element ${backendNodeId}`;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `Failed to type into element ${backendNodeId}: ${errorMessage}`;
          }
        },
        getCurrentUrl: async () => {
          const result = await this.dependencies.getCurrentPageUrl();
          return result;
        },
      };

      // Configure agent
      const agentConfig: AgentIO = {
        task,
        startUrl: options.startUrl,
        maxSteps: options.maxSteps || 12,
        devMode: options.devMode || true,
        apiKey,
        onEvent: event => {
          console.log(`[Agent V2] Step ${event.step} - ${event.phase}: ${event.message}`);
        },
      };

      // Run the v2 agent
      const result = await runAgentV2(agentConfig, tools);

      return this._safeStringify({
        success: result.success,
        steps: result.steps,
        finalResult: result.finalResult,
        error: result.error,
        eventCount: result.events.length,
        events: result.events.slice(-5), // Return last 5 events to avoid huge payloads
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'V2 Agent execution failed',
      });
    }
  }
}
