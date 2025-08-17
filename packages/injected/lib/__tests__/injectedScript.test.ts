// injectedScript.test.ts
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Import the InjectedScript class from your TypeScript file.
// Adjust the import path according to your project structure.
import { InjectedScript } from '../injectedScript';

describe('InjectedScript', () => {
  let injectedScript: InjectedScript;
  let originalGetComputedStyle: (
    elt: Element,
    pseudoElt?: string | null,
  ) => CSSStyleDeclaration;
  beforeEach(() => {
    // `window` and `document` are already available in the jsdom environment.

    // Create an instance of InjectedScript
    injectedScript = new InjectedScript(
      window,
      false, // isUnderTest
      'javascript', // sdkLanguage
      'data-testid', // testIdAttributeNameForStrictErrorAndConsoleCodegen
      3, // stableRafCount
      'chromium', // browserName
      [], // customEngines
    );

    originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = (element: Element) => {
      const style = originalGetComputedStyle(element);
      return {
        ...style,
        borderLeftWidth: style.borderLeftWidth || '0px',
        borderTopWidth: style.borderTopWidth || '0px',
      };
    };
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
  });

  it('should create an instance of InjectedScript', () => {
    expect(injectedScript).toBeDefined();
  });

  it('should parse a simple CSS selector', () => {
    const parsedSelector = injectedScript.parseSelector('div');
    expect(parsedSelector).toBeDefined();
    expect(parsedSelector.parts[0].name).toBe('css');
    expect(parsedSelector.parts[0].source).toBe('div');
    if (Array.isArray(parsedSelector.parts[0].body)) {
      expect(parsedSelector.parts[0].body[0].simples[0].selector.css).toBe(
        'div',
      );
    }
  });

  it('should find elements using querySelectorAll', () => {
    document.body.innerHTML = '<div id="test"></div><div></div>';
    const selector = injectedScript.parseSelector('div');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(2);
  });

  it('should use custom clock if available', () => {
    // Save the original value of window.__pwClock
    const originalPwClock = window.__pwClock;

    // Mock __pwClock
    const mockSetTimeout = vi.fn();
    (window.__pwClock as any) = {
      builtin: {
        setTimeout: mockSetTimeout,
      },
    };

    const callback = vi.fn();
    const timeout = 1000;

    injectedScript.builtinSetTimeout(callback, timeout);

    expect(mockSetTimeout).toHaveBeenCalledWith(callback, timeout);

    // Restore the original window.__pwClock
    window.__pwClock = originalPwClock;
  });

  it('should fallback to built-in setTimeout if custom clock is not available', () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const callback = vi.fn();
    const timeout = 1000;

    const timeoutId = injectedScript.builtinSetTimeout(callback, timeout);

    expect(setTimeoutSpy).toHaveBeenCalledWith(callback, timeout);

    // Restore the original setTimeout
    setTimeoutSpy.mockRestore();
  });

  it('should throw an error for unknown engine in selector', () => {
    expect(() => {
      injectedScript.parseSelector('unknown-engine=div');
    }).toThrowError(
      'Unknown engine "unknown-engine" while parsing selector unknown-engine=div',
    );
  });

  it('should parse a complex CSS selector', () => {
    const parsedSelector = injectedScript.parseSelector(
      'div > .className[attr="value"]',
    );
    expect(parsedSelector).toBeDefined();
    expect(parsedSelector.parts[0].name).toBe('css');
    expect(parsedSelector.parts[0].source).toBe(
      'div > .className[attr="value"]',
    );
  });

  it('should parse a selector with multiple parts', () => {
    const parsedSelector = injectedScript.parseSelector(
      'css=div >> text="example"',
    );
    expect(parsedSelector).toBeDefined();
    expect(parsedSelector.parts.length).toBe(2);
    expect(parsedSelector.parts[0].name).toBe('css');
    expect(parsedSelector.parts[0].source).toBe('div');
    expect(parsedSelector.parts[1].name).toBe('text');
    expect(parsedSelector.parts[1].source).toBe('"example"');
  });

  it('should parse a selector with nth part', () => {
    const parsedSelector = injectedScript.parseSelector('div >> nth=2');
    expect(parsedSelector).toBeDefined();
    expect(parsedSelector.parts.length).toBe(2);
    expect(parsedSelector.parts[1].name).toBe('nth');
    expect(parsedSelector.parts[1].source).toBe('2');
  });

  it('should parse a selector with internal:has part', () => {
    const parsedSelector = injectedScript.parseSelector(
      'div >> internal:has="span"',
    );
    expect(parsedSelector).toBeDefined();
    expect(parsedSelector.parts.length).toBe(2);
    expect(parsedSelector.parts[1].name).toBe('internal:has');
    expect(parsedSelector.parts[1].source).toBe('"span"');
  });

  it('should generate a unique CSS selector for a target element', () => {
    document.body.innerHTML = '<div id="test"></div>';
    const targetElement = document.getElementById('test')!;
    const options = {
      testIdAttributeName: 'test',
    }; // Customize options as needed

    const selector = injectedScript.generateSelector(targetElement, options);

    expect(selector).toBeDefined();
    expect(selector.selector).toContain('#test');
  });

  it('should generate a unique CSS selector with custom options', () => {
    document.body.innerHTML = '<div id="test" class="example"></div>';
    const targetElement = document.getElementById('test')!;
    const options = {
      testIdAttributeName: 'test',
      includeTag: true,
    }; // Example option

    const selector = injectedScript.generateSelector(targetElement, options);

    expect(selector).toBeDefined();
    expect(selector.selector).toContain('#test');
  });

  it('should generate a simple CSS selector for a target element', () => {
    document.body.innerHTML = '<div id="test"></div>';
    const targetElement = document.getElementById('test')!;
    const selector = injectedScript.generateSelectorSimple(targetElement);
    expect(selector).toBeDefined();
    expect(selector).toContain('#test');
  });

  it('should generate a simple CSS selector with custom options', () => {
    document.body.innerHTML = '<div id="test" class="example"></div>';
    const targetElement = document.getElementById('test')!;
    const options = {
      testIdAttributeName: 'test',
      includeTag: true,
    }; // Example option

    const selector = injectedScript.generateSelectorSimple(
      targetElement,
      options,
    );
    expect(selector).toBeDefined();
    expect(selector).toContain('#test');
  });

  it('should use the default testIdAttributeNameForStrictErrorAndConsoleCodegen', () => {
    document.body.innerHTML = '<div id="test" data-testid="example"></div>';
    const targetElement = document.getElementById('test')!;
    const selector = injectedScript.generateSelectorSimple(targetElement);
    expect(selector).toBeDefined();
    expect(selector).toContain('[data-testid="example"s]');
  });

  it('should find a single element using querySelector in non-strict mode', () => {
    document.body.innerHTML = '<div id="test"></div>';
    const selector = injectedScript.parseSelector('div');
    const element = injectedScript.querySelector(selector, document, false);
    expect(element).toBeDefined();
    expect(element!.id).toBe('test');
  });

  it('should find the first element using querySelector in non-strict mode when multiple elements match', () => {
    document.body.innerHTML = '<div id="test1"></div><div id="test2"></div>';
    const selector = injectedScript.parseSelector('div');
    const element = injectedScript.querySelector(selector, document, false);
    expect(element).toBeDefined();
    expect(element!.id).toBe('test1');
  });

  it('should throw an error in strict mode when multiple elements match', () => {
    document.body.innerHTML = '<div id="test1"></div><div id="test2"></div>';
    const selector = injectedScript.parseSelector('div');
    expect(() => {
      injectedScript.querySelector(selector, document, true);
    }).toThrowError();
  });

  it('should return undefined when no elements match', () => {
    document.body.innerHTML = '<span id="test"></span>';
    const selector = injectedScript.parseSelector('div');
    const element = injectedScript.querySelector(selector, document, false);
    expect(element).toBeUndefined();
  });
  it('should return an empty array when no elements match the selector', () => {
    document.body.innerHTML = '<span id="test"></span>';
    const selector = injectedScript.parseSelector('div');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(0);
  });

  it('should return all matching elements for a simple CSS selector', () => {
    document.body.innerHTML = '<div></div><div></div><span></span>';
    const selector = injectedScript.parseSelector('div');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(2);
  });

  it('should return all matching elements for a complex CSS selector', () => {
    document.body.innerHTML =
      '<div class="test"><span></span></div><div class="test"></div>';
    const selector = injectedScript.parseSelector('div.test > span');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(1);
  });

  it('should return elements matching an attribute selector', () => {
    document.body.innerHTML =
      '<div data-test="example"></div><div data-test="example"></div><div></div>';
    const selector = injectedScript.parseSelector('[data-test="example"]');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(2);
  });

  it('should return elements matching a pseudo-class selector', () => {
    document.body.innerHTML = '<div></div><div class="test"></div><div></div>';
    const selector = injectedScript.parseSelector('div:nth-child(2)');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(1);
    expect(elements[0].className).toBe('test');
  });

  it('should return elements matching a combined selector', () => {
    document.body.innerHTML =
      '<div class="test" data-test="example"></div><div class="test"></div>';
    const selector = injectedScript.parseSelector(
      'div.test[data-test="example"]',
    );
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(1);
  });

  it('should return elements matching a descendant selector', () => {
    document.body.innerHTML =
      '<div><span class="test"></span></div><div><span></span></div>';
    const selector = injectedScript.parseSelector('div .test');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(1);
  });

  it('should return elements matching a child selector', () => {
    document.body.innerHTML =
      '<div><span class="test"></span></div><div class="test"><span></span></div>';
    const selector = injectedScript.parseSelector('div > .test');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(1);
  });

  it('should return elements matching a sibling selector', () => {
    document.body.innerHTML = '<div></div><div class="test"></div><div></div>';
    const selector = injectedScript.parseSelector('div + .test');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(1);
  });

  it('should return elements matching a general sibling selector', () => {
    document.body.innerHTML =
      '<div></div><div class="test"></div><div></div><div class="test"></div>';
    const selector = injectedScript.parseSelector('div ~ .test');
    const elements = injectedScript.querySelectorAll(selector, document);
    expect(elements.length).toBe(2);
  });
  it('should calculate the viewport ratio of a visible element', async () => {
    document.body.innerHTML =
      '<div id="test" style="width: 100px; height: 100px;"></div>';
    const targetElement = document.getElementById('test')!;
    const ratio = await injectedScript.viewportRatio(targetElement);
    expect(ratio).toBeGreaterThan(0);
  });

  it('should calculate the viewport ratio of a visible element', async () => {
    document.body.innerHTML =
      '<div id="test" style="width: 100px; height: 100px;"></div>';
    const targetElement = document.getElementById('test')!;

    const intersectionObserverSpy = vi.fn(
      (callback: IntersectionObserverCallback) => {
        callback(
          [{ intersectionRatio: 1 }] as IntersectionObserverEntry[],
          {} as IntersectionObserver,
        );
        return {
          observe: vi.fn(),
          disconnect: vi.fn(),
        };
      },
    );

    vi.stubGlobal('IntersectionObserver', intersectionObserverSpy);

    const ratio = await injectedScript.viewportRatio(targetElement);
    expect(ratio).toBe(1);
    expect(intersectionObserverSpy).toHaveBeenCalled();
  });

  it('should calculate the viewport ratio of a partially visible element', async () => {
    document.body.innerHTML =
      '<div id="test" style="width: 100px; height: 100px;"></div>';
    const targetElement = document.getElementById('test')!;

    const intersectionObserverSpy = vi.fn(
      (callback: IntersectionObserverCallback) => {
        callback(
          [{ intersectionRatio: 0.5 }] as IntersectionObserverEntry[],
          {} as IntersectionObserver,
        );
        return {
          observe: vi.fn(),
          disconnect: vi.fn(),
        };
      },
    );

    vi.stubGlobal('IntersectionObserver', intersectionObserverSpy);

    const ratio = await injectedScript.viewportRatio(targetElement);
    expect(ratio).toBe(0.5);
    expect(intersectionObserverSpy).toHaveBeenCalled();
  });

  it('should calculate the viewport ratio of an invisible element', async () => {
    document.body.innerHTML =
      '<div id="test" style="width: 100px; height: 100px; display: none;"></div>';
    const targetElement = document.getElementById('test')!;

    const intersectionObserverSpy = vi.fn(
      (callback: IntersectionObserverCallback) => {
        callback(
          [{ intersectionRatio: 0 }] as IntersectionObserverEntry[],
          {} as IntersectionObserver,
        );
        return {
          observe: vi.fn(),
          disconnect: vi.fn(),
        };
      },
    );

    vi.stubGlobal('IntersectionObserver', intersectionObserverSpy);

    const ratio = await injectedScript.viewportRatio(targetElement);
    expect(ratio).toBe(0);
    expect(intersectionObserverSpy).toHaveBeenCalled();
  });
  it('should return correct border width for an element with border', () => {
    document.body.innerHTML =
      '<div id="test" style="border: 5px solid black;"></div>';
    const targetElement = document.getElementById('test')!;
    const borderWidth = injectedScript.getElementBorderWidth(targetElement);
    expect(borderWidth).toEqual({ left: 5, top: 5 });
  });

  it('should return zero border width for an element without border', () => {
    document.body.innerHTML = '<div id="test"></div>';
    const targetElement = document.getElementById('test')!;
    const borderWidth = injectedScript.getElementBorderWidth(targetElement);
    expect(borderWidth).toEqual({ left: 0, top: 0 });
  });

  it('should return zero border width for a non-element node', () => {
    const textNode = document.createTextNode('test');
    const borderWidth = injectedScript.getElementBorderWidth(textNode);
    expect(borderWidth).toEqual({ left: 0, top: 0 });
  });

  it('should return zero border width for an element without ownerDocument', () => {
    const element = document.createElement('div');
    const borderWidth = injectedScript.getElementBorderWidth(element);
    expect(borderWidth).toEqual({ left: 0, top: 0 });
    window.getComputedStyle = originalGetComputedStyle;
  });

  it('should return correct border width for an element with different border widths', () => {
    document.body.innerHTML =
      '<div id="test" style="border-left: 3px solid black; border-top: 7px solid black;"></div>';
    const targetElement = document.getElementById('test')!;
    const borderWidth = injectedScript.getElementBorderWidth(targetElement);
    expect(borderWidth).toEqual({ left: 3, top: 7 });
  });
});
