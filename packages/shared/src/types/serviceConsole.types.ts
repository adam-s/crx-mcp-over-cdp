/**
 * Shared types for ServiceConsole logging functionality
 * Used across different services to ensure type consistency
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: Date;
  service: 'crxMCP' | 'babyElephantV1' | 'babyElephantV2' | 'system';
  level: LogLevel;
  message: string;
  step?: number; // For agent events
}

export type ServiceConsoleAddLogEntry = Omit<LogEntry, 'id' | 'timestamp'>;

export interface ServiceConsoleInterface {
  addLog: (entry: ServiceConsoleAddLogEntry) => void;
}
