import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { ScrollablePanel } from '../components/Panel';
import { BabyAnimalImageSearch } from '../components/BabyAnimalImageSearch';
import { ServiceConsole, logToServiceConsole } from '../components/ServiceConsole';
import { useService } from '../hooks/useService';
import { ICRXMCPService } from '@shared/services/crxMCP.service';

const useStyles = makeStyles({
  root: {
    flexBasis: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    height: '100%',
  },
  searchPanel: {
    flexShrink: 0,
    minHeight: 0,
  },
  consolePanel: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
});

export const Main: React.FC = () => {
  const styles = useStyles();
  const crxMcpService = useService(ICRXMCPService);

  // Handle console commands
  const handleCommand = (command: string) => {
    const cmd = command.toLowerCase().split(' ')[0];

    switch (cmd) {
      case 'help':
        logToServiceConsole('system', 'info', 'Available commands:');
        logToServiceConsole('system', 'info', '  help - Show this help');
        logToServiceConsole('system', 'info', '  clear - Clear console');
        logToServiceConsole('system', 'info', '  status - Show system status');
        logToServiceConsole('system', 'info', '  test-events - Test agent event streaming');
        break;

      case 'clear':
        // The clear functionality is built into the ServiceConsole button
        logToServiceConsole('system', 'info', 'Console cleared');
        break;

      case 'status':
        logToServiceConsole('system', 'info', 'Side panel: Active');
        logToServiceConsole('system', 'info', 'Baby elephant search: Ready');
        break;

      case 'test-events':
        logToServiceConsole('system', 'info', 'Testing agent event streaming...');
        crxMcpService.testAgentEvents();
        break;

      default:
        logToServiceConsole(
          'system',
          'error',
          `Unknown command: ${cmd}. Type 'help' for available commands.`,
        );
    }
  };

  // Initialize console with welcome message
  React.useEffect(() => {
    setTimeout(() => {
      logToServiceConsole('system', 'info', 'Side panel initialized');
      logToServiceConsole('system', 'info', 'Type "help" for available commands');
    }, 500);
  }, []);

  return (
    <div data-test-id="main" className={styles.root}>
      {/* Search panel: input and button */}
      <div className={styles.searchPanel}>
        <ScrollablePanel>
          <BabyAnimalImageSearch />
        </ScrollablePanel>
      </div>
      {/* Console panel: below the search */}
      <div className={styles.consolePanel}>
        <ServiceConsole onCommand={handleCommand} />
      </div>
    </div>
  );
};
