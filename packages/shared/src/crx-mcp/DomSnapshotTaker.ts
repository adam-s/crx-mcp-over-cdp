import {
  DOMSnapshot,
  DOMNode,
  DOMSnapshotResultGetSnapshot,
  LayoutTreeNode,
  ComputedStyle,
} from './cdp/DOMSnapshot';
import { DomInteractionsOperator } from './DomInteractionsOperator';

export class DomSnapshotTaker {
  domInteractionsOperator: DomInteractionsOperator;
  domSnapshot: DOMSnapshot;

  constructor(domInteractionsOperator: DomInteractionsOperator, domSnapshot: DOMSnapshot) {
    this.domInteractionsOperator = domInteractionsOperator;
    this.domSnapshot = domSnapshot;
  }

  capitalizeFirstLetter(val: string): string {
    const result = String(val).charAt(0).toUpperCase() + String(val).slice(1);
    return result;
  }

  /**
   * Check if a DOM node is an interactive element that should show its backendNodeId
   */
  isInteractiveElement(node: DOMNode): boolean {
    const interactiveElements = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM']);

    if (interactiveElements.has(node.nodeName)) {
      return true;
    }

    // Check if element has click handlers or other interactive attributes
    if (
      node.eventListeners &&
      node.eventListeners.some(listener =>
        ['click', 'mousedown', 'mouseup'].includes(listener.type),
      )
    ) {
      return true;
    }

    // Check for interactive attributes
    if (
      node.attributes &&
      node.attributes.some(attr => ['onclick', 'role', 'tabindex'].includes(attr.name))
    ) {
      return true;
    }

    return false;
  }

  async takeSnapshot(): Promise<string> {
    const snapshot = await this.domSnapshot.getSnapshot(['display', 'position', 'opacity'], true);

    const textResult = await this.printText(snapshot.domNodes[0], 0, snapshot);
    const linksResult = this.printLinks(snapshot.domNodes[0], snapshot);
    const finalResult = textResult + '\n\n' + linksResult;

    return finalResult;
  }

  printLinks(node: DOMNode, snapshot: DOMSnapshotResultGetSnapshot): string {
    let toReturn = '';

    if (node.nodeName === 'A') {
      const attrObj = node.attributes?.find(attrObj => attrObj.name === 'href');
      if (attrObj?.value) {
        toReturn = ' [id=' + node.backendNodeId + ']' + toReturn;
        toReturn += '[href=' + attrObj.value + ']\n';
      }
    }

    if (node.childNodeIndexes) {
      for (const [, childNodeIndex] of node.childNodeIndexes.entries()) {
        const child = snapshot.domNodes[childNodeIndex];
        toReturn += this.printLinks(child, snapshot);
      }
    }

    return toReturn;
  }

  async printText(
    node: DOMNode,
    depth = 0,
    snapshot: DOMSnapshotResultGetSnapshot,
    isFirstChild = true,
  ): Promise<string> {
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') {
      return '';
    }

    if (node.nodeName === '#text') {
      return node.nodeValue;
    }

    let toReturn = '';

    let isBlock = false;
    if (
      node.layoutNodeIndex !== undefined &&
      node.layoutNodeIndex >= 0 &&
      node.layoutNodeIndex < snapshot.layoutTreeNodes.length
    ) {
      const layoutIndex = node.layoutNodeIndex as number;
      const layout = snapshot.layoutTreeNodes[layoutIndex] as LayoutTreeNode;
      const style = snapshot.computedStyles[layout.styleIndex] as ComputedStyle;

      for (const { name, value } of style.properties) {
        if (name === 'display' && value !== 'inline') {
          isBlock = true;
        }
        if (name === 'display' && value === 'none') {
          return '';
        }
      }
    }

    if (isBlock && !isFirstChild) {
      toReturn += '\n';
    }

    // PROMINENTLY DISPLAY BACKEND NODE ID for interactive elements
    const isInteractive = this.isInteractiveElement(node);
    if (isInteractive && node.backendNodeId) {
      toReturn += `[${node.backendNodeId}]`;
    }

    // Note: getValueForNode expects a Node type, but we have DOMNode
    // We'll need to handle this differently or create a wrapper
    const value = null; // await this.domInteractionsOperator.getValueForNode(node, true);
    if (value) {
      toReturn += "[value='" + value + "']";
    }

    if (node.nodeName === 'A') {
      const attrObj = node.attributes?.find(attrObj => attrObj.name === 'href');
      if (attrObj?.value) {
        const attrValue = attrObj?.value;
        toReturn += '[href=' + attrValue + ']';
      }
    }

    if (node.nodeName === 'IMG') {
      const attrObj = node.attributes?.find(attrObj => attrObj.name === 'title');
      if (attrObj?.value) {
        const attrValue = attrObj?.value;
        toReturn += '[title=' + attrValue + ']';
      }
    }

    const eventListeners: string[] = [];
    const nativeInteractions = this.domInteractionsOperator.getNativeInteractionsForNode(
      node.nodeName,
      node.attributes,
    );

    if (node.eventListeners && node.eventListeners.length !== 0) {
      eventListeners.push(
        ...node.eventListeners.map(listener => 'on' + this.capitalizeFirstLetter(listener.type)),
      );
    }

    const uniqueEventListeners = [...new Set(eventListeners.concat(nativeInteractions ?? []))];

    for (const eventListenerName of uniqueEventListeners) {
      toReturn += '[' + eventListenerName + ']';
    }

    if (toReturn) {
      toReturn = ' [id=' + node.backendNodeId + ']' + toReturn;
    }

    if (node.childNodeIndexes) {
      for (const [, childNodeIndex] of node.childNodeIndexes.entries()) {
        const child = snapshot.domNodes[childNodeIndex];
        toReturn += await this.printText(child, depth + 1, snapshot, false);
      }
    }

    return toReturn;
  }
}
