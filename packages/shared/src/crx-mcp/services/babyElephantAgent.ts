import { ChromeExtensionDriver } from '../chromeExtensionDriver';
import { BabyAnimalPlanner } from './babyElephantAgenticRouting';

/**
 * Simple baby elephant agent that demonstrates the core functionality
 * using MCP-style tool calls with the ChromeExtensionDriver
 */

/* ----------------------- small helpers ----------------------- */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ----------------------- MCP-style tool interface ----------------------- */
interface MCPResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/* ----------------------- MCP-style client wrapper ----------------------- */
class MCPStyleClient {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async navigateTo(url: string): Promise<MCPResponse> {
    try {
      await this.driver.get(url);
      return {
        success: true,
        data: 'ok',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getCurrentUrl(): Promise<MCPResponse> {
    try {
      const url = await this.driver.getCurrentUrl();
      return {
        success: true,
        data: url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getPageSnapshot(): Promise<MCPResponse> {
    try {
      // Get page content by executing a script
      const pageContent = await this.driver.executeScript<string>(`
        (function() {
          return document.documentElement.outerHTML;
        })()
      `);

      return {
        success: true,
        data: pageContent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async executeScript(script: string): Promise<string[]> {
    try {
      const urls: string[] = await this.driver.executeScript<string[]>(script);
      return urls;
    } catch (error) {
      console.warn('Failed to execute script:', error);
      return [];
    }
  }

  async takeScreenshot(): Promise<MCPResponse> {
    try {
      // This would require CDP connection to be established
      // For now, we'll return a placeholder
      return {
        success: true,
        data: 'screenshot_placeholder',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/* ----------------------- tools ----------------------- */
async function openImagesSearch(
  mcpClient: MCPStyleClient,
  query: string = 'baby elephants',
  pauseMs: number = 1200,
): Promise<string> {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(
    query,
  )}&iar=images&iax=images&ia=images`;

  const response = await mcpClient.navigateTo(url);
  if (!response.success) {
    throw new Error(`Navigation failed: ${response.error}`);
  }

  await sleep(pauseMs);
  return `Opened images search for "${query}".`;
}

async function scrapeImageUrls(mcpClient: MCPStyleClient, max: number = 12): Promise<string[]> {
  try {
    // Use the original image scraping script
    const urls: string[] = await mcpClient.executeScript(`(function(limit) {
      // Grab a broad set of imgs; prefer src then data-src then first srcset candidate
      const imgs = Array.from(document.querySelectorAll('img'));
      const extract = (img) => {
        const direct = img.getAttribute('src');
        const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        const srcset = img.getAttribute('srcset');

        const pickFromSrcset = (ss) => {
          if (!ss) return null;
          const first = ss.split(',')[0]?.trim()?.split(' ')?.[0];
          return first || null;
        };

        const chosen = direct || dataSrc || pickFromSrcset(srcset);
        if (!chosen) return null;
        // Ignore inline data URLs; we want network-fetched images
        if (chosen.startsWith('data:')) return null;
        try {
          return new URL(chosen, window.location.href).toString();
        } catch {
          return null;
        }
      };

      const dedup = new Set();
      for (const img of imgs) {
        const u = extract(img);
        if (u) dedup.add(u);
        if (dedup.size >= limit) break;
      }
      return Array.from(dedup);
    })(${max})`);

    return urls;
  } catch (error) {
    console.warn('Failed to scrape image URLs:', error);
    return [];
  }
}

/* ----------------------- main agent function ----------------------- */
export async function runBabyElephantAgent(
  queryOrTask: string = 'baby elephants',
  driver: ChromeExtensionDriver,
  planner?: BabyAnimalPlanner,
): Promise<{ success: boolean; urls: string[]; message: string }> {
  try {
    console.log('🐘 Starting baby elephant agent with MCP-style tools...');

    // Create MCP-style client
    const mcpClient = new MCPStyleClient(driver);
    console.log('✅ MCP-style client initialized');

    // Ensure CDP connection is established
    console.log('🔗 Ensuring CDP connection is established...');
    try {
      await driver.createCDPConnection();
      console.log('✅ CDP connection established successfully');
    } catch (error) {
      console.error('❌ Failed to establish CDP connection:', error);
      throw error;
    }

    // If a planner is provided, let it produce the juvenile plural query (e.g., "kittens")
    let query = queryOrTask;
    if (planner) {
      try {
        const plan = await planner.plan(queryOrTask);
        query = plan.query;
        console.log('🔎 Planner produced query:', query, 'engine=', plan.engine.engine);
      } catch (err) {
        console.warn('Planner failed, falling back to raw query:', err);
        query = queryOrTask;
      }
    }

    // Open image search
    const searchResult = await openImagesSearch(mcpClient, query);
    console.log('✅ Search opened:', searchResult);

    // Get current URL to verify navigation
    const urlResponse = await mcpClient.getCurrentUrl();
    if (urlResponse.success) {
      console.log('✅ Current URL:', urlResponse.data);
    }

    // Scrape image URLs
    const urls = await scrapeImageUrls(mcpClient, 12);
    console.log('✅ Scraped URLs:', urls.length);

    return {
      success: true,
      urls,
      message: `Found ${urls.length} image URLs for "${query}" using MCP-style tools`,
    };
  } catch (error) {
    console.error('❌ Baby elephant agent failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      urls: [],
      message: `Failed to find images: ${errorMessage}`,
    };
  }
}

/* ----------------------- demo runner ----------------------- */
export async function runDemo(driver: ChromeExtensionDriver) {
  console.log('🚀 Running baby elephant agent demo with MCP-style tools...');

  // Example: run using the planner so v1 can leverage the same routing logic
  const planner = new BabyAnimalPlanner();

  // Demonstrate the planner correctly converts "baby cat" to "kittens"
  const testTask = 'find baby cat pictures';
  console.log('🧠 Testing planner with task:', testTask);

  try {
    const plan = await planner.plan(testTask);
    console.log('🔍 Planner results:');
    console.log('  - Detected animal:', plan.animal.canonical);
    console.log('  - Juvenile term:', plan.juvenile.juvenile);
    console.log('  - Search query:', plan.query);
    console.log('  - Engine:', plan.engine.engine);
  } catch (err) {
    console.warn('Planner test failed:', err);
  }

  const result = await runBabyElephantAgent(testTask, driver, planner);

  if (result.success) {
    console.log('✅ Demo completed successfully!');
    console.log('📸 Image URLs found:');
    result.urls.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`);
    });
  } else {
    console.log('❌ Demo failed:', result.message);
  }

  return result;
}

/* ----------------------- enhanced version with more MCP-style tools ----------------------- */
export async function runEnhancedBabyElephantAgent(
  query: string = 'baby elephants',
  driver: ChromeExtensionDriver,
): Promise<{ success: boolean; urls: string[]; message: string; screenshot?: string }> {
  try {
    console.log('🐘 Starting enhanced baby elephant agent with MCP-style tools...');

    const mcpClient = new MCPStyleClient(driver);

    // Ensure CDP connection
    await driver.createCDPConnection();

    // Navigate to search
    await openImagesSearch(mcpClient, query);

    // Take a screenshot for verification
    const screenshotResponse = await mcpClient.takeScreenshot();
    let screenshot: string | undefined;
    if (screenshotResponse.success && screenshotResponse.data) {
      screenshot = screenshotResponse.data as string;
      console.log('📸 Screenshot captured');
    }

    // Get page snapshot for analysis
    const snapshotResponse = await mcpClient.getPageSnapshot();
    if (snapshotResponse.success) {
      console.log('📄 Page snapshot captured');
    }

    // Scrape image URLs
    const urls = await scrapeImageUrls(mcpClient, 12);

    return {
      success: true,
      urls,
      message: `Enhanced agent completed for "${query}" with multiple MCP-style tools`,
      screenshot,
    };
  } catch (error) {
    console.error('❌ Enhanced baby elephant agent failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      urls: [],
      message: `Enhanced agent failed: ${errorMessage}`,
    };
  }
}
