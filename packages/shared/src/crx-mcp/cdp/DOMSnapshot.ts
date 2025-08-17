import { ChromeExtensionDriver } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type DOMSnapshotResult = Protocol.DOMSnapshot.CaptureSnapshotResponse;
export type DOMSnapshotResultGetSnapshot = Protocol.DOMSnapshot.GetSnapshotResponse;
export type DOMNode = Protocol.DOMSnapshot.DOMNode;

// Simple name/value property entry
export interface NameValue {
  name: string;
  value: string;
}

// LayoutTreeNode type definition matching CDP protocol
export interface LayoutTreeNode {
  domNodeIndex: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  layoutText: string;
  inlineTextNodes: Array<{
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    startCharacterIndex: number;
    numCharacters: number;
  }>;
  styleIndex: number;
  paintOrder?: number;
  isStackingContext: boolean;
}

// ComputedStyle type definition
export interface ComputedStyle {
  properties: NameValue[];
}

export class DOMSnapshot {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async enable() {
    await this.driver.sendAndGetDevToolsCommand('DOMSnapshot.enable');
  }

  async disable() {
    await this.driver.sendAndGetDevToolsCommand('DOMSnapshot.disable');
  }

  async captureSnapshot(
    computedStyles: string[],
    includePaintOrder?: boolean,
  ): Promise<DOMSnapshotResult> {
    return (await this.driver.sendAndGetDevToolsCommand('DOMSnapshot.captureSnapshot', {
      computedStyles,
      includePaintOrder,
    })) as DOMSnapshotResult;
  }

  async getSnapshot(
    computedStyleWhitelist: string[],
    includePaintOrder?: boolean,
  ): Promise<DOMSnapshotResultGetSnapshot> {
    return (await this.driver.sendAndGetDevToolsCommand('DOMSnapshot.getSnapshot', {
      computedStyleWhitelist,
      includePaintOrder,
    })) as DOMSnapshotResultGetSnapshot;
  }
}
