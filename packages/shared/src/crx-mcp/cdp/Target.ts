import { ChromeExtensionDriver, CDPSession } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type TargetInfo = Protocol.Target.TargetInfo;
export type TargetID = Protocol.Target.TargetID;
export type SessionID = Protocol.Target.SessionID;

export class Target {
  private driver: ChromeExtensionDriver;
  private cdpSession!: CDPSession;
  private messages: string[];

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
    this.messages = [];
  }

  async init(cdpSession: CDPSession) {
    this.cdpSession = cdpSession;

    // Target.setDiscoverTargets is not available in Chrome extension context
    // Skip this command to avoid "Not allowed" errors
    try {
      await this.cdpSession.send('Target.setDiscoverTargets', { discover: true });
    } catch (error) {
      console.log('Target.setDiscoverTargets not available in extension context, skipping');
    }

    // Set up event listener for target info changes
    this.cdpSession.on('Target.targetInfoChanged', (params: unknown) => {
      const event = params as Protocol.Target.TargetInfoChangedEvent;
      /*
        {
          method: 'Target.targetInfoChanged',
          params: {
            targetInfo: {
              targetId: '5C1EA5940A0FE83B0911E8E23C3B7902',
              type: 'page',
              title: 'news.ycombinator.com',
              url: 'https://news.ycombinator.com/',
              attached: false,
              openerId: '50967E65E84B1C4A373B2E30E4E8D748',
              canAccessOpener: false,
              openerFrameId: '50967E65E84B1C4A373B2E30E4E8D748',
              browserContextId: '56D2B65815F1C27DCE52EF5F75EE0EB1'
            }
          },
          sessionId: '6F18A49BF1D7521FF0EAD3364B95094E'
        }
      */
      this.messages.push('Target URL changed to ' + event.targetInfo.url);
    });
  }

  async clearMessages() {
    await this.driver.sendAndGetDevToolsCommand('Console.clearMessages');
  }

  getMessages() {
    let toReturn = '';
    if (this.messages.length !== 0) {
      toReturn = 'The target URL updated: ' + JSON.stringify(this.messages);
    }
    this.messages = [];
    return toReturn;
  }
}
