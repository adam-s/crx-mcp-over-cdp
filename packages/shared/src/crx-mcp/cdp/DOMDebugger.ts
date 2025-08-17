import { ChromeExtensionDriver } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';
import * as Runtime from './Runtime';

// Re-export Protocol types for convenience
export type NodeId = Protocol.DOM.NodeId;
export type BackendNodeId = Protocol.DOM.BackendNodeId;
export type BackendNode = Protocol.DOM.BackendNode;
export type Rect = Protocol.DOM.Rect;
export type RGBA = Protocol.DOM.RGBA;
export type Quad = Protocol.DOM.Quad;
export type BoxModel = Protocol.DOM.BoxModel;
export type ShapeOutsideInfo = Protocol.DOM.ShapeOutsideInfo;
export type CSSComputedStyleProperty = Protocol.DOM.CSSComputedStyleProperty;
export type ShadowRootType = Protocol.DOM.ShadowRootType;
export type PseudoType = Protocol.DOM.PseudoType;
export type Node = Protocol.DOM.Node;
export type EventListener = Protocol.DOMDebugger.EventListener;

export class DOMDebugger {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async getEventListeners(
    objectId: Runtime.RemoteObjectId,
    depth?: number,
    pierce?: boolean,
  ): Promise<EventListener[]> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOMDebugger.getEventListeners', {
      objectId,
      depth,
      pierce,
    });
    return (result as { listeners: EventListener[] }).listeners;
  }
}
