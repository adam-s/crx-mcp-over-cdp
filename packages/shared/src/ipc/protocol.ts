/* eslint-disable @typescript-eslint/no-explicit-any */
import { VSBuffer } from 'vs/base/common/buffer';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';

export interface Port {
  name: string;
  postMessage(message: any): void;
  disconnect(): void;
  onMessage: {
    addListener(callback: (message: any) => void): void;
    removeListener?(callback: (message?: any) => void): void;
  };
  onDisconnect: {
    addListener(callback: () => void): void;
    removeListener?(callback: (message?: any) => void): void;
  };
}

export class Protocol implements IMessagePassingProtocol {
  constructor(
    private port: Port,
    readonly onMessage: Event<VSBuffer>,
  ) {}

  send(message: VSBuffer): void {
    try {
      // Grab the underlying ArrayBuffer
      const buffer = message.buffer;
      // Send it *without* copying as a Transferable
      this.port.postMessage(buffer);
    } catch (e) {
      console.error('Error sending message:', e);
    }
  }

  disconnect(): void {
    this.port.disconnect();
  }
}
