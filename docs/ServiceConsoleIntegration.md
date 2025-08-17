# ServiceC```

## BabyElephantAgentV2Service Integration

Example modifications to add to your babyElephantAgentV2Service.ts:

```typescriptole Integration Guide

Integration guide for ServiceConsole with babyElephantAgentV2Service.

This file shows the modifications needed to integrate console logging into your existing babyElephantAgentV2Service.ts file.

## Import Statement

```typescript

import { logToServiceConsole } from '../pages/side-panel/src/side-panel/components/ServiceConsole';

// Example modifications to add to your babyElephantAgentV2Service.ts:

export class BabyElephantAgentV2ServiceWithLogging {
  // Add logging to your existing methods:
  
  async executeImageSearch(query: string) {
    // Add this at the start of your method:
    logToServiceConsole('babyElephantV2', 'info', `Starting image search: ${query}`);
    
    try {
      // Your existing logic here...
      
      // Add progress logging:
      logToServiceConsole('babyElephantV2', 'debug', 'Taking accessibility snapshot...');
      
      // Your snapshot code...
      
      logToServiceConsole('babyElephantV2', 'debug', 'Analyzing page content with LLM...');
      
      // Your LLM analysis code...
      
      logToServiceConsole('babyElephantV2', 'success', `Found ${results.length} image URLs`);
      
      return results;
    } catch (error) {
      logToServiceConsole('babyElephantV2', 'error', `Image search failed: ${error.message}`);
      throw error;
    }
  }

  // Add logging to state transitions:
  private updateSearchPhase(newPhase: string) {
    logToServiceConsole('babyElephantV2', 'debug', `State transition: ${this.searchPhase} → ${newPhase}`);
    this.searchPhase = newPhase;
  }

  // Add logging to CDP operations:
  private async takeSnapshot() {
    logToServiceConsole('babyElephantV2', 'debug', 'Taking accessibility tree snapshot...');
    // Your snapshot code...
    logToServiceConsole('babyElephantV2', 'debug', `Snapshot complete: ${nodes.length} nodes`);
  }

  // Add logging to LLM calls:
  private async callLlm(prompt: string, context: string) {
    logToServiceConsole('babyElephantV2', 'debug', 'Calling LLM for analysis...');
    const result = await this.llm.invoke([
      { role: 'system', content: prompt },
      { role: 'user', content: context }
    ]);
    logToServiceConsole('babyElephantV2', 'debug', `LLM response received (${result.content.length} chars)`);
    return result;
  }
}

// Example modifications to add to your crxMCP service:

export class CrxMcpServiceWithLogging {
  
  async initialize() {
    logToServiceConsole('crxMCP', 'info', 'Initializing CRX MCP service...');
    
    try {
      // Your initialization code...
      logToServiceConsole('crxMCP', 'success', 'CRX MCP service initialized successfully');
    } catch (error) {
      logToServiceConsole('crxMCP', 'error', `Initialization failed: ${error.message}`);
      throw error;
    }
  }

  async handleRequest(request: any) {
    logToServiceConsole('crxMCP', 'info', `Handling ${request.method} request`);
    
    try {
      // Your request handling code...
      logToServiceConsole('crxMCP', 'success', 'Request completed successfully');
    } catch (error) {
      logToServiceConsole('crxMCP', 'error', `Request failed: ${error.message}`);
      throw error;
    }
  }

  onConnectionOpen() {
    logToServiceConsole('crxMCP', 'success', 'Client connected');
  }

  onConnectionClose() {
    logToServiceConsole('crxMCP', 'warning', 'Client disconnected');
  }
}

// To integrate into your existing code:
// 1. Import logToServiceConsole at the top of your service files
// 2. Add logging calls at key points (start/end of operations, state changes, errors)
// 3. Use appropriate log levels:
//    - 'info': General information (starting tasks, status updates)
//    - 'success': Successful operations
//    - 'warning': Non-critical issues
//    - 'error': Errors and failures
//    - 'debug': Detailed debugging information

// Example markers to look for in your existing ##### console.log statements:
// Replace: console.log('#####', 'Starting image search for:', query);
// With: logToServiceConsole('babyElephantV2', 'info', `Starting image search: ${query}`);

// Replace: console.log('#####', 'ERROR:', error.message);
// With: logToServiceConsole('babyElephantV2', 'error', `Error: ${error.message}`);

// Replace: console.log('#####', 'Found', urls.length, 'image URLs');
// With: logToServiceConsole('babyElephantV2', 'success', `Found ${urls.length} image URLs`);
