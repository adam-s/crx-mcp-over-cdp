// babyElephantAgentV2Service.ts
// Service layer for Baby Elephant Agent V2 that integrates with CRXMCPService infrastructure
// This handles the bridge between the service and the agent implementation

import { runAgentV2, type AgentTools, type AgentIO, type AgentEvent } from './babyElephantAgent.v2';
import type { ChromeExtensionDriver } from './chromeExtensionDriver';
import type { DomInteractionsOperator } from './DomInteractionsOperator';
import type { A11yTreeSnapshotTaker } from './A11yTreeSnapshotTaker';
import { ChatOpenAI } from '@langchain/openai';
import type { ServiceConsoleInterface } from '../types/serviceConsole.types';

// Global window interface extension
declare global {
  interface Window {
    serviceConsole?: ServiceConsoleInterface;
  }
}

/* ------------------------- Client-Side Form Submission Script ------------------------- */
function createFormSubmissionScript(strategy: {
  method: 'form_submit' | 'enter_key' | 'button_click' | 'auto_submit';
  buttonSelector?: string;
  waitTime?: number;
}): string {
  return `(function() {
    const strategy = ${JSON.stringify(strategy)};
    console.log('🤖 Using LLM-generated form submission strategy:', strategy);
    
    const active = document.activeElement;
    if (!active) {
      console.log('No active element found');
      return false;
    }
    
    try {
      switch (strategy.method) {
        case 'form_submit':
          // Find and submit the nearest form
          const form = active.form || active.closest('form');
          if (form && typeof form.submit === 'function') {
            console.log('Submitting form using form.submit()');
            form.submit();
            return true;
          }
          console.log('No form found for form_submit method');
          return false;
          
        case 'button_click':
          // Find and click a specific submit button
          if (strategy.buttonSelector) {
            const button = document.querySelector(strategy.buttonSelector);
            if (button) {
              console.log('Clicking submit button:', strategy.buttonSelector);
              button.click();
              return true;
            }
          }
          // Fallback: look for common submit button patterns
          const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], button:contains("Search"), button:contains("Submit")');
          if (submitBtn) {
            console.log('Clicking found submit button');
            submitBtn.click();
            return true;
          }
          console.log('No submit button found');
          return false;
          
        case 'enter_key':
          // Synthesize Enter key press
          console.log('Synthesizing Enter key press');
          const keydown = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
          const keyup = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true });
          active.dispatchEvent(keydown);
          active.dispatchEvent(keyup);
          return true;
          
        case 'auto_submit':
          // Wait for auto-submission (some sites auto-submit on input)
          console.log('Waiting for auto-submission, wait time:', strategy.waitTime || 1000, 'ms');
          setTimeout(() => {
            console.log('Auto-submission wait completed');
          }, strategy.waitTime || 1000);
          return true;
          
        default:
          console.log('Unknown submission method:', strategy.method);
          return false;
      }
    } catch (error) {
      console.log('Form submission error:', error.message);
      return false;
    }
  })()`;
}

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
  onEvent?: (event: AgentEvent) => void;
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

  // LLM-driven image extraction strategy generator
  private async _generateImageExtractionStrategy(
    currentUrl: string,
    task: string,
    llm: ChatOpenAI,
  ): Promise<{ selectors: string[]; sizeFilter: boolean; urlPatterns: string[] }> {
    const strategyPrompt = `
You are analyzing a webpage to determine the best strategy for extracting relevant images based on the user's task.

**Current URL:** ${currentUrl}
**User Task:** ${task}

Based on the URL and task, generate a smart image extraction strategy. Consider:
1. What type of website this appears to be (search engine, social media, e-commerce, news, etc.)
2. What CSS selectors would target the most relevant images for this task
3. Whether to filter by image size (to avoid UI elements)
4. What URL patterns indicate the images are content vs UI elements

Respond with ONLY a JSON object in this exact format:
{
  "selectors": ["selector1", "selector2", "selector3"],
  "sizeFilter": true,
  "urlPatterns": ["pattern1", "pattern2"]
}

Examples:
- For Google Images: {"selectors": ["img[src*='googleusercontent']", "[data-src*='images']"], "sizeFilter": true, "urlPatterns": ["googleusercontent", "gstatic"]}
- For Reddit: {"selectors": ["img[src*='redd.it']", ".ImageBox-image", "[data-test-id='post-content'] img"], "sizeFilter": false, "urlPatterns": ["redd.it", "imgur", "redgifs"]}
- For news sites: {"selectors": ["article img", ".content img", "main img"], "sizeFilter": true, "urlPatterns": ["cdn", "media", "images"]}`;

    try {
      const response = await llm.invoke(strategyPrompt);
      const result = JSON.parse(response.content as string);
      console.log(
        `[_generateImageExtractionStrategy] LLM generated strategy: ${JSON.stringify(result)} #####`,
      );
      return result;
    } catch (error) {
      console.log(`[_generateImageExtractionStrategy] LLM error, using fallback: ${error} #####`);
      // Intelligent fallback based on URL analysis
      const url = currentUrl.toLowerCase();
      if (url.includes('google.com') && url.includes('images')) {
        return {
          selectors: [
            "img[src*='googleusercontent']",
            "img[src*='gstatic']",
            "img[src*='images']",
            'img[data-src]',
            "img[src]:not([src*='logo']):not([src*='icon'])",
          ],
          sizeFilter: true,
          urlPatterns: ['googleusercontent', 'gstatic', 'imgur', 'wikimedia'],
        };
      } else if (url.includes('duckduckgo.com')) {
        return {
          selectors: ["img[src*='external-content.duckduckgo.com']", '.tile--img__img'],
          sizeFilter: true,
          urlPatterns: ['external-content.duckduckgo.com', 'bing.com'],
        };
      } else if (url.includes('reddit.com')) {
        return {
          selectors: [
            "img[src*='redd.it']",
            '.ImageBox-image',
            "[data-test-id='post-content'] img",
          ],
          sizeFilter: false,
          urlPatterns: ['redd.it', 'imgur', 'redgifs'],
        };
      } else {
        // Generic strategy for unknown sites
        return {
          selectors: ['img', 'picture img', 'figure img'],
          sizeFilter: true,
          urlPatterns: ['cdn', 'media', 'images', 'static'],
        };
      }
    }
  }

  // LLM-driven form submission strategy generator
  private async _generateFormSubmissionStrategy(
    currentUrl: string,
    inputText: string,
    llm: ChatOpenAI,
  ): Promise<{
    method: 'form_submit' | 'enter_key' | 'button_click' | 'auto_submit';
    buttonSelector?: string;
    waitTime?: number;
  }> {
    const submissionPrompt = `
You are analyzing a webpage to determine the best strategy for submitting a form after typing text into an input field.

**Current URL:** ${currentUrl}
**Text that was typed:** ${inputText}

Based on the URL and context, determine the most appropriate form submission method. Consider:
1. What type of website this appears to be (search engine, login form, contact form, etc.)
2. Whether this is likely a search input that expects Enter key or button click
3. Whether the site might auto-submit after typing
4. The most reliable submission method for this type of site

Respond with ONLY a JSON object in this exact format:
{
  "method": "form_submit|enter_key|button_click|auto_submit",
  "buttonSelector": "optional CSS selector for button",
  "waitTime": "optional wait time in ms for auto_submit"
}

Examples:
- For search engines: {"method": "enter_key"}
- For forms with visible submit buttons: {"method": "button_click", "buttonSelector": "button[type='submit']"}
- For complex forms: {"method": "form_submit"}
- For auto-complete search: {"method": "auto_submit", "waitTime": 500}`;

    try {
      const response = await llm.invoke(submissionPrompt);
      const result = JSON.parse(response.content as string);
      console.log(
        `[_generateFormSubmissionStrategy] LLM generated strategy: ${JSON.stringify(result)} #####`,
      );
      return result;
    } catch (error) {
      console.log(`[_generateFormSubmissionStrategy] LLM error, using fallback: ${error} #####`);
      // Intelligent fallback based on URL and text analysis
      const url = currentUrl.toLowerCase();
      const text = inputText.toLowerCase();

      if (
        url.includes('google.com') ||
        url.includes('duckduckgo.com') ||
        url.includes('bing.com')
      ) {
        // Search engines typically work with Enter key
        return { method: 'enter_key' };
      } else if (text.includes('search') || url.includes('search')) {
        // Likely a search box
        return { method: 'enter_key' };
      } else if (url.includes('login') || url.includes('auth') || text.includes('password')) {
        // Login forms often need button clicks
        return {
          method: 'button_click',
          buttonSelector: 'button[type="submit"], input[type="submit"]',
        };
      } else {
        // Generic form submission
        return { method: 'form_submit' };
      }
    }
  }

  async runBabyElephantAgentV2(
    task: string,
    apiKey: string,
    options: BabyElephantAgentV2Options = {},
  ): Promise<string> {
    // Event handler to broadcast agent events globally
    const handleAgentEvent = (event: AgentEvent) => {
      console.log(
        `##### [Agent Step ${event.step}] ${event.phase.toUpperCase()}: ${event.message} #####`,
      );

      // Enhanced logging for search plan events
      if (event.details && event.message.includes('Animal Analysis Complete')) {
        console.log('🧠 Intelligent Task Analysis Result:', {
          canonical: event.details.canonical,
          juvenile: event.details.juvenile,
          query: event.details.query,
          engine: event.details.engine,
          confidence: event.details.confidence,
        });
      }

      // Note: ServiceConsole logging is now handled by the VS Code event subscription in the hook
      // to avoid duplicate messages. Window events removed to prevent duplication.
    };
    try {
      const { driver, domInteractionsOperator, a11yTreeSnapshotTaker } = this.dependencies;

      // Create LLM instance for intelligent decision making
      const llm = new ChatOpenAI({
        apiKey,
        model: options.devMode ? 'gpt-4o-mini' : 'gpt-4o',
        temperature: 0,
      });

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
            console.log('🧠 Starting enhanced image URL extraction... #####');

            // Step 1: Comprehensive client-side collection of ALL image candidates
            const candidateCollectionScript = `
(function() {
  const candidates = new Set();
  
  // Function to decode DuckDuckGo proxy URLs
  function decodeDuckDuckGoUrl(url) {
    try {
      if (url.includes('external-content.duckduckgo.com/iu/?u=')) {
        const match = url.match(/[?&]u=([^&]+)/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }
      return url;
    } catch (e) {
      return url;
    }
  }
  
  // Function to extract URLs from srcset
  function extractFromSrcset(srcset) {
    if (!srcset) return [];
    return srcset.split(',')
      .map(entry => entry.trim().split(' ')[0])
      .filter(url => url && url.startsWith('http'));
  }
  
  // Collect from IMG elements
  document.querySelectorAll('img').forEach(img => {
    // Main src
    if (img.src && img.src.startsWith('http')) {
      candidates.add(decodeDuckDuckGoUrl(img.src));
    }
    
    // currentSrc (often different from src for responsive images)
    if (img.currentSrc && img.currentSrc.startsWith('http')) {
      candidates.add(decodeDuckDuckGoUrl(img.currentSrc));
    }
    
    // data-src for lazy loading
    if (img.dataset.src && img.dataset.src.startsWith('http')) {
      candidates.add(decodeDuckDuckGoUrl(img.dataset.src));
    }
    
    // Other common lazy-loading attributes
    ['data-lazy-src', 'data-original', 'data-source'].forEach(attr => {
      const val = img.getAttribute(attr);
      if (val && val.startsWith('http')) {
        candidates.add(decodeDuckDuckGoUrl(val));
      }
    });
    
    // srcset entries
    extractFromSrcset(img.srcset).forEach(url => {
      candidates.add(decodeDuckDuckGoUrl(url));
    });
    
    // data-srcset
    extractFromSrcset(img.dataset.srcset).forEach(url => {
      candidates.add(decodeDuckDuckGoUrl(url));
    });
  });
  
  // Filter and return array
  return Array.from(candidates)
    .filter(url => {
      // Remove data URLs, tiny images, and common UI elements
      if (url.startsWith('data:')) return false;
      if (url.includes('1x1') || url.includes('spacer') || url.includes('pixel')) return false;
      if (url.includes('icon') || url.includes('logo') || url.includes('avatar')) return false;
      return true;
    })
    .slice(0, 50); // Limit to 50 candidates for performance
})()
            `;

            // Execute the comprehensive collection script
            const candidateUrls = await driver.executeScript<string[]>(candidateCollectionScript);
            console.log('🧠 Client-side collector found:', candidateUrls.length, 'candidate URLs');
            console.log('🧠 Sample candidates:', candidateUrls.slice(0, 5));

            if (candidateUrls.length === 0) {
              return `❌ Found 0 image URLs. No images detected on the page.`;
            }

            // Step 2: Use LLM to filter and rank the candidates
            const currentUrl = await this.dependencies.getCurrentPageUrl();
            const filterPrompt = `
You are filtering image URLs for relevance to a user's task.

**User Task:** ${task}
**Current URL:** ${currentUrl}
**Image URL Candidates (${candidateUrls.length} total):**
${candidateUrls
  .slice(0, 30)
  .map((url, i) => `${i + 1}. ${url}`)
  .join('\\n')}
${candidateUrls.length > 30 ? `... and ${candidateUrls.length - 30} more URLs` : ''}

Instructions:
1. Select the most relevant image URLs that match the user's task
2. Prioritize high-quality, content images over thumbnails
3. Avoid UI elements, icons, ads, or unrelated images  
4. Return 8-15 of the best URLs
5. Return ONLY a JSON array of selected URLs

Example: ["https://example.com/relevant1.jpg", "https://example.com/relevant2.png"]`;

            try {
              const response = await llm.invoke(filterPrompt);
              const responseText = response.content as string;

              console.log('🧠 LLM filter response:', responseText.substring(0, 200), '...');

              // Parse LLM response
              let selectedUrls: string[] = [];
              try {
                const jsonMatch = responseText.match(/\\[.*\\]/s);
                if (jsonMatch) {
                  selectedUrls = JSON.parse(jsonMatch[0]);
                }
              } catch (parseError) {
                console.log('🧠 LLM filter parse failed, using first 10 candidates');
                selectedUrls = candidateUrls.slice(0, 10);
              }

              // Validate selected URLs are from our candidates
              const validSelected = selectedUrls.filter(
                url => candidateUrls.includes(url) && url.startsWith('http'),
              );

              if (validSelected.length === 0) {
                // Fallback to best candidates if LLM filtering failed
                validSelected.push(...candidateUrls.slice(0, 8));
              }

              const finalUrls = validSelected.slice(0, 15); // Limit to 15 final URLs

              console.log('🧠 Enhanced extraction completed, found:', finalUrls.length, 'URLs');
              console.log('🧠 Final URLs:', finalUrls.slice(0, 3));

              const successMessage = `✅ SUCCESS: Found ${finalUrls.length} image URLs: ${finalUrls.slice(0, 3).join(', ')}${finalUrls.length > 3 ? ` ... and ${finalUrls.length - 3} more` : ''}`;
              console.log('🧠 Returning success message:', successMessage);
              return successMessage;
            } catch (llmError) {
              console.error('🧠 LLM filtering failed, using raw candidates:', llmError);
              const fallbackUrls = candidateUrls.slice(0, 10);
              return `✅ SUCCESS: Found ${fallbackUrls.length} image URLs: ${fallbackUrls.slice(0, 3).join(', ')}${fallbackUrls.length > 3 ? ` ... and ${fallbackUrls.length - 3} more` : ''}`;
            }
          } catch (error) {
            console.error('🧠 Enhanced extraction failed completely:', error);
            return `❌ Image extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
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

            // LLM-driven form submission strategy
            try {
              console.log('🤖 Using LLM-driven form submission strategy... #####');
              const currentUrl = await this.dependencies.getCurrentPageUrl();
              const submissionStrategy = await this._generateFormSubmissionStrategy(
                currentUrl,
                text,
                llm,
              );

              // Execute the LLM-generated submission strategy
              const submitted = await driver.executeScript<boolean>(
                createFormSubmissionScript(submissionStrategy),
              );

              console.log(`LLM-driven form submission completed, success: ${submitted} #####`);
            } catch (error) {
              console.log(`LLM-driven form submission failed, using fallback: ${error} #####`);
              // Fallback to simple Enter key approach
              await driver.executeScript<boolean>(`(function() {
                const active = document.activeElement;
                if (active) {
                  const kd = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                  const ku = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true });
                  active.dispatchEvent(kd);
                  active.dispatchEvent(ku);
                  return true;
                }
                return false;
              })()`);
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
          // Call the global event handler (for internal console logging)
          handleAgentEvent(event);

          // Call the external event handler if provided (for VS Code event forwarding)
          if (options.onEvent) {
            options.onEvent(event);
          }
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
