import React from 'react';
import { ServiceConsole, logToServiceConsole } from './ServiceConsole';

/**
 * Example usage of ServiceConsole component
 *
 * This demonstrates how to integrate the ServiceConsole into your side panel
 * and how services can log messages to it.
 */

// Example service integration
export class ExampleCrxMcpService {
  private _isRunning = false;

  start() {
    this._isRunning = true;
    logToServiceConsole('crxMCP', 'info', 'Service starting...');

    // Simulate service operations
    setTimeout(() => {
      logToServiceConsole('crxMCP', 'success', 'Connection established to CDP');
    }, 1000);

    setTimeout(() => {
      logToServiceConsole('crxMCP', 'info', 'Waiting for MCP requests...');
    }, 1500);
  }

  stop() {
    this._isRunning = false;
    logToServiceConsole('crxMCP', 'warning', 'Service stopping...');
    logToServiceConsole('crxMCP', 'info', 'Connection closed');
  }

  logError(error: string) {
    logToServiceConsole('crxMCP', 'error', `Error: ${error}`);
  }

  get isRunning() {
    return this._isRunning;
  }
}

export class ExampleBabyElephantService {
  private _currentTask: string | null = null;

  startTask(description: string) {
    this._currentTask = description;
    logToServiceConsole('babyElephantV2', 'info', `Starting task: ${description}`);
  }

  logTaskProgress(step: string) {
    if (this._currentTask) {
      logToServiceConsole('babyElephantV2', 'debug', `Step: ${step}`);
    }
  }

  completeTask(result: string) {
    logToServiceConsole('babyElephantV2', 'success', `Task completed: ${result}`);
    this._currentTask = null;
  }

  failTask(reason: string) {
    logToServiceConsole('babyElephantV2', 'error', `Task failed: ${reason}`);
    this._currentTask = null;
  }
}

// Example React component that includes the ServiceConsole
export const SidePanelWithConsole: React.FC = () => {
  const [crxService] = React.useState(() => new ExampleCrxMcpService());
  const [elephantService] = React.useState(() => new ExampleBabyElephantService());

  // Handle console commands
  const handleCommand = (command: string) => {
    const [cmd, ...args] = command.toLowerCase().split(' ');

    switch (cmd) {
      case 'start':
        if (args[0] === 'crx') {
          crxService.start();
        } else if (args[0] === 'elephant') {
          elephantService.startTask(args.slice(1).join(' ') || 'Default task');
        } else {
          logToServiceConsole('system', 'error', 'Usage: start [crx|elephant] [task description]');
        }
        break;

      case 'stop':
        if (args[0] === 'crx') {
          crxService.stop();
        } else {
          logToServiceConsole('system', 'error', 'Usage: stop crx');
        }
        break;

      case 'status':
        logToServiceConsole(
          'system',
          'info',
          `CRX Service: ${crxService.isRunning ? 'Running' : 'Stopped'}`,
        );
        logToServiceConsole(
          'system',
          'info',
          `Elephant Task: ${elephantService['_currentTask'] || 'None'}`,
        );
        break;

      case 'help':
        logToServiceConsole('system', 'info', 'Available commands:');
        logToServiceConsole('system', 'info', '  start crx - Start CRX service');
        logToServiceConsole('system', 'info', '  start elephant [task] - Start elephant task');
        logToServiceConsole('system', 'info', '  stop crx - Stop CRX service');
        logToServiceConsole('system', 'info', '  status - Show service status');
        logToServiceConsole('system', 'info', '  help - Show this help');
        break;

      default:
        logToServiceConsole(
          'system',
          'error',
          `Unknown command: ${cmd}. Type 'help' for available commands.`,
        );
    }
  };

  // Simulate some initial system messages
  React.useEffect(() => {
    logToServiceConsole('system', 'info', 'Side panel initialized');
    logToServiceConsole('system', 'info', 'Type "help" for available commands');
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Your other side panel content here */}
      <div style={{ padding: '16px', backgroundColor: '#f5f5f5' }}>
        <h2>Side Panel Example</h2>
        <p>This is your main side panel content. The console below shows service status.</p>
      </div>

      {/* Service Console */}
      <ServiceConsole onCommand={handleCommand} />
    </div>
  );
};

export default SidePanelWithConsole;
