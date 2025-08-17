// Generic message interfaces for port types
export interface InitializeContentScriptMessage<TPort extends string> {
  type: `crx-mcp-over-cdp-side-panel:initializeContentScript:${TPort}`;
}

export interface CreateMainPortMessage<TPort extends string> {
  type: `crx-mcp-over-cdp-side-panel:create${TPort}Port`;
  id: string;
}

export interface HelloMessage<TPort extends string> {
  type: `crx-mcp-over-cdp-side-panel:hello:${TPort}`;
}

export type CrxMcpOverCdpSidePanelMessage<TPort extends string> =
  | InitializeContentScriptMessage<TPort>
  | CreateMainPortMessage<TPort>
  | HelloMessage<TPort>;

// Define the Port interface
export interface Port<TPort extends string = string> {
  name: string;
  postMessage: (message: CrxMcpOverCdpSidePanelMessage<TPort>) => void;
  disconnect: () => void;
  onMessage: {
    addListener: (callback: (message: CrxMcpOverCdpSidePanelMessage<TPort>) => void) => void;
  };
  onDisconnect: {
    addListener: (callback: () => void) => void;
  };
}
