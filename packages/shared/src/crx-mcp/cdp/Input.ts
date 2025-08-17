import { ChromeExtensionDriver } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type MouseButton = Protocol.Input.MouseButton;
export type GestureSourceType = Protocol.Input.GestureSourceType;
export type TimeSinceEpoch = Protocol.Input.TimeSinceEpoch;

export class Input {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async dispatchKeyEvent(
    type: Protocol.Input.DispatchKeyEventRequestType,
    modifiers?: number,
    text?: string,
    key?: string,
  ) {
    await this.driver.sendAndGetDevToolsCommand('Input.dispatchKeyEvent', {
      type,
      modifiers,
      text,
      key,
    });
  }
}
