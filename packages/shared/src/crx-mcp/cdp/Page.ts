import { ChromeExtensionDriver, CDPSession } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type AppManifestError = Protocol.Page.AppManifestError;
export type DialogType = Protocol.Page.DialogType;
export type FrameId = Protocol.Page.FrameId;
export type ScriptIdentifier = Protocol.Page.ScriptIdentifier;
export type Frame = Protocol.Page.Frame;
export type FrameTree = Protocol.Page.FrameTree;
export type LayoutViewport = Protocol.Page.LayoutViewport;
export type NavigationEntry = Protocol.Page.NavigationEntry;
export type TransitionType = Protocol.Page.TransitionType;
export type VisualSnapshotTakerViewport = Protocol.Page.VisualViewport;
export type Viewport = Protocol.Page.Viewport;
export type AdFrameStatus = Protocol.Page.AdFrameStatus;
export type AdFrameType = Protocol.Page.AdFrameType;
export type AdFrameExplanation = Protocol.Page.AdFrameExplanation;
export type SecurityOriginDetails = Protocol.Page.SecurityOriginDetails;
export type SecureContextType = Protocol.Page.SecureContextType;
export type CrossOriginIsolatedContextType = Protocol.Page.CrossOriginIsolatedContextType;
export type GatedAPIFeature = Protocol.Page.GatedAPIFeatures;

export class Page {
  private driver: ChromeExtensionDriver;
  private cdpSession!: CDPSession;
  private messages: string[];

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
    this.messages = [];
  }

  async init(cdpSession: CDPSession) {
    this.cdpSession = cdpSession;
    await this.cdpSession.send('Page.enable');
    //await this.cdpSession.send("Page.setLifecycleEventsEnabled", {enabled: true});

    // Set up event listeners for page events
    this.cdpSession.on('Page.windowOpen', (params: unknown) => {
      const event = params as Protocol.Page.WindowOpenEvent;
      this.messages.push('Open URL in window ' + event.url);
    });

    this.cdpSession.on('Page.frameNavigated', (params: unknown) => {
      const event = params as Protocol.Page.FrameNavigatedEvent;
      this.messages.push('Navigate frame (' + event.type + ') to' + event.frame.url);
    });

    this.cdpSession.on('Page.navigatedWithinDocument', (params: unknown) => {
      const event = params as Protocol.Page.NavigatedWithinDocumentEvent;
      this.messages.push('Navigate within document (' + event.navigationType + ') to' + event.url);
    });

    this.cdpSession.on('Page.navigateToHistoryEntry', () => {
      this.messages.push('Navigate within history');
    });
  }

  getMessages() {
    const toReturn = JSON.stringify(this.messages);
    this.messages = [];
    return toReturn;
  }

  async captureScreenshot() {
    const result = await this.driver.sendAndGetDevToolsCommand('Page.captureScreenshot', {
      format: 'jpeg',
      captureBeyondViewport: true,
      fromSurface: true,
    });
    return (result as { data: string }).data;
  }

  /*  getNodeImage() {
      nodeQuads = self.driver.execute_cdp_cmd("DOM.getContentQuads", {'backendNodeId': backendNodeId})
      boxModel = self.driver.execute_cdp_cmd("DOM.getBoxModel", {'backendNodeId': backendNodeId})
  
      topLeftX = nodeQuads['quads'][0][0]
      topLeftY = nodeQuads['quads'][0][1]
  
      screenshoot = self.driver.execute_cdp_cmd("Page.captureScreenshot", {"format": "jpeg", "captureBeyondViewport": True, "clip": {"x": topLeftX, "y": topLeftY, "width": boxModel['model']['width'], "height": boxModel['model']['height'], "scale": 1}})
      return base64.b64decode(screenshoot['data'])
    }*/
}
