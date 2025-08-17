import { ChromeExtensionDriver, CDPSession } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type ConsoleMessage = Protocol.Console.ConsoleMessage;
export type ConsoleMessageSource = Protocol.Console.ConsoleMessageSource;
export type ConsoleMessageLevel = Protocol.Console.ConsoleMessageLevel;

export class Console {
  private driver: ChromeExtensionDriver;
  private cdpSession!: CDPSession; // Will be initialized in init()
  private messages: Protocol.Console.MessageAddedEvent[];

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
    this.messages = [];
  }

  async init(cdpSession: CDPSession) {
    this.cdpSession = cdpSession;
    await this.driver.sendAndGetDevToolsCommand('Console.enable');

    // Set up event listener for console messages using the typed session
    this.cdpSession.on('Console.messageAdded', (params: unknown) => {
      this.messages.push(params as Protocol.Console.MessageAddedEvent);
    });
  }

  async clearMessages() {
    await this.driver.sendAndGetDevToolsCommand('Console.clearMessages');
  }

  getMessages() {
    let toReturn = '';
    if (this.messages.length !== 0) {
      toReturn =
        'The following logs appeared in console: ' +
        JSON.stringify(
          this.messages.map((msg: Protocol.Console.MessageAddedEvent) => {
            const message = msg.message;
            return (
              message.level +
              ' (' +
              message.source +
              '#' +
              message.line +
              ':' +
              message.column +
              '): ' +
              message.text
            );
          }),
        );
    }
    this.messages = [];
    return toReturn;
  }
}
