import { ChromeExtensionDriver, CDPSession } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type RemoteObjectId = Protocol.Runtime.RemoteObjectId;
export type ScriptId = Protocol.Runtime.ScriptId;
export type ExecutionContextId = Protocol.Runtime.ExecutionContextId;
export type UnserializableValue = Protocol.Runtime.UnserializableValue;
export type Timestamp = Protocol.Runtime.Timestamp;
export type TimeDelta = Protocol.Runtime.TimeDelta;
export type UniqueDebuggerId = Protocol.Runtime.UniqueDebuggerId;
export type CallArgument = Protocol.Runtime.CallArgument;
export type CallFrame = Protocol.Runtime.CallFrame;
export type DeepSerializedValue = Protocol.Runtime.DeepSerializedValue;
export type ExceptionDetails = Protocol.Runtime.ExceptionDetails;
export type ExecutionContextDescription = Protocol.Runtime.ExecutionContextDescription;
export type InternalPropertyDescriptor = Protocol.Runtime.InternalPropertyDescriptor;
export type PropertyDescriptor = Protocol.Runtime.PropertyDescriptor;
export type RemoteObject = Protocol.Runtime.RemoteObject;
export type SerializationOptions = Protocol.Runtime.SerializationOptions;
export type StackTrace = Protocol.Runtime.StackTrace;
export type ObjectPreview = Protocol.Runtime.ObjectPreview;
export type CustomPreview = Protocol.Runtime.CustomPreview;
// CallFunctionReturnObject is not directly exported, so we define it based on the response
export interface CallFunctionReturnObject {
  result: RemoteObject;
  exceptionDetails?: ExceptionDetails;
}

// Additional Protocol types that might not be directly exported
export type StackTraceId = Protocol.Runtime.StackTraceId;
export type EntryPreview = Protocol.Runtime.EntryPreview;
export type PropertyPreview = Protocol.Runtime.PropertyPreview;

export class Runtime {
  private driver: ChromeExtensionDriver;
  private cdpSession!: CDPSession;
  private messages: Protocol.Runtime.ExceptionThrownEvent[];

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
    this.messages = [];
  }

  async init(cdpSession: CDPSession) {
    this.cdpSession = cdpSession;
    await this.cdpSession.send('Runtime.enable');

    // Set up event listener for runtime exceptions
    this.cdpSession.on('Runtime.exceptionThrown', (params: unknown) => {
      const event = params as Protocol.Runtime.ExceptionThrownEvent;
      // [{"method":"Runtime.exceptionThrown","params":{"timestamp":1748172962768.486,"exceptionDetails":{"exceptionId":1,"text":"Uncaught","lineNumber":0,"columnNumber":0,"scriptId":"17","stackTrace":{"callFrames":[{"functionName":"onclick","scriptId":"17","url":"","lineNumber":0,"columnNumber":0}]},"exception":{"type":"object","subtype":"error","className":"ReferenceError","description":"ReferenceError: log is not defined\n    at HTMLButtonElement.onclick (data:,:1:1)","objectId":"2321626513033391675.1.1","preview":{"type":"object","subtype":"error","description":"ReferenceError: log is not defined\n    at HTMLButtonElement.onclick (data:,:1:1)","overflow":false,"properties":[{"name":"stack","type":"string","value":"ReferenceError: log is not defined\n    at HTMLButtonElement.onclick (data:,:1:1)"},{"name":"message","type":"string","value":"log is not defined"}]}},"executionContextId":1}},"sessionId":"8D330913791392529CA5F9221F282C04"}]
      this.messages.push(event);
    });
  }

  getExceptionThrownMessages() {
    let toReturn = '';
    if (this.messages.length !== 0) {
      toReturn =
        'Unhandeled exception in browser console: ' +
        JSON.stringify(
          this.messages.map((msg: Protocol.Runtime.ExceptionThrownEvent) => {
            return msg.exceptionDetails.exception?.description?.replaceAll('\\n', '\n') || '';
          }),
        );
    }
    this.messages = [];
    return toReturn;
  }

  async callFunctionOn(
    functionDeclaration: string,
    objectId?: RemoteObjectId,
    theArguments?: CallArgument[],
  ): Promise<CallFunctionReturnObject> {
    const result = (await this.driver.sendAndGetDevToolsCommand('Runtime.callFunctionOn', {
      functionDeclaration,
      objectId,
      arguments: theArguments,
    })) as CallFunctionReturnObject;
    return result;
  }
}
