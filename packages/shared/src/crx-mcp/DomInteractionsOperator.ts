import { ChromeExtensionDriver } from './chromeExtensionDriver';
import { DOM, Node, BackendNodeId } from './cdp/DOM';
import { Runtime, CallFunctionReturnObject } from './cdp/Runtime';
import { Input } from './cdp/Input';
import { NameValue } from './cdp/DOMSnapshot';
import type Protocol from 'devtools-protocol';

export class DomInteractionsOperator {
  driver: ChromeExtensionDriver;
  dom: DOM;
  runtime: Runtime;
  input: Input;

  // Constants
  inputTypeWithValue: string[] = [
    'COLOR',
    'DATE',
    'DATETIME-LOCAL',
    'EMAIL',
    'MONTH',
    'NUMBER',
    'PASSWORD',
    'RANGE',
    'SEARCH',
    'TEL',
    'TEXT',
    'TIME',
    'URL',
    'WEEK',
  ];
  inputTypeWithCheckedValue: string[] = ['RADIO', 'CHECKBOX'];
  inputTypeClickable: string[] = ['BUTTON', 'SUBMIT', 'IMAGE', 'RESET', 'RADIO', 'CHECKBOX'];
  inputTypeUploadable: string[] = ['FILE'];
  inputTypeIgnored: string[] = ['HIDDEN'];

  constructor(driver: ChromeExtensionDriver, dom: DOM, runtime: Runtime, input: Input) {
    this.driver = driver;
    this.dom = dom;
    this.runtime = runtime;
    this.input = input;
  }

  async findDocumentNode(node: Node, predicate: (node: Node) => boolean): Promise<Node | null> {
    if (predicate(node)) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const result = await this.findDocumentNode(child, predicate);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  getNativeInteractions(node: Node): string[] | undefined {
    const nodeName = node.name || node.localName;
    const result = this.getNativeInteractionsFor(nodeName, node.attributes);
    return result;
  }

  getNativeInteractionsFor(
    nodeName: string,
    attributes: string[] | undefined,
  ): string[] | undefined {
    switch (nodeName) {
      case 'A':
        return ['doClick'];
      case 'INPUT': {
        let type = 'TEXT';
        if (attributes) {
          for (const [name, value] of this.batched(attributes, 2)) {
            if (name === 'type') {
              type = value.toUpperCase();
              break;
            }
          }
        }

        let interactions: string[] | undefined;
        if (this.inputTypeWithCheckedValue.includes(type)) {
          interactions = ['doFocus', 'doClick'];
        } else if (this.inputTypeClickable.includes(type)) {
          interactions = ['doFocus', 'doClick'];
        } else if (type === 'search') {
          interactions = ['doFocus', 'doSetValue', 'doSubmit'];
        } else if (this.inputTypeWithValue.includes(type)) {
          interactions = ['doFocus', 'doSetValue'];
        }
        return interactions;
      }
      case 'TEXTAREA':
        return ['doFocus', 'doSetValue'];
      case 'SELECT':
        return ['doFocus', 'doSelectIndex'];
      case 'FORM':
        return ['doFocus', 'doSubmit'];
      case 'BUTTON':
        return ['doFocus', 'doClick', 'doSubmit'];
      default:
        return undefined;
    }
  }

  getNativeInteractionsForNode(
    nodeName: string,
    attributes: NameValue[] | undefined,
  ): string[] | undefined {
    switch (nodeName) {
      case 'A':
        return ['onClick'];
      case 'INPUT': {
        let type = 'TEXT';
        if (attributes) {
          for (const { name, value } of attributes) {
            if (name === 'type') {
              type = value.toUpperCase();
              break;
            }
          }
        }

        let interactions: string[] | undefined;
        if (this.inputTypeWithCheckedValue.includes(type)) {
          interactions = ['onFocus', 'onClick'];
        } else if (this.inputTypeClickable.includes(type)) {
          interactions = ['onFocus', 'onClick'];
        } else if (type === 'search') {
          interactions = ['onFocus', 'onChange', 'onSubmit'];
        } else if (this.inputTypeWithValue.includes(type)) {
          interactions = ['onFocus', 'onChange'];
        }

        return interactions;
      }
      case 'TEXTAREA':
        return ['onFocus', 'onChange'];
      case 'SELECT':
        return ['onFocus', 'onSelect'];
      case 'FORM':
        return ['onFocus', 'onSubmit'];
      case 'BUTTON':
        return ['onFocus', 'onClick', 'onSubmit'];
      default:
        return undefined;
    }
  }

  async doClick(backendNodeId: BackendNodeId): Promise<void> {
    // First, validate the node exists
    const node = await this.dom.describeNode(undefined, backendNodeId);
    if (!node) {
      throw new Error(`Node with backendNodeId ${backendNodeId} not found`);
    }

    const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
    if (!resolvedNode?.objectId) {
      throw new Error(`Could not resolve node with backendNodeId ${backendNodeId} to object`);
    }
    // Enhanced click logic with fallback
    const clickScript = `
        function() { 
          try {
            if (this.nodeType === Node.TEXT_NODE) { 
              if (this.parentElement) {
                this.parentElement.click();
                return "clicked parent of text node";
              } else {
                throw new Error("Text node has no parent element");
              }
            } else { 
              this.click();
              return "clicked element directly";
            }
          } catch (e) {
            return "error: " + e.message;
          }
        }
      `;

    const result: CallFunctionReturnObject = await this.runtime.callFunctionOn(
      clickScript,
      resolvedNode.objectId,
    );

    if (result.exceptionDetails) {
      throw new Error(`Click failed: ${JSON.stringify(result.exceptionDetails, null, 2)}`);
    }

    const clickResult = result.result?.value;
    console.log(`✅ Click result: ${clickResult}`);

    if (typeof clickResult === 'string' && clickResult.startsWith('error:')) {
      throw new Error(`Click execution failed: ${clickResult}`);
    }
  }

  async doFocus(backendNodeId: BackendNodeId): Promise<void> {
    await this.dom.focus(undefined, backendNodeId);
  }

  async doSendKey(backendNodeId: BackendNodeId, keys: string): Promise<void> {
    await this.doFocus(backendNodeId);

    for (let i = 0; i < keys.length; i++) {
      const key = keys.charAt(i);

      await this.input.dispatchKeyEvent(
        'keyDown' as Protocol.Input.DispatchKeyEventRequestType,
        undefined,
        key,
      );
      await this.input.dispatchKeyEvent(
        'keyUp' as Protocol.Input.DispatchKeyEventRequestType,
        undefined,
        key,
      );
    }
  }

  async doSetValue(backendNodeId: BackendNodeId, value: string): Promise<string> {
    const node = await this.dom.describeNode(undefined, backendNodeId);
    const result = await this.doSetValueOnNode(node, value);
    return result;
  }

  async doSetValueOnNode(node: Node, value: string): Promise<string> {
    const backendNodeId = node.backendNodeId;
    const isElement = node.nodeType === 1;
    if (!isElement) {
      return 'not an element';
    }

    const nodeName = node.name || node.localName;

    if (nodeName === 'select' || nodeName === 'textarea') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      const result = await this.runtime.callFunctionOn(
        'function(value) { this.value = value }',
        nodeObjectId,
        [{ value: value }],
      );
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result, null, 2));
      }
      return 'ok';
    }

    if (nodeName === 'input') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      let type = 'TEXT';
      if (node.attributes) {
        for (const [name, attValue] of this.batched(node.attributes, 2)) {
          if (name === 'type') {
            type = attValue.toUpperCase();
            break;
          }
        }
      }

      if (this.inputTypeWithValue.includes(type)) {
        const result = await this.runtime.callFunctionOn(
          'function(valueToSet) { this.value = valueToSet }',
          nodeObjectId,
          [{ value: value }],
        );
        if (result.exceptionDetails) {
          throw new Error(JSON.stringify(result, null, 2));
        }
        return 'ok';
      }

      if (this.inputTypeWithCheckedValue.includes(type)) {
        let checked = false;
        if (value === 'checked' || value === 'unchecked') {
          checked = value === 'checked';
        } else if (typeof value === 'boolean') {
          checked = value;
        } else {
          return "value should be either 'checked' or 'unchecked'";
        }

        const result = await this.runtime.callFunctionOn(
          'function() { this.checked = checked }',
          nodeObjectId,
          [{ value: checked }],
        );
        if (result.exceptionDetails) {
          throw new Error(JSON.stringify(result, null, 2));
        }
        return 'ok';
      }
    }

    throw new Error(
      `cannot set value on element '${nodeName}'. Can set value just on input, select, and textarea elements`,
    );
  }

  async getValue(backendNodeId: BackendNodeId): Promise<string | boolean | null> {
    const node = await this.dom.describeNode(undefined, backendNodeId);
    const result = await this.getValueForNode(node);
    return result;
  }

  async getValueForNode(node: Node, safe: boolean = false): Promise<string | boolean | null> {
    const backendNodeId = node.backendNodeId;
    const isElement = node.nodeType === 1;
    if (!isElement) {
      if (safe) return null;
      else throw new Error('Cannot get value because it is not an element.');
    }

    const nodeName = node.name || node.localName;

    if (nodeName === 'select' || nodeName === 'textarea') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      const result = await this.runtime.callFunctionOn(
        'function() { return this.value }',
        nodeObjectId,
      );
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result, null, 2));
      }
      return result.result.value;
    }

    if (nodeName === 'input') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      let type = 'TEXT';
      if (node.attributes) {
        if (Array.isArray(node.attributes)) {
          for (const [name, value] of this.batched(node.attributes, 2)) {
            if (name === 'type') {
              type = value.toUpperCase();
              break;
            }
          }
        }
      }

      if (this.inputTypeWithValue.includes(type)) {
        const result = await this.runtime.callFunctionOn(
          'function() { return this.value }',
          nodeObjectId,
        );
        if (result.exceptionDetails) {
          throw new Error(JSON.stringify(result, null, 2));
        }
        return result.result.value;
      }

      if (this.inputTypeWithCheckedValue.includes(type)) {
        const result = await this.runtime.callFunctionOn(
          'function() { return this.checked }',
          nodeObjectId,
        );
        if (result.exceptionDetails) {
          throw new Error(JSON.stringify(result, null, 2));
        }
        const checkedValue = result.result.value ? 'checked' : 'unchecked';
        return checkedValue;
      }
    }
    if (safe) return null;
    else
      throw new Error(
        `cannot get value on element '${nodeName}'. Can get value just on input, select, and textarea elements`,
      );
  }

  async doSubmit(backendNodeId: BackendNodeId): Promise<string> {
    const node = await this.dom.describeNode(undefined, backendNodeId);
    const result = await this.doSubmitNode(node);
    return result;
  }

  async doSubmitNode(node: Node): Promise<string> {
    const backendNodeId = node.backendNodeId;
    const isElement = node.nodeType === 1;
    if (!isElement) {
      return 'not an element';
    }

    const nodeName = node.name || node.localName;

    // Handle form elements
    if (nodeName === 'form') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      const result = await this.runtime.callFunctionOn(
        'function() { return this.submit() }',
        nodeObjectId,
      );
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result, null, 2));
      }
      return 'ok';
    }

    // Handle input elements (specifically search inputs)
    if (nodeName === 'input') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      const result = await this.runtime.callFunctionOn(
        'function() { return this.submit() }',
        nodeObjectId,
      );
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result, null, 2));
      }
      return 'ok';
    }

    // Handle button elements that might trigger form submission
    if (nodeName === 'button') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      const result = await this.runtime.callFunctionOn(
        'function() { this.click(); return "clicked"; }',
        nodeObjectId,
      );
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result, null, 2));
      }
      return 'ok';
    }

    const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
    const nodeObjectId = resolvedNode.objectId;
    const result = await this.runtime.callFunctionOn(
      `function() {
        // Try to find the nearest form ancestor
        let element = this;
        while (element && element.tagName !== 'FORM') {
          element = element.parentElement;
        }
        if (element && element.tagName === 'FORM') {
          element.submit();
          return "form submitted";
        }
        // If no form found, try to trigger a click event which might submit a form
        this.click();
        return "clicked";
      }`,
      nodeObjectId,
    );
    if (result.exceptionDetails) {
      throw new Error(
        `Element ${nodeName} cannot be submitted and no form found: ${JSON.stringify(result, null, 2)}`,
      );
    }
    return 'ok';
  }

  async doSelectOptionValue(backendNodeId: BackendNodeId, value: string): Promise<string> {
    const node = await this.dom.describeNode(undefined, backendNodeId);
    const result = await this.doSelectOptionValueNode(node, value);
    return result;
  }

  async doSelectOptionValueNode(node: Node, theValue: string): Promise<string> {
    const backendNodeId = node.backendNodeId;
    const isElement = node.nodeType === 1;
    if (!isElement) {
      return 'not an element';
    }

    const nodeName = node.name || node.localName;

    if (nodeName === 'select') {
      const resolvedNode = await this.dom.resolveNode(undefined, backendNodeId);
      const nodeObjectId = resolvedNode.objectId;
      const result = await this.runtime.callFunctionOn(
        `function(stringValue) {
          let index = Array.from(this.querySelectorAll("option")).findIndex(option => option.getAttribute("value") === stringValue);
          if (index !== -1) {
            this.selectedIndex = index;
          } else {
            throw new Error("the option doesn't exit");
          }
      }`,
        nodeObjectId,
        [{ value: theValue }],
      );
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result, null, 2));
      }
      return 'ok';
    } else {
      throw new Error("element not a 'select'");
    }
  }

  batched<T>(array: T[], n: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += n) {
      result.push(array.slice(i, i + n));
    }
    return result;
  }
}
