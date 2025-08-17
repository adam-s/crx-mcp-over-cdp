import { DOM, Node } from './cdp/DOM';
import { DOMNode, DOMSnapshotResultGetSnapshot } from './cdp/DOMSnapshot';
import { DomInteractionsOperator } from './DomInteractionsOperator';

import { Page } from './cdp/Page';
import { DOMDebugger } from './cdp/DOMDebugger';

interface InteractibleElement {
  node: Node;
  boxModel: BoxModel;
  listeners: EventListener[];
  nativeInteractions: string[] | undefined;
}

interface BoxModel {
  content: number[];
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;
}

interface EventListener {
  type: string;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
  handler?: {
    type: string;
    objectId?: string;
    value?: string;
  };
}

export class VisualSnapshotTaker {
  page: Page;
  dom: DOM;
  domDebugger: DOMDebugger;
  interactor: DomInteractionsOperator;

  constructor(page: Page, dom: DOM, domDebugger: DOMDebugger, interactor: DomInteractionsOperator) {
    this.page = page;
    this.dom = dom;
    this.domDebugger = domDebugger;
    this.interactor = interactor;
  }

  async drawRects(imageBase64: string, snapshot: DOMSnapshotResultGetSnapshot): Promise<string> {
    const imageBuffer = this.base64ToArrayBuffer(imageBase64);

    const image = await this.createImageBitmap(imageBuffer);

    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    ctx.drawImage(image, 0, 0);

    const frontier = [snapshot.domNodes[0]];
    let currentNode = frontier.pop();
    let processedNodes = 0;

    while (currentNode) {
      processedNodes++;
      if (processedNodes % 100 === 0) {
        console.log(`Processed ${processedNodes} nodes`);
      }

      if (currentNode.childNodeIndexes) {
        for (const [, childNodeIndex] of currentNode.childNodeIndexes.entries()) {
          const child = snapshot.domNodes[childNodeIndex];
          frontier.push(child);
        }
      }
      await this.drawRectsOn(ctx, currentNode, snapshot);

      currentNode = frontier.pop();
    }

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 });
    const result = await this.blobToBase64(blob);
    return result;
  }

  async drawRectsOn(
    ctx: OffscreenCanvasRenderingContext2D,
    node: DOMNode,
    snapshot: DOMSnapshotResultGetSnapshot,
  ): Promise<void> {
    let draw = false;
    if (node.nodeName === 'A') {
      draw = true;
    }
    if (node.eventListeners && node.eventListeners.length !== 0) {
      draw = true;
    }

    if (draw && node.layoutNodeIndex) {
      const layout = snapshot.layoutTreeNodes[node.layoutNodeIndex];
      const boundingBox = layout.boundingBox;
      const x = boundingBox.x;
      const y = boundingBox.y;
      const width = boundingBox.width;
      const height = boundingBox.height;
      this.drawOnCtx(ctx, node.backendNodeId.toString(), x, y, height, width);
    }
  }

  async draw(
    imageBase64: string,
    x: number,
    y: number,
    h: number,
    w: number,
    id: number,
  ): Promise<string> {
    const imageBuffer = this.base64ToArrayBuffer(imageBase64);
    const image = await this.createImageBitmap(imageBuffer);

    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    ctx.drawImage(image, 0, 0);

    this.drawOnCtx(ctx, id.toString(), x, y, w, h);

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 });
    const result = await this.blobToBase64(blob);
    return result;
  }

  drawOnCtx(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    h: number,
    w: number,
  ): void {
    const rect = {
      x: x,
      y: y,
      width: w,
      height: h,
    };

    // Draw rectangle
    ctx.fillStyle = 'green'; // green with 50% opacity
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    // Set font and measure text
    ctx.font = '20px sans-serif';
    const padding = 4;
    const textWidth = ctx.measureText(label).width;
    const textHeight = 48; // Manually estimated height for 20px font

    // Draw red background behind the text
    ctx.fillStyle = 'green'; // green with 50% opacity
    ctx.fillRect(rect.x + rect.width / 2, rect.y, textWidth + 2 * padding, textHeight);

    // Draw blue text over the red background
    ctx.fillStyle = 'yellow'; // green with 50% opacity
    ctx.fillText(label, rect.x + padding + rect.width / 2, rect.y + textHeight - 6); // Adjust baseline
  }

  async mergeImages2(originalImageBase64: string, imageBase64: string): Promise<string> {
    const img1Buffer = this.base64ToArrayBuffer(originalImageBase64);
    const img2Buffer = this.base64ToArrayBuffer(imageBase64);
    const img1 = await this.createImageBitmap(img1Buffer);
    const img2 = await this.createImageBitmap(img2Buffer);

    const canvas = new OffscreenCanvas(img1.width, img1.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    // Draw first image at full opacity
    ctx.drawImage(img1, 0, 0, canvas.width, canvas.height);

    // Set 50% opacity for the second image
    ctx.globalAlpha = 0.5;

    // Draw second image on top
    ctx.drawImage(img2, 0, 0, canvas.width, canvas.height);

    // Reset opacity to default
    ctx.globalAlpha = 1.0;

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 });
    const result = await this.blobToBase64(blob);
    return result;
  }

  async mergeImages(originalImageBase64: string, imageBase64: string): Promise<string> {
    const image1Buffer = this.base64ToArrayBuffer(originalImageBase64);
    const image1 = await this.createImageBitmap(image1Buffer);
    const canvas1 = new OffscreenCanvas(image1.width, image1.height);
    const ctx1 = canvas1.getContext('2d');
    if (!ctx1) {
      throw new Error('Failed to get 2D context');
    }
    ctx1.drawImage(image1, 0, 0);
    const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);

    const image2Buffer = this.base64ToArrayBuffer(imageBase64);
    const image2 = await this.createImageBitmap(image2Buffer);
    const canvas2 = new OffscreenCanvas(image2.width, image2.height);
    const ctx2 = canvas2.getContext('2d');
    if (!ctx2) {
      throw new Error('Failed to get 2D context');
    }
    ctx2.drawImage(image2, 0, 0);
    const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

    for (let i = 0; i < imageData2.data.length; i += 4) {
      if (
        imageData1.data[i] !== imageData2.data[i] ||
        imageData1.data[i + 2] !== imageData2.data[i + 1] ||
        imageData1.data[i + 2] !== imageData2.data[i + 2]
      ) {
        imageData2.data[i] = (imageData1.data[i] + imageData2.data[i]) / 2;
        imageData2.data[i + 1] = (imageData1.data[i + 1] + imageData2.data[i + 1]) / 2;
        imageData2.data[i + 2] = (imageData1.data[i + 2] + imageData2.data[i + 2]) / 2;
      }
    }
    ctx2.putImageData(imageData2, 0, 0);

    const blob = await canvas2.convertToBlob({ type: 'image/jpeg', quality: 1 });
    const result = await this.blobToBase64(blob);
    return result;
  }

  async dumpImage(imageBase64: string, name: string): Promise<void> {
    const imageBuffer = this.base64ToArrayBuffer(imageBase64);
    const image = await this.createImageBitmap(imageBuffer);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    ctx.drawImage(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 });

    // In a service worker, we can't write to filesystem directly
    // Instead, we can download the blob or store it
    console.log(`Image ${name} created as blob:`, blob);
  }

  async crop(
    imageBase64: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<string> {
    const imageBuffer = this.base64ToArrayBuffer(imageBase64);
    const image = await this.createImageBitmap(imageBuffer);

    if (x === -1) {
      x = 0;
    }
    if (y === -1) {
      y = 0;
    }
    if (width === -1) {
      width = image.width;
    }
    if (height === -1) {
      height = image.height;
    }

    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    // Set canvas size to cropped image size
    canvas.width = width;
    canvas.height = height;

    // Draw the cropped image portion onto the canvas
    ctx.drawImage(
      image,
      x,
      y, // Start cropping from (x, y) on the image
      width,
      height, // Crop width and height
      0,
      0, // Place at top-left of canvas
      width,
      height, // Draw at original size
    );

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 });
    const result = await this.blobToBase64(blob);
    return result;
  }

  async takeImage(): Promise<void> {
    const originalImageBase64: string = await this.page.captureScreenshot();
    await this.dumpImage(originalImageBase64, 'imgOriginal.jpg');
  }

  async enrichImage(node: Node, imageBase64: string): Promise<string> {
    const interactElemenBoxes = await this.getInteractibleElementBoxes(node);

    for (const intarElemBox of interactElemenBoxes) {
      // 2 == window.devicePixelRatio
      const x = intarElemBox.boxModel.margin[0] * 2;
      const y = intarElemBox.boxModel.margin[1] * 2;
      const width = intarElemBox.boxModel.width * 2;
      const height = intarElemBox.boxModel.height * 2;
      //await cdp.overlay.highlightNode(node.backendNodeId);
      imageBase64 = await this.draw(imageBase64, x, y, height, width, node.backendNodeId);
    }

    return imageBase64;
  }

  async getInteractibleElementBoxes(node: Node): Promise<InteractibleElement[]> {
    let toReturn: InteractibleElement[] = [];

    const pNodeResolved = await this.dom.resolveNode(node.nodeId);
    if (pNodeResolved.objectId) {
      const listeners: EventListener[] = await this.domDebugger.getEventListeners(
        pNodeResolved.objectId,
      );
      const nativeInteractions: string[] | undefined =
        await this.interactor.getNativeInteractions(node);

      if (listeners.length !== 0 || nativeInteractions) {
        try {
          const boxModel = await this.dom.getBoxModel(node.nodeId, node.backendNodeId);
          toReturn.push({
            node: node,
            boxModel: boxModel,
            listeners: listeners,
            nativeInteractions: nativeInteractions,
          });
        } catch (e: unknown) {
          // Handle error silently or log it
          console.warn(
            `#####3 [VisualSnapshotTaker.getInteractibleElementBoxes] Failed to get box model for node:`,
            e,
          );
          console.warn('Failed to get box model for node:', e);
        }
      }
    }

    if (node['nodeName'] !== '#text') {
      if (node.children) {
        for (const child of node.children) {
          const childBoxes = await this.getInteractibleElementBoxes(child);
          toReturn = toReturn.concat(childBoxes);
        }
      }
    }

    return toReturn;
  }

  // Helper methods for working with base64 and blobs
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async createImageBitmap(buffer: ArrayBuffer): Promise<ImageBitmap> {
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const bitmap = await createImageBitmap(blob);
    return bitmap;
  }
}
