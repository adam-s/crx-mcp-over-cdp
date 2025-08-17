/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { escapeWithQuotes } from './utils/isomorphic/stringUtils';
import {
  beginAriaCaches,
  endAriaCaches,
  getAriaRole,
  getElementAccessibleName,
  isElementIgnoredForAria,
} from './roleUtils';
import { isElementVisible, isElementStyleVisibilityVisible } from './domUtils';

// Defines the structure of an ARIA node in the accessibility tree
type AriaNode = {
  role: string;
  name?: string;
  children?: (AriaNode | string)[];
};

// Defines the structure of an ARIA template node for matching
export type AriaTemplateNode = {
  role: string;
  name?: RegExp | string;
  children?: (AriaTemplateNode | string | RegExp)[];
};

// Generates an ARIA tree from the root HTML element
export function generateAriaTree(rootElement: Element): AriaNode {
  const toAriaNode = (element: Element): { ariaNode: AriaNode; isLeaf: boolean } | null => {
    const role = getAriaRole(element);
    if (!role) {
      return null;
    }

    const name = role ? getElementAccessibleName(element, false) || undefined : undefined;
    const isLeaf = leafRoles.has(role);
    const result: AriaNode = { role, name };
    if (isLeaf && !name && element.textContent) {
      result.children = [element.textContent];
    }
    return { isLeaf, ariaNode: result };
  };

  const visit = (ariaNode: AriaNode, node: Node) => {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      ariaNode.children = ariaNode.children || [];
      ariaNode.children.push(node.nodeValue);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as Element;
    if (isElementIgnoredForAria(element)) {
      return;
    }

    const visible = isElementVisible(element);
    const hasVisibleChildren = isElementStyleVisibilityVisible(element);

    if (!hasVisibleChildren) {
      return;
    }

    if (visible) {
      const childAriaNode = toAriaNode(element);
      const isHiddenContainer = childAriaNode && hiddenContainerRoles.has(childAriaNode.ariaNode.role);
      if (childAriaNode && !isHiddenContainer) {
        ariaNode.children = ariaNode.children || [];
        ariaNode.children.push(childAriaNode.ariaNode);
      }
      if (isHiddenContainer || !childAriaNode?.isLeaf) {
        processChildNodes(childAriaNode?.ariaNode || ariaNode, element);
      }
    } else {
      processChildNodes(ariaNode, element);
    }
  };

  // Processes child nodes, including shadow DOM if present
  function processChildNodes(ariaNode: AriaNode, element: Element) {
    // Process light DOM children
    for (let child = element.firstChild; child; child = child.nextSibling) {
      visit(ariaNode, child);
    }
    // Process shadow DOM children, if any
    if (element.shadowRoot) {
      for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling) {
        visit(ariaNode, child);
      }
    }
  }

  beginAriaCaches();
  const ariaRoot: AriaNode = { role: '' };
  try {
    visit(ariaRoot, rootElement);
  } finally {
    endAriaCaches();
  }

  normalizeStringChildren(ariaRoot);
  return ariaRoot;
}

// Converts the ARIA tree to a rendered string
export function renderedAriaTree(rootElement: Element): string {
  return renderAriaTree(generateAriaTree(rootElement));
}

// Normalizes string children by trimming and combining whitespace
function normalizeStringChildren(rootA11yNode: AriaNode) {
  const flushChildren = (buffer: string[], normalizedChildren: (AriaNode | string)[]) => {
    if (!buffer.length) {
      return;
    }
    const text = normalizeWhitespaceWithin(buffer.join('')).trim();
    if (text) {
      normalizedChildren.push(text);
    }
    buffer.length = 0;
  };

  const visit = (ariaNode: AriaNode) => {
    const normalizedChildren: (AriaNode | string)[] = [];
    const buffer: string[] = [];
    for (const child of ariaNode.children || []) {
      if (typeof child === 'string') {
        buffer.push(child);
      } else {
        flushChildren(buffer, normalizedChildren);
        visit(child);
        normalizedChildren.push(child);
      }
    }
    flushChildren(buffer, normalizedChildren);
    ariaNode.children = normalizedChildren.length ? normalizedChildren : undefined;
  };
  visit(rootA11yNode);
}

// Set of roles that are considered hidden containers
const hiddenContainerRoles = new Set(['none', 'presentation']);

// Set of roles that are considered leaf nodes in the ARIA tree
const leafRoles = new Set([
  'alert',
  'blockquote',
  'button',
  'caption',
  'checkbox',
  'code',
  'columnheader',
  'definition',
  'deletion',
  'emphasis',
  'generic',
  'heading',
  'img',
  'insertion',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'option',
  'progressbar',
  'radio',
  'rowheader',
  'scrollbar',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'term',
  'textbox',
  'time',
  'tooltip',
]);

// Normalizes whitespace within a string by replacing multiple spaces and newlines with a single space
const normalizeWhitespaceWithin = (text: string) => text.replace(/[\s\n]+/g, ' ');

// Checks if the text matches the template, which can be a string or regex
function matchesText(text: string | undefined, template: RegExp | string | undefined) {
  if (!template) {
    return true;
  }
  if (!text) {
    return false;
  }
  if (typeof template === 'string') {
    return text === template;
  }
  return !!text.match(template);
}

// Checks if the ARIA tree matches the given template
export function matchesAriaTree(
  rootElement: Element,
  template: AriaTemplateNode,
): { matches: boolean; received: string } {
  const root = generateAriaTree(rootElement);
  const matches = nodeMatches(root, template);
  return { matches, received: renderAriaTree(root) };
}

// Recursively checks if a node matches the template
function matchesNode(node: AriaNode | string, template: AriaTemplateNode | RegExp | string, depth: number): boolean {
  if (typeof node === 'string' && (typeof template === 'string' || template instanceof RegExp)) {
    return matchesText(node, template);
  }

  if (typeof node === 'object' && typeof template === 'object' && !(template instanceof RegExp)) {
    if (template.role && template.role !== node.role) {
      return false;
    }
    if (!matchesText(node.name, template.name)) {
      return false;
    }
    if (!containsList(node.children || [], template.children || [], depth)) {
      return false;
    }
    return true;
  }
  return false;
}

// Checks if the list of children contains the template sequence
function containsList(
  children: (AriaNode | string)[],
  template: (AriaTemplateNode | RegExp | string)[],
  depth: number,
): boolean {
  if (template.length > children.length) {
    return false;
  }
  const cc = children.slice();
  const tt = template.slice();
  for (const t of tt) {
    let c = cc.shift();
    while (c) {
      if (matchesNode(c, t, depth + 1)) {
        break;
      }
      c = cc.shift();
    }
    if (!c) {
      return false;
    }
  }
  return true;
}

// Recursively checks if the ARIA tree matches the template starting from the root
function nodeMatches(root: AriaNode, template: AriaTemplateNode): boolean {
  const results: (AriaNode | string)[] = [];
  const visit = (node: AriaNode | string): boolean => {
    if (matchesNode(node, template, 0)) {
      results.push(node);
      return true;
    }
    if (typeof node === 'string') {
      return false;
    }
    for (const child of node.children || []) {
      if (visit(child)) {
        return true;
      }
    }
    return false;
  };
  visit(root);
  return !!results.length;
}

// Renders the ARIA tree into a YAML formatted string
export function renderAriaTree(ariaNode: AriaNode): string {
  const lines: string[] = [];
  const visit = (ariaNode: AriaNode | string, indent: string) => {
    if (typeof ariaNode === 'string') {
      lines.push(indent + '- text: ' + escapeYamlString(ariaNode));
      return;
    }
    let line = `${indent}- ${ariaNode.role}`;
    if (ariaNode.name) {
      line += ` ${escapeWithQuotes(ariaNode.name, '"')}`;
    }
    const noChild = !ariaNode.name && !ariaNode.children?.length;
    const oneChild = !ariaNode.name && ariaNode.children?.length === 1 && typeof ariaNode.children[0] === 'string';
    if (noChild || oneChild) {
      if (oneChild) {
        line += ': ' + escapeYamlString(ariaNode.children?.[0] as string);
      }
      lines.push(line);
      return;
    }
    lines.push(line + (ariaNode.children ? ':' : ''));
    for (const child of ariaNode.children || []) {
      visit(child, indent + '  ');
    }
  };
  if (ariaNode.role === '') {
    // Render fragment.
    for (const child of ariaNode.children || []) {
      visit(child, '');
    }
  } else {
    visit(ariaNode, '');
  }
  return lines.join('\n');
}

// Escapes a string for safe inclusion in YAML
function escapeYamlString(str: string) {
  if (str === '') {
    return '""';
  }

  const needQuotes =
    // Starts or ends with whitespace
    /^\s|\s$/.test(str) ||
    // Contains control characters
    /[\x00-\x1f]/.test(str) ||
    // Contains special YAML characters that could cause parsing issues
    /[\[\]{}&*!,|>%@`]/.test(str) ||
    // Contains a colon followed by a space (could be interpreted as a key-value pair)
    /:\s/.test(str) ||
    // Is a YAML boolean or null value
    /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|null|Null|NULL|~)$/.test(str) ||
    // Could be interpreted as a number
    /^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(str) ||
    // Contains a newline character
    /\n/.test(str) ||
    // Starts with a special character
    /^[\-?:,>|%@"`]/.test(str);

  if (needQuotes) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
  }

  return str;
}
