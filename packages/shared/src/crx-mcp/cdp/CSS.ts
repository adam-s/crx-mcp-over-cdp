import { ChromeExtensionDriver } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';
import * as DOM from './DOM';

// Re-export Protocol types for convenience
export type StyleSheetId = Protocol.CSS.StyleSheetId;
export type StyleSheetOrigin = Protocol.CSS.StyleSheetOrigin;
export type SourceRange = Protocol.CSS.SourceRange;
export type Specificity = Protocol.CSS.Specificity;
export type Value = Protocol.CSS.Value;
export type SelectorList = Protocol.CSS.SelectorList;
export type CSSProperty = Protocol.CSS.CSSProperty;
export type CSSComputedStyleProperty = Protocol.CSS.CSSComputedStyleProperty;
export type ShorthandEntry = Protocol.CSS.ShorthandEntry;
export type CSSStyle = Protocol.CSS.CSSStyle;
export type CSSRule = Protocol.CSS.CSSRule;
export type RuleMatch = Protocol.CSS.RuleMatch;
export type PseudoElementMatches = Protocol.CSS.PseudoElementMatches;
export type InheritedStyleEntry = Protocol.CSS.InheritedStyleEntry;
export type CSSMedia = Protocol.CSS.CSSMedia;
export type MediaQuery = Protocol.CSS.MediaQuery;
export type MediaQueryExpression = Protocol.CSS.MediaQueryExpression;
export type CSSContainerQuery = Protocol.CSS.CSSContainerQuery;
export type CSSSupports = Protocol.CSS.CSSSupports;
export type CSSLayer = Protocol.CSS.CSSLayer;
export type CSSScope = Protocol.CSS.CSSScope;
export type CSSRuleType = Protocol.CSS.CSSRuleType;
export type CSSStartingStyle = Protocol.CSS.CSSStartingStyle;
export type RuleUsage = Protocol.CSS.RuleUsage;
export type CSSStyleSheetHeader = Protocol.CSS.CSSStyleSheetHeader;
export type PlatformFontUsage = Protocol.CSS.PlatformFontUsage;

export class CSS {
  private driver: ChromeExtensionDriver;

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
  }

  async getComputedStyleForNode(nodeId: DOM.NodeId): Promise<CSSComputedStyleProperty[]> {
    const result = await this.driver.sendAndGetDevToolsCommand('CSS.getComputedStyleForNode', {
      nodeId,
    });
    return (result as { computedStyle: CSSComputedStyleProperty[] }).computedStyle;
  }
}
