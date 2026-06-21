import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ILocalAsyncStorage } from '../storage/localAsyncStorage/localAsyncStorage.service';
import { ChromeExtensionDriver } from '../crx-mcp/chromeExtensionDriver';
import { CDP } from '../crx-mcp/CDP';
import { DomInteractionsOperator } from '../crx-mcp/DomInteractionsOperator';
import { DomSnapshotTaker } from '../crx-mcp/DomSnapshotTaker';
import { BabyElephantAgentV2Service } from '../crx-mcp/services/babyElephantAgentV2Service';
import { VisualSnapshotTaker } from '../crx-mcp/VisualSnapshotTaker';
import { A11yTreeSnapshotTaker } from '../crx-mcp/A11yTreeSnapshotTaker';
import {
  runBabyElephantAgent,
  runEnhancedBabyElephantAgent,
} from '../crx-mcp/services/babyElephantAgent';
import { BabyAnimalPlanner } from '../crx-mcp/services/babyElephantAgenticRouting';
import { DriverTestSuite } from '../crx-mcp/driverTest';
import { StorageKeys, type SidePanelAppStorageSchema } from '../storage/types/storage.types';
import { type AgentEvent } from '../crx-mcp/services/babyElephantAgent.v2';

export const ICRXMCPService = createDecorator<ICRXMCPService>('crxMCPService');

export interface ICRXMCPService {
  readonly _serviceBrand: undefined;

  // Events
  readonly onAgentEvent: Event<AgentEvent>;

  getOpenAIKey(): Promise<string>;
  setOpenAIKey(apiKey: string): Promise<void>;
  runDriverTests(): Promise<string>; // Changed to return string for JSON serialization
  runAgentTest(task: string): Promise<string>; // Changed to return string for JSON serialization
  runBabyElephantAgent(
    query?: string,
  ): Promise<{ success: boolean; urls: string[]; message: string }>;
  runBabyElephantAgentV2(
    task: string,
    options?: { startUrl?: string; maxSteps?: number; devMode?: boolean },
  ): Promise<string>;

  // MCP Server Functions
  navigateTo(url: string): Promise<string>;
  getCurrentPageUrl(): Promise<string>;
  goBack(): Promise<string>;
  goForward(): Promise<string>;
  reload(): Promise<string>;
  getConsoleLogs(): Promise<string>;
  getPageSnapshotAsAccessibilityTree(): Promise<string>;
  getPageSnapshotAsText(): Promise<string>;
  getPageSnapshotAsJpegScreenshot(): Promise<string>;
  getPageEnhancedSnapshotAsJpegScreenshot(): Promise<string>;
  clickNodeById(backendNodeId: number, nodeDescription: string): Promise<string>;
  focusNodeById(backendNodeId: number, nodeDescription: string): Promise<string>;
  sendKeysToNodeById(
    backendNodeId: number,
    keysToSend: string,
    nodeDescription: string,
  ): Promise<string>;
  setValueToNodeById(
    backendNodeId: number,
    value: string,
    nodeDescription: string,
  ): Promise<string>;
  submitNodeById(backendNodeId: number, nodeDescription: string): Promise<string>;
  selectIndexOnNodeById(
    backendNodeId: number,
    value: string,
    nodeDescription: string,
  ): Promise<string>;
  createNewTab(url?: string): Promise<string>;
  openLandingPage(): Promise<string>;

  // Test method to verify event streaming
  testAgentEvents(): void;
}

export class CRXMCPService implements ICRXMCPService {
  readonly _serviceBrand: undefined;

  private readonly _onAgentEvent = new Emitter<AgentEvent>();
  readonly onAgentEvent = this._onAgentEvent.event;

  private static _sharedDriver: ChromeExtensionDriver | undefined;
  private _driver: ChromeExtensionDriver | undefined;
  private _cdp: CDP | undefined;
  private _domInteractionsOperator: DomInteractionsOperator | undefined;
  private _domSnapshotTaker: DomSnapshotTaker | undefined;
  private _visualSnapshotTaker: VisualSnapshotTaker | undefined;
  private _a11yTreeSnapshotTaker: A11yTreeSnapshotTaker | undefined;
  private _storageService: ILocalAsyncStorage<SidePanelAppStorageSchema>;
  private _babyElephantAgentV2Service: BabyElephantAgentV2Service | undefined;

  // Static method to set a shared driver instance
  static setSharedDriver(driver: ChromeExtensionDriver): void {
    console.log('🔗 Setting shared driver instance');
    CRXMCPService._sharedDriver = driver;
  }

  // Static method to get the shared driver instance
  static getSharedDriver(): ChromeExtensionDriver | undefined {
    return CRXMCPService._sharedDriver;
  }

  constructor(@ILocalAsyncStorage storageService: ILocalAsyncStorage<SidePanelAppStorageSchema>) {
    this._storageService = storageService;
    // Initialize the driver and CDP components
    this._initializeDriver();
  }

  private async _initializeDriver(): Promise<void> {
    if (!this._driver) {
      // Use shared driver if available, otherwise create new one
      if (CRXMCPService._sharedDriver) {
        console.log('🔄 Reusing existing shared driver instance');
        this._driver = CRXMCPService._sharedDriver;
      } else {
        console.log('🆕 Creating new driver instance');
        this._driver = new ChromeExtensionDriver();
        CRXMCPService._sharedDriver = this._driver;
      }

      this._cdp = new CDP(this._driver);

      // Initialize CDP first
      await this._cdp.init();

      // Initialize operators
      this._domInteractionsOperator = new DomInteractionsOperator(
        this._driver,
        this._cdp.dom,
        this._cdp.runtime,
        this._cdp.input,
      );
      this._domSnapshotTaker = new DomSnapshotTaker(
        this._domInteractionsOperator,
        this._cdp.domSnapshot,
      );
      this._visualSnapshotTaker = new VisualSnapshotTaker(
        this._cdp.page,
        this._cdp.dom,
        this._cdp.domDebugger,
        this._domInteractionsOperator,
      );
      this._a11yTreeSnapshotTaker = new A11yTreeSnapshotTaker(
        this._cdp.accessibility,
        this._cdp.dom,
        this._cdp.css,
      );

      // Initialize Baby Elephant Agent V2 Service
      this._babyElephantAgentV2Service = new BabyElephantAgentV2Service({
        driver: this._driver,
        domInteractionsOperator: this._domInteractionsOperator,
        a11yTreeSnapshotTaker: this._a11yTreeSnapshotTaker,
        getCurrentPageUrl: () => this.getCurrentPageUrl(),
        getPageSnapshotAsJpegScreenshot: () => this.getPageSnapshotAsJpegScreenshot(),
        navigateTo: (url: string) => this.navigateTo(url),
      });
    }
  }

  private async _ensureInitialized(): Promise<void> {
    if (
      !this._driver ||
      !this._cdp ||
      !this._domInteractionsOperator ||
      !this._babyElephantAgentV2Service
    ) {
      await this._initializeDriver();
    }
  }

  // Helper method to safely serialize results
  private _safeStringify(obj: unknown): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (error) {
      return `Error serializing result: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async getOpenAIKey(): Promise<string> {
    // Get the API key from persistent storage
    const apiKey = await this._storageService.get(StorageKeys.OPEN_AI_API_KEY);

    if (!apiKey) {
      throw new Error('OpenAI API key not found in storage. Please configure your API key.');
    }

    return apiKey;
  }

  async setOpenAIKey(apiKey: string): Promise<void> {
    // Store the API key in persistent storage
    await this._storageService.set(StorageKeys.OPEN_AI_API_KEY, apiKey);
  }

  async runDriverTests(): Promise<string> {
    try {
      await this._ensureInitialized();
      const testSuite = new DriverTestSuite(this._driver!);
      const results = await testSuite.runAllTests();
      return this._safeStringify(results);
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async runAgentTest(task: string): Promise<string> {
    try {
      await this._ensureInitialized();
      const result = await runEnhancedBabyElephantAgent(task, this._driver!);
      return this._safeStringify(result);
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async runBabyElephantAgent(
    query: string = 'baby elephants',
  ): Promise<{ success: boolean; urls: string[]; message: string }> {
    try {
      await this._ensureInitialized();

      // Use the planner to convert user input to proper juvenile query
      const planner = new BabyAnimalPlanner();
      const result = await runBabyElephantAgent(query, this._driver!, planner);
      return result;
    } catch (error) {
      return {
        success: false,
        urls: [],
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async runBabyElephantAgentV2(
    task: string,
    options: { startUrl?: string; maxSteps?: number; devMode?: boolean } = {},
  ): Promise<string> {
    try {
      await this._ensureInitialized();

      // Get API key
      const apiKey = await this.getOpenAIKey();
      // Create event handler that forwards events to our emitter
      const onEvent = (event: AgentEvent) => {
        this._onAgentEvent.fire(event);
      };

      // Delegate to the specialized service with event handler
      return await this._babyElephantAgentV2Service!.runBabyElephantAgentV2(task, apiKey, {
        ...options,
        onEvent,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'V2 Agent execution failed',
      });
    }
  }

  // MCP Server Functions - actual implementations
  async navigateTo(url: string): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._driver!.get(url);
      return this._safeStringify({ success: true, message: `Navigated to ${url}` });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getCurrentPageUrl(): Promise<string> {
    try {
      await this._ensureInitialized();
      const url = await this._driver!.getCurrentUrl();
      return this._safeStringify({ url });
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async goBack(): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._driver!.navigate().back();
      return this._safeStringify({ success: true, message: 'Navigated back' });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async goForward(): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._driver!.navigate().forward();
      return this._safeStringify({ success: true, message: 'Navigated forward' });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async reload(): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._driver!.navigate().refresh();
      return this._safeStringify({ success: true, message: 'Page reloaded' });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getConsoleLogs(): Promise<string> {
    try {
      await this._ensureInitialized();
      const logs = this._cdp!.console.getMessages();
      await this._cdp!.console.clearMessages();
      return this._safeStringify(logs);
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getPageSnapshotAsAccessibilityTree(): Promise<string> {
    try {
      await this._ensureInitialized();
      const snapshot = await this._a11yTreeSnapshotTaker!.takeSnapshot();
      return this._safeStringify(snapshot);
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getPageSnapshotAsText(): Promise<string> {
    try {
      await this._ensureInitialized();
      const snapshot = await this._domSnapshotTaker!.takeSnapshot();
      return this._safeStringify(snapshot);
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getPageSnapshotAsJpegScreenshot(): Promise<string> {
    try {
      await this._ensureInitialized();
      const screenshot = await this._cdp!.page.captureScreenshot();
      return this._safeStringify({ data: screenshot });
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getPageEnhancedSnapshotAsJpegScreenshot(): Promise<string> {
    try {
      await this._ensureInitialized();
      const imageBase64 = await this._cdp!.page.captureScreenshot();
      const domSnapshot = await this._cdp!.domSnapshot.getSnapshot(
        ['display', 'position', 'opacity'],
        true,
      );
      const enhancedImage = await this._visualSnapshotTaker!.drawRects(imageBase64, domSnapshot);
      return this._safeStringify({ data: enhancedImage });
    } catch (error) {
      return this._safeStringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async clickNodeById(backendNodeId: number, nodeDescription: string): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._domInteractionsOperator!.doClick(backendNodeId);
      return this._safeStringify({
        success: true,
        message: `Clicked node ${backendNodeId}: ${nodeDescription}`,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async focusNodeById(backendNodeId: number, nodeDescription: string): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._domInteractionsOperator!.doFocus(backendNodeId);
      return this._safeStringify({
        success: true,
        message: `Focused node ${backendNodeId}: ${nodeDescription}`,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendKeysToNodeById(
    backendNodeId: number,
    keysToSend: string,
    nodeDescription: string,
  ): Promise<string> {
    try {
      await this._ensureInitialized();
      // First set value, then focus and send keys
      await this._domInteractionsOperator!.doSetValue(backendNodeId, keysToSend);
      return this._safeStringify({
        success: true,
        message: `Sent keys "${keysToSend}" to node ${backendNodeId}: ${nodeDescription}`,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async setValueToNodeById(
    backendNodeId: number,
    value: string,
    nodeDescription: string,
  ): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._domInteractionsOperator!.doSetValue(backendNodeId, value);
      return this._safeStringify({
        success: true,
        message: `Set value "${value}" to node ${backendNodeId}: ${nodeDescription}`,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async submitNodeById(backendNodeId: number, nodeDescription: string): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._domInteractionsOperator!.doSubmit(backendNodeId);
      return this._safeStringify({
        success: true,
        message: `Submitted node ${backendNodeId}: ${nodeDescription}`,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async selectIndexOnNodeById(
    backendNodeId: number,
    value: string,
    nodeDescription: string,
  ): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._domInteractionsOperator!.doSelectOptionValue(backendNodeId, value);
      return this._safeStringify({
        success: true,
        message: `Selected option "${value}" on node ${backendNodeId}: ${nodeDescription}`,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createNewTab(url?: string): Promise<string> {
    try {
      await this._ensureInitialized();
      await this._driver!.createNewTab(url);
      return this._safeStringify({
        success: true,
        message: url ? `Created new tab with URL: ${url}` : 'Created new tab',
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async openLandingPage(): Promise<string> {
    try {
      await this._ensureInitialized();
      const landingUrl = this._driver!.getExtensionUrl('landing.html');
      await this._driver!.createNewTab(landingUrl);
      return this._safeStringify({
        success: true,
        message: `Opened landing page: ${landingUrl}`,
      });
    } catch (error) {
      return this._safeStringify({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Test method to verify event streaming
  testAgentEvents(): void {
    // Fire a few test events to verify the streaming works
    setTimeout(() => {
      this._onAgentEvent.fire({
        step: 1,
        phase: 'plan',
        message: 'Test event: Planning phase',
        details: { test: true },
      });
    }, 100);

    setTimeout(() => {
      this._onAgentEvent.fire({
        step: 2,
        phase: 'act',
        message: 'Test event: Action phase',
        details: { test: true },
      });
    }, 500);

    setTimeout(() => {
      this._onAgentEvent.fire({
        step: 3,
        phase: 'finish',
        message: 'Test event: Completion phase',
        details: { test: true },
      });
    }, 1000);
  }
}

registerSingleton(ICRXMCPService, CRXMCPService, InstantiationType.Delayed);
