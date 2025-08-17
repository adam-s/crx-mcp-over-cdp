import { ChromeExtensionDriver, CDPSession } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type NetworkEvent =
  | Protocol.Network.RequestWillBeSentEvent
  | Protocol.Network.LoadingFailedEvent
  | Protocol.Network.LoadingFinishedEvent
  | Protocol.Network.ResponseReceivedEvent;

export class Network {
  private driver: ChromeExtensionDriver;
  private cdpSession!: CDPSession;
  private messages: NetworkEvent[];

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
    this.messages = [];
  }

  async init(cdpSession: CDPSession) {
    this.cdpSession = cdpSession;
    await this.cdpSession.send('Network.enable');

    // Set up event listeners for network events
    this.cdpSession.on('Network.requestWillBeSent', (params: unknown) => {
      this.messages.push(params as Protocol.Network.RequestWillBeSentEvent);
    });

    this.cdpSession.on('Network.loadingFailed', (params: unknown) => {
      this.messages.push(params as Protocol.Network.LoadingFailedEvent);
    });

    this.cdpSession.on('Network.loadingFinished', (params: unknown) => {
      this.messages.push(params as Protocol.Network.LoadingFinishedEvent);
    });

    this.cdpSession.on('Network.responseReceived', (params: unknown) => {
      this.messages.push(params as Protocol.Network.ResponseReceivedEvent);
    });
  }

  getMessages() {
    let toReturn = '';
    if (this.messages.length !== 0) {
      toReturn =
        'The following requests ended ' +
        JSON.stringify(
          this.messages.map((entry: NetworkEvent) => {
            const responseEvent = entry as Protocol.Network.ResponseReceivedEvent;
            return {
              url: responseEvent.response?.url,
              status: responseEvent.response?.status,
            };
          }),
          null,
          2,
        );
    }

    this.messages = [];
    return toReturn;
  }
}
