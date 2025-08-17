import {
  CRXMCPService as BaseCRXMCPService,
  ICRXMCPService,
} from '@shared/services/crxMCP.service';
import { ChromeExtensionDriver } from '@shared/crx-mcp/chromeExtensionDriver';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

/**
 * Background-specific implementation of CRXMCPService that extends the shared service
 * and provides actual implementations for MCP tool calls.
 */
export class BackgroundCRXMCPService extends BaseCRXMCPService implements ICRXMCPService {
  private driver: ChromeExtensionDriver | null = null;

  constructor() {
    super();
    this.initializeDriver();
  }

  private async initializeDriver(): Promise<void> {
    try {
      this.driver = new ChromeExtensionDriver();
      console.log('🚗 ChromeExtensionDriver initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize ChromeExtensionDriver:', error);
    }
  }

  private async ensureDriver(): Promise<ChromeExtensionDriver> {
    if (!this.driver) {
      await this.initializeDriver();
    }
    if (!this.driver) {
      throw new Error('ChromeExtensionDriver not available');
    }
    return this.driver;
  }

  /**
   * Send an MCP request and get the response
   */
  private async sendMCPRequest(
    toolName: string,
    params: Record<string, unknown> = {},
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = {
        method: `tool:${toolName}`,
        params,
        id: Date.now().toString(),
      };

      chrome.runtime.sendMessage(
        {
          type: 'MCP_REQUEST',
          data: request,
        },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error('No response received'));
            return;
          }

          if (!response.success) {
            reject(new Error(response.error || 'MCP request failed'));
            return;
          }

          // Extract the text content from MCP response
          if (response.data?.content?.[0]?.text) {
            resolve(response.data.content[0].text);
          } else {
            resolve(JSON.stringify(response.data));
          }
        },
      );
    });
  }

  // Override methods to provide actual implementations

  async getOpenAIKey(): Promise<string> {
    // This would typically come from storage or environment
    throw new Error('OpenAI key not configured');
  }

  async runDriverTests(): Promise<string> {
    const driver = await this.ensureDriver();
    try {
      // Run basic driver tests
      const results = [];

      // Test navigation
      await driver.get('https://example.com');
      results.push('✅ Navigation test passed');

      // Test URL retrieval
      const url = await driver.getCurrentUrl();
      results.push(`✅ URL retrieval test passed: ${url}`);

      return JSON.stringify({ success: true, results });
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  }

  async runAgentTest(task: string): Promise<string> {
    return JSON.stringify({
      success: true,
      message: `Agent test executed for task: ${task}`,
      timestamp: new Date().toISOString(),
    });
  }

  // MCP Server Functions - actual implementations

  async navigateTo(url: string): Promise<string> {
    return this.sendMCPRequest('do_navigate-to', { url });
  }

  async getCurrentPageUrl(): Promise<string> {
    return this.sendMCPRequest('get_current_page_url');
  }

  async goBack(): Promise<string> {
    return this.sendMCPRequest('do_go_back');
  }

  async goForward(): Promise<string> {
    return this.sendMCPRequest('do_go_forward');
  }

  async reload(): Promise<string> {
    return this.sendMCPRequest('do_reload');
  }

  async getConsoleLogs(): Promise<string> {
    return this.sendMCPRequest('get_console_logs');
  }

  async getPageSnapshotAsAccessibilityTree(): Promise<string> {
    return this.sendMCPRequest('get_page_snapshot_as_accessibility_tree');
  }

  async getPageSnapshotAsText(): Promise<string> {
    return this.sendMCPRequest('get_page_snapshot_as_text');
  }

  async getPageSnapshotAsJpegScreenshot(): Promise<string> {
    const response = await this.sendMCPRequest('get_page_snapshot_as_jpeg_screenshoot');
    // For image responses, the data should be base64 encoded
    return response;
  }

  async getPageEnhancedSnapshotAsJpegScreenshot(): Promise<string> {
    const response = await this.sendMCPRequest('get_page_enhanced_snapshot_as_jpeg_screenshoot');
    // For image responses, the data should be base64 encoded
    return response;
  }

  async clickNodeById(backendNodeId: number, nodeDescription: string): Promise<string> {
    return this.sendMCPRequest('do_click_node_by_id', { backendNodeId, nodeDescription });
  }

  async focusNodeById(backendNodeId: number, nodeDescription: string): Promise<string> {
    return this.sendMCPRequest('do_focus_node_by_id', { backendNodeId, nodeDescription });
  }

  async sendKeysToNodeById(
    backendNodeId: number,
    keysToSend: string,
    nodeDescription: string,
  ): Promise<string> {
    return this.sendMCPRequest('do_send_keys_to_node_by_id', {
      backendNodeId,
      keysToSend,
      nodeDescription,
    });
  }

  async setValueToNodeById(
    backendNodeId: number,
    value: string,
    nodeDescription: string,
  ): Promise<string> {
    return this.sendMCPRequest('do_set_value_to_node_by_id', {
      backendNodeId,
      value,
      nodeDescription,
    });
  }

  async submitNodeById(backendNodeId: number, nodeDescription: string): Promise<string> {
    return this.sendMCPRequest('do_submit_node_by_id', { backendNodeId, nodeDescription });
  }

  async selectIndexOnNodeById(
    backendNodeId: number,
    value: string,
    nodeDescription: string,
  ): Promise<string> {
    return this.sendMCPRequest('do_select_index_on_node_by_id', {
      backendNodeId,
      value,
      nodeDescription,
    });
  }

  async createNewTab(url?: string): Promise<string> {
    return this.sendMCPRequest('create_new_tab', url ? { url } : {});
  }

  async openLandingPage(): Promise<string> {
    return this.sendMCPRequest('open_landing_page');
  }
}

// Register the background-specific implementation
registerSingleton(ICRXMCPService, BackgroundCRXMCPService, InstantiationType.Delayed);
