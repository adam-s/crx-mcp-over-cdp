export interface IBaseMessage {
  type: string;
}

export interface IDocumentIdMessage extends IBaseMessage {
  type: 'crx-mcp-over-cdp-side-panel:requestDocumentId';
}

export interface IWindowIdMessage extends IBaseMessage {
  type: 'crx-mcp-over-cdp-side-panel:requestWindowId';
}

export interface IConsoleLogMessage extends IBaseMessage {
  type: 'crx-mcp-over-cdp-side-panel:console.log';
  [key: string]: unknown;
}

export interface ICreateMAINPortMessage extends IBaseMessage {
  type: 'crx-mcp-over-cdp-side-panel:createMAINPort';
  id: string;
}

export const CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_VISIBILITY_CHANGE = 'crx-mcp-over-cdp-side-panel:sidePanelVisibilityChange';
export interface ISidePanelVisibilityChangeMessage extends IBaseMessage {
  type: typeof CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_VISIBILITY_CHANGE;
  open: boolean;
  windowId: number;
}

export const CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_RELOAD = 'crx-mcp-over-cdp-side-panel:sidePanelReload';
export interface ISidePanelReloadMessage extends IBaseMessage {
  type: typeof CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_RELOAD;
  windowId: number;
}

export interface IInformationResponse {
  documentId?: string;
  windowId?: number;
  tabId?: number;
  frameId?: number;
  error?: string;
}

export type DocumentMessage =
  | IDocumentIdMessage
  | IWindowIdMessage
  | IConsoleLogMessage
  | ICreateMAINPortMessage
  | ISidePanelVisibilityChangeMessage
  | ISidePanelReloadMessage
  | { type: 'crx-mcp-over-cdp-side-panel:requestInformation' }
  | IIPCMessageTypes;

export interface IDocumentIdResponse {
  documentId?: string;
  error?: string;
}

export interface IWindowIdResponse {
  windowId?: number;
  error?: string;
}

export const CRX_MCP_OVER_CDP_SIDE_PANEL_MESSAGE = 'crx-mcp-over-cdp-side-panel:message';
export const CRX_MCP_OVER_CDP_SIDE_PANEL_HELLO = 'crx-mcp-over-cdp-side-panel:hello';
export const CRX_MCP_OVER_CDP_SIDE_PANEL_DISCONNECT = 'crx-mcp-over-cdp-side-panel:disconnect';
export const CRX_MCP_OVER_CDP_SIDE_PANEL_RECONNECT = 'crx-mcp-over-cdp-side-panel:reconnect';

export interface IIPCMessage {
  type: string;
}

export interface IIPCHelloMessage extends IIPCMessage {
  type: typeof CRX_MCP_OVER_CDP_SIDE_PANEL_HELLO;
  source: string;
}

export interface IIPCDisconnectMessage extends IIPCMessage {
  type: typeof CRX_MCP_OVER_CDP_SIDE_PANEL_DISCONNECT;
  source: string;
  target: string;
}

export interface IIPCReconnectMessage extends IIPCMessage {
  type: typeof CRX_MCP_OVER_CDP_SIDE_PANEL_RECONNECT;
  source: string;
  target: string;
}

export interface IIPCDataMessage extends IIPCMessage {
  type: typeof CRX_MCP_OVER_CDP_SIDE_PANEL_MESSAGE;
  source: string;
  body: number[];
  target?: string;
}

export type IIPCMessageTypes = IIPCHelloMessage | IIPCDisconnectMessage | IIPCDataMessage;

export interface Message {
  type: string;
  source: string;
  body: number[]; // Serialized as an array of numbers
  target: string;
}

export type DocumentResponse =
  | IDocumentIdResponse
  | IWindowIdResponse
  | IInformationResponse
  | { error: string };
