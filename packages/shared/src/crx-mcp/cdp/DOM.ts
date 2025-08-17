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
export type PhysicalAxes = Protocol.DOM.PhysicalAxes;
export type LogicalAxes = Protocol.DOM.LogicalAxes;
export type PseudoType = Protocol.DOM.PseudoType;
export type Node = Protocol.DOM.Node;

export class DOM {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async describeNode(
    nodeId?: NodeId,
    backendNodeId?: BackendNodeId,
    objectId?: Runtime.RemoteObjectId,
    depth?: number,
    pierce?: boolean,
  ): Promise<Node> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOM.describeNode', {
      nodeId,
      backendNodeId,
      objectId,
      depth,
      pierce,
    });
    return (result as { node: Node }).node;
  }
  async resolveNode(
    nodeId?: NodeId,
    backendNodeId?: BackendNodeId,
    objectGroup?: string,
    executionContextId?: Runtime.ExecutionContextId,
  ): Promise<Runtime.RemoteObject> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOM.resolveNode', {
      nodeId,
      backendNodeId,
      objectGroup,
      executionContextId,
    });
    return (result as { object: Runtime.RemoteObject }).object;
  }
  async focus(nodeId?: NodeId, backendNodeId?: BackendNodeId, objectId?: Runtime.RemoteObjectId) {
    await this.driver.sendAndGetDevToolsCommand('DOM.focus', {
      nodeId,
      backendNodeId,
      objectId,
    });
  }

  async getOuterHTML(
    nodeId?: NodeId,
    backendNodeId?: BackendNodeId,
    objectId?: Runtime.RemoteObjectId,
  ): Promise<string> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOM.getOuterHTML', {
      nodeId,
      backendNodeId,
      objectId,
    });
    return (result as { outerHTML: string }).outerHTML;
  }
  async getDocument(depth?: number, pierce?: boolean): Promise<Node> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOM.getDocument', {
      depth,
      pierce,
    });
    return (result as { root: Node }).root;
  }

  async querySelector(nodeId: NodeId, selector: string): Promise<NodeId> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOM.querySelector', {
      nodeId,
      selector,
    });
    return (result as { nodeId: NodeId }).nodeId;
  }

  async querySelectorAll(nodeId: NodeId, selector: string): Promise<NodeId[]> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOM.querySelectorAll', {
      nodeId,
      selector,
    });
    return (result as { nodeIds: NodeId[] }).nodeIds;
  }

  async getBoxModel(
    nodeId?: NodeId,
    backendNodeId?: BackendNodeId,
    objectId?: Runtime.RemoteObjectId,
  ): Promise<BoxModel> {
    const result = await this.driver.sendAndGetDevToolsCommand('DOM.getBoxModel', {
      nodeId,
      backendNodeId,
      objectId,
    });
    return (result as { model: BoxModel }).model;
  }
}
