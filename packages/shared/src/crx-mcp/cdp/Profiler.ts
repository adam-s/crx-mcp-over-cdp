import { ChromeExtensionDriver, CDPSession } from '../chromeExtensionDriver';
import type Protocol from 'devtools-protocol';

// Re-export Protocol types for convenience
export type Profile = Protocol.Profiler.Profile;
export type ProfileNode = Protocol.Profiler.ProfileNode;
export type PositionTickInfo = Protocol.Profiler.PositionTickInfo;
export type CoverageRange = Protocol.Profiler.CoverageRange;
export type FunctionCoverage = Protocol.Profiler.FunctionCoverage;
export type ScriptCoverage = Protocol.Profiler.ScriptCoverage;

export class Profiler {
  private driver: ChromeExtensionDriver;
  private cdpSession!: CDPSession;
  private messages: unknown[];

  constructor(driver: ChromeExtensionDriver) {
    this.driver = driver;
    this.messages = [];
  }

  async init(cdpSession: CDPSession) {
    this.cdpSession = cdpSession;
    await this.cdpSession.send('Profiler.enable');

    // Set up event listeners for profiler events
    this.cdpSession.on('Profiler.consoleProfileStarted', (params: unknown) => {
      console.log(params);
    });

    this.cdpSession.on('Profiler.consoleProfileFinished', (params: unknown) => {
      console.log(params);
    });
  }

  getMessages() {
    const toReturn = JSON.stringify(this.messages);
    this.messages = [];
    return toReturn;
  }

  async start() {
    await this.cdpSession.send('Profiler.start');
  }

  async stop(): Promise<Protocol.Profiler.StopResponse> {
    return await this.cdpSession.send<Protocol.Profiler.StopResponse>('Profiler.stop');
  }

  async stopAndGetCalledFunctions() {
    const toReturn: string[] = [];
    const profilerProfile = await this.stop();
    for (const profileNode of profilerProfile.profile.nodes) {
      if (profileNode.callFrame.functionName) {
        toReturn.push(
          profileNode.callFrame.functionName +
            ' ' +
            profileNode.callFrame.lineNumber +
            ':' +
            profileNode.callFrame.columnNumber,
        );
      }
    }
    if (toReturn.length) {
      return (
        'The following function were called client-side, seen from Profiler/Performance view: ' +
        JSON.stringify(toReturn)
      );
    } else {
      return '';
    }
  }
}
