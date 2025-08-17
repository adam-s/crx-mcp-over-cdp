import { ChromeExtensionDriver } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type AXNodeId = Protocol.Accessibility.AXNodeId;
export type AXPropertyName = Protocol.Accessibility.AXPropertyName;
export type AXValueSourceType = Protocol.Accessibility.AXValueSourceType;
export type AXValueType = Protocol.Accessibility.AXValueType;
export type AXValueNativeSourceType = Protocol.Accessibility.AXValueNativeSourceType;
export type AXRelatedNode = Protocol.Accessibility.AXRelatedNode;
export type AXValueSource = Protocol.Accessibility.AXValueSource;
export type AXValue = Protocol.Accessibility.AXValue;
export type AXProperty = Protocol.Accessibility.AXProperty;
export type AXNode = Protocol.Accessibility.AXNode;

export class Accessibility {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async getRootAXNode(): Promise<AXNode> {
    const result = await this.driver.sendAndGetDevToolsCommand('Accessibility.getRootAXNode');
    return (result as { node: AXNode }).node;
  }

  async getFullAXTree(): Promise<AXNode[]> {
    const result = await this.driver.sendAndGetDevToolsCommand('Accessibility.getFullAXTree');
    return (result as { nodes: AXNode[] }).nodes;
  }
}
