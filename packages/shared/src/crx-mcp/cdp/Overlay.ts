import { ChromeExtensionDriver } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';
import * as DOM from './DOM';

// Re-export Protocol types for convenience
export type HighlightConfig = Protocol.Overlay.HighlightConfig;

export class Overlay {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async highlightNode(backendNodeId: DOM.BackendNodeId) {
    await this.driver.sendAndGetDevToolsCommand('Overlay.highlightNode', {
      backendNodeId,
      highlightConfig: {
        showInfo: true,
        showStyles: false,
        showRulers: false,
        showExtensionLines: false,
        contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
        paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
        borderColor: { r: 255, g: 229, b: 153, a: 0.8 },
        marginColor: { r: 255, g: 200, b: 200, a: 0.4 },
        eventTargetColor: { r: 255, g: 0, b: 0, a: 0.5 }, // Red semi-transparent,
      } as HighlightConfig,
    });
  }
}
