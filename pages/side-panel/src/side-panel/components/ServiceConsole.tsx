import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { PlayRegular, DeleteRegular } from '@fluentui/react-icons';
import { DarkScrollContainer } from './common/DarkScrollContainer';
import type {
  LogEntry,
  LogLevel,
  ServiceConsoleInterface,
} from '@shared/types/serviceConsole.types';

// Global window interface extension
declare global {
  interface Window {
    serviceConsole?: ServiceConsoleInterface;
  }
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
  },
  console: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    fontFamily: 'Consolas, "Courier New", Monaco, monospace',
    fontSize: '12px',
    lineHeight: '1.4',
    padding: '12px',
    overflow: 'auto',
    minHeight: 0,
    borderRadius: tokens.borderRadiusSmall,
  },
  logEntry: {
    marginBottom: '2px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  timestamp: {
    color: '#808080',
    marginRight: '8px',
  },
  service: {
    color: '#569cd6',
    marginRight: '8px',
  },
  level: {
    marginRight: '8px',
    fontWeight: 'bold',
  },
  info: {
    color: '#4ec9b0',
  },
  success: {
    color: '#b5cea8',
  },
  warning: {
    color: '#dcdcaa',
  },
  error: {
    color: '#f44747',
  },
  debug: {
    color: '#9cdcfe',
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#1e1e1e',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  prompt: {
    color: '#4ec9b0',
    fontFamily: 'Consolas, "Courier New", Monaco, monospace',
    fontSize: '12px',
    marginRight: '8px',
    userSelect: 'none',
  },
  commandInput: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#d4d4d4',
    fontFamily: 'Consolas, "Courier New", Monaco, monospace',
    fontSize: '12px',
    padding: '4px',
    outline: 'none',
    '&::placeholder': {
      color: '#808080',
    },
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#808080',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

// Export the shared types for backward compatibility
export type { LogLevel, LogEntry } from '@shared/types/serviceConsole.types';

interface ServiceConsoleProps {
  onCommand?: (command: string) => void;
  maxEntries?: number;
}

export const ServiceConsole: React.FC<ServiceConsoleProps> = ({ onCommand, maxEntries = 1000 }) => {
  const styles = useStyles();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [command, setCommand] = useState('');
  const consoleRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = useCallback(
    (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
      const newEntry: LogEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      };

      setLogs(prev => {
        const newLogs = [...prev, newEntry];
        return newLogs.length > maxEntries ? newLogs.slice(-maxEntries) : newLogs;
      });
    },
    [maxEntries],
  );

  const clearLogs = () => {
    setLogs([]);
  };

  const handleCommandSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && command.trim()) {
      // Add command to console as user input
      addLog({
        service: 'system',
        level: 'info',
        message: `$ ${command}`,
      });

      // Execute command
      if (onCommand) {
        onCommand(command.trim());
      }

      setCommand('');
    }
  };

  const getLevelClassName = (level: LogLevel): string => {
    switch (level) {
      case 'info':
        return styles.info;
      case 'success':
        return styles.success;
      case 'warning':
        return styles.warning;
      case 'error':
        return styles.error;
      case 'debug':
        return styles.debug;
      default:
        return styles.info;
    }
  };

  const formatTimestamp = (timestamp: Date): string => {
    return timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  // Expose addLog function globally so services can use it
  useEffect(() => {
    window.serviceConsole = { addLog };
    return () => {
      delete window.serviceConsole;
    };
  }, [addLog]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text className={styles.headerTitle}>Service Console</Text>
        <div className={styles.headerActions}>
          <Button
            appearance="subtle"
            size="small"
            icon={<DeleteRegular />}
            onClick={clearLogs}
            disabled={logs.length === 0}>
            Clear
          </Button>
        </div>
      </div>

      <DarkScrollContainer ref={consoleRef} className={styles.console}>
        {logs.length === 0 ? (
          <div className={styles.emptyState}>
            <PlayRegular style={{ fontSize: '24px', marginBottom: '8px' }} />
            <div>Service console ready</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>
              Waiting for service messages...
            </div>
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className={styles.logEntry}>
              <span className={styles.timestamp}>{formatTimestamp(log.timestamp)}</span>
              <span className={styles.service}>[{log.service}]</span>
              <span className={`${styles.level} ${getLevelClassName(log.level)}`}>
                {log.level.toUpperCase()}
              </span>
              <span>{log.message}</span>
              {log.step !== undefined && log.service === 'babyElephantV2' && (
                <span style={{ color: '#808080', fontSize: '10px', marginLeft: '8px' }}>
                  #{log.step}
                </span>
              )}
            </div>
          ))
        )}
      </DarkScrollContainer>

      {onCommand && (
        <div className={styles.inputContainer}>
          <span className={styles.prompt}>{'>'}</span>
          <input
            className={styles.commandInput}
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleCommandSubmit}
            placeholder="Enter command..."
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
};

// Utility function for services to easily log messages
export const logToServiceConsole = (
  service: 'crxMCP' | 'babyElephantV1' | 'babyElephantV2' | 'system',
  level: LogLevel,
  message: string,
  step?: number,
) => {
  const serviceConsole = window.serviceConsole;
  if (serviceConsole?.addLog) {
    serviceConsole.addLog({ service, level, message, step });
  }
};
