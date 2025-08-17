// pages/content/src/ipc/createPortEvent.ts

import {
  HelloMessage,
  InitializeContentScriptMessage,
  CrxMcpOverCdpSidePanelMessage,
} from '@shared/utils/main';
import { Port } from '@shared/ipc/protocol';
import { Emitter, Event } from 'vs/base/common/event';

export function createPortEvent<TPort extends string>(
  portType: TPort,
): Event<{ port: Port; id: string }> {
  const onCreateMessageChannel = new Emitter<{ port: Port; id: string }>();

  window.addEventListener('message', (event: MessageEvent) => {
    // Only accept messages from the same frame
    if (event.source !== window) {
      return;
    }

    const message = event.data as CrxMcpOverCdpSidePanelMessage<TPort>;

    if (message.type === `crx-mcp-over-cdp-side-panel:create${portType}Port` && event.ports.length > 0) {
      const port2 = event.ports[0];
      const port: Port = {
        name: message.type,
        postMessage: (msg: unknown) => {
          return port2.postMessage(msg);
        },
        disconnect: () => port2.close(),
        onMessage: {
          addListener: (callback: (msg: unknown) => void) => {
            port2.onmessage = (event: MessageEvent) => {
              return callback(event.data);
            };
          },
        },
        onDisconnect: {
          addListener: (callback: () => void) => {
            port2.onmessageerror = () => callback();
          },
        },
      };
      onCreateMessageChannel.fire({ port, id: (message as { id: string }).id });
      port2.postMessage({
        type: `crx-mcp-over-cdp-side-panel:hello:${portType}`,
      } as HelloMessage<TPort>);
    }
  });

  // Send initialize event
  const initializeMessage: InitializeContentScriptMessage<TPort> = {
    type: `crx-mcp-over-cdp-side-panel:initializeContentScript:${portType}`,
  } as InitializeContentScriptMessage<TPort>;
  window.postMessage(initializeMessage, '*');

  return onCreateMessageChannel.event;
}
