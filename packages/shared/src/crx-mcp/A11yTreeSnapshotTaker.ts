import { DOM, BackendNodeId, CSSComputedStyleProperty } from './cdp/DOM';
import { Accessibility, AXNode, AXNodeId } from './cdp/Accessibility';
import { CSS } from './cdp/CSS';

export class A11yTreeSnapshotTaker {
  accessibility: Accessibility;
  dom: DOM;
  css: CSS;

  constructor(accessibility: Accessibility, dom: DOM, css: CSS) {
    this.accessibility = accessibility;
    this.dom = dom;
    this.css = css;
  }

  async takeSnapshot(): Promise<string> {
    const cdpRootAxTree = await this.accessibility.getRootAXNode();
    const cdpFullAXTree = await this.accessibility.getFullAXTree();
    const mapBackendNodeIds: { [key: BackendNodeId]: AXNode } = {};
    const mapNodeIds: { [key: AXNodeId]: AXNode } = {};

    for (const node of cdpFullAXTree) {
      if (node.backendDOMNodeId) {
        mapBackendNodeIds[node.backendDOMNodeId] = node;
      }
      if (node.nodeId) {
        mapNodeIds[node.nodeId] = node;
      }
    }
    return this.stringifyAxNode(cdpRootAxTree, 0, mapBackendNodeIds, mapNodeIds);
  }

  stringifyAxNode(
    axNode: AXNode,
    depth: number,
    mapBackendNodeIds: { [key: string]: AXNode },
    mapNodeIds: { [key: string]: AXNode },
  ): string {
    const skipNode = 'none' === axNode.role?.value;
    if (skipNode) {
      let acc = '';
      if (axNode.childIds) {
        for (let i = 0; i < axNode.childIds.length; i++) {
          const childId = axNode.childIds[i];
          let child: AXNode;
          if (mapBackendNodeIds[childId]) {
            child = mapBackendNodeIds[childId];
          } else if (mapNodeIds[childId]) {
            child = mapNodeIds[childId];
          } else {
            console.warn('miss');
            continue;
          }
          if (i !== 0) {
            acc += '\n';
          }
          acc += this.stringifyAxNode(child, depth, mapBackendNodeIds, mapNodeIds);
        }
      }
      return acc;
    }
    let acc = ' '.repeat(depth);
    acc += `<${axNode.role?.value ?? 'generic'}`;
    acc += ` "${axNode.name?.value.replace(/"/g, "'") ?? ''}"`;

    if (axNode.backendDOMNodeId) {
      acc += ` backendDOMNodeId="${axNode.backendDOMNodeId}"`;
    }
    if (axNode.properties) {
      for (const property of axNode.properties) {
        acc += ` ${String(property['name']).replace(/"/g, "'")}="${String(property['value']['value']).replace(/"/g, "'")}"`;
      }
    }
    acc += '>';

    if (axNode.childIds) {
      for (const childId of axNode.childIds) {
        let child: AXNode;
        if (mapBackendNodeIds[childId]) {
          child = mapBackendNodeIds[childId];
        } else if (mapNodeIds[childId]) {
          child = mapNodeIds[childId];
        } else {
          console.warn('miss');
          continue;
        }
        acc += '\n' + this.stringifyAxNode(child, depth + 1, mapBackendNodeIds, mapNodeIds);
      }
    }

    acc += '\n' + ' '.repeat(depth) + `</${axNode.role?.value ?? 'generic'}>`;
    return acc;
  }

  batched<T>(arr: T[], n: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += n) {
      result.push(arr.slice(i, i + n));
    }
    return result;
  }

  isStyleItemRelevant(item: CSSComputedStyleProperty): boolean {
    const relevantStyles = [
      'display',
      'visibility',
      'opacity',
      'position',
      'font-size',
      'cursor',
      'background',
      'background-color',
      'color',
    ];
    return relevantStyles.includes(item['name']);
  }

  async getRelevantStyles(backendNodeId: BackendNodeId): Promise<{ [key: string]: string }> {
    const node = await this.dom.describeNode(undefined, backendNodeId);
    const nodeId = node.nodeId;
    const computedStyles = await this.css.getComputedStyleForNode(nodeId);

    const relevantStyles = computedStyles.filter(item => this.isStyleItemRelevant(item));

    const toReturn: { [key: string]: string } = {};

    for (const item of relevantStyles) {
      const { name, value } = item;

      // Exclude specific styles
      if (
        (name === 'position' && value === 'static') ||
        (name === 'color' && value === 'rgb(0, 0, 0)') ||
        (name === 'font-size' && value === '13.3333px') ||
        (name === 'background-color' && value === 'rgba(0, 0, 0, 0)') ||
        (name === 'cursor' && (value === 'default' || value === 'auto')) ||
        (name === 'opacity' && value === '1') ||
        (name === 'visibility' && value === 'visible')
      ) {
        continue;
      }
      toReturn[name] = value;
    }

    return toReturn;
  }
}
