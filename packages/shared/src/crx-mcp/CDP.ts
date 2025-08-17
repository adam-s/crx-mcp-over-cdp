import { ChromeExtensionDriver, CDPSession } from './chromeExtensionDriver';
import { DOM, Node } from './cdp/DOM';
import { Accessibility } from './cdp/Accessibility';
import { Console } from './cdp/Console';
import { CSS } from './cdp/CSS';
import { DOMDebugger } from './cdp/DOMDebugger';
import { Runtime } from './cdp/Runtime';
import { Page } from './cdp/Page';
import { Input } from './cdp/Input';
import { Target } from './cdp/Target';
import { Network } from './cdp/Network';
import { Overlay } from './cdp/Overlay';
import { DOMSnapshot } from './cdp/DOMSnapshot';
import { Profiler } from './cdp/Profiler';

export class CDP {
  driver: ChromeExtensionDriver;
  cdpSession!: CDPSession; // Will be initialized in init()

  accessibility: Accessibility;
  console: Console;
  css: CSS;
  dom: DOM;
  domDebugger: DOMDebugger;
  page: Page;
  runtime: Runtime;
  input: Input;
  target: Target;
  network: Network;
  profiler: Profiler;
  overlay: Overlay;
  domSnapshot: DOMSnapshot;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
    this.accessibility = new Accessibility(driver);
    this.console = new Console(driver);
    this.css = new CSS(driver);
    this.dom = new DOM(driver);
    this.runtime = new Runtime(driver);
    this.domDebugger = new DOMDebugger(driver);
    this.page = new Page(driver);
    this.input = new Input(driver);
    this.target = new Target(driver);
    this.network = new Network(driver);
    this.profiler = new Profiler(driver);
    this.overlay = new Overlay(driver);
    this.domSnapshot = new DOMSnapshot(driver);
  }

  async init() {
    // Create CDP connection with strongly-typed session
    this.cdpSession = await this.driver.createCDPConnection();

    // Initialize domain classes with the typed session
    // Use try-catch for each domain to handle any "Not allowed" errors gracefully
    try {
      await this.console.init(this.cdpSession);
    } catch (error) {
      console.warn('Failed to initialize Console domain:', error);
    }

    try {
      await this.target.init(this.cdpSession);
    } catch (error) {
      console.warn('Failed to initialize Target domain:', error);
    }

    try {
      await this.network.init(this.cdpSession);
    } catch (error) {
      console.warn('Failed to initialize Network domain:', error);
    }

    try {
      await this.page.init(this.cdpSession);
    } catch (error) {
      console.warn('Failed to initialize Page domain:', error);
    }

    try {
      await this.profiler.init(this.cdpSession);
    } catch (error) {
      console.warn('Failed to initialize Profiler domain:', error);
    }

    try {
      await this.runtime.init(this.cdpSession);
    } catch (error) {
      console.warn('Failed to initialize Runtime domain:', error);
    }

    try {
      await this.domSnapshot.enable();
    } catch (error) {
      console.warn('Failed to enable DOMSnapshot domain:', error);
    }
  }

  batched<T>(arr: T[], n: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += n) {
      result.push(arr.slice(i, i + n));
    }
    return result;
  }

  stringifyDomNode(node: Node, depth: number = 0): string {
    //const value = this.interactor.getValueForNode(node, true);
    // Uncomment if necessary
    // const listeners = this.runtime.getListeners(backendNodeId);
    // if (listeners) node['listeners'] = listeners;
    // const nativeInteractions = this.interactor.getNativeInteractions(node);
    // if (nativeInteractions) node['nativeInteractions'] = nativeInteractions;
    // const styles = this.css.getRelevantStyles(backendNodeId);
    // if (styles) node['styles'] = styles;
    // if (styles['display'] === 'none' || ('visibility' in node['styles'] && node['styles']['visibility'] === 'hidden')) {
    //   return false;
    // }

    let acc = ' '.repeat(depth);
    if (node['nodeName'] === '#text') {
      acc += node['nodeValue'].replace(/"/g, "'");
    } else {
      if (node['nodeName'] === 'STYLE' || node['nodeName'] === 'SCRIPT') {
        return '';
      }
      const skipElement = node['nodeName'] !== '#document';
      if (skipElement) {
        acc += `<${node['nodeName']} backendNodeId="${node['backendNodeId']}"`;
      }
      if (node.attributes) {
        for (const [key, value] of this.batched(node.attributes, 2)) {
          if (key !== 'style') {
            acc += ` ${key}="${value.replace(/"/g, "'")}"`;
          }
        }
      }
      if (skipElement) {
        acc += '>';
      }
      if (node.children) {
        for (const child of node.children) {
          acc += '\n' + this.stringifyDomNode(child, depth + 1);
        }
      }
      if (skipElement) {
        acc += '\n' + ' '.repeat(depth) + `</${node.nodeName}>`;
      }
    }
    return acc;
  }
}
