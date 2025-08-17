import { useState, useCallback, useEffect } from 'react';
import { useService } from './useService';
import { ICRXMCPService } from '@shared/services/crxMCP.service';
import { logToServiceConsole } from '../components/ServiceConsole';

interface SearchResult {
  success: boolean;
  urls: string[];
  message: string;
}

interface UseBabyElephantImageState {
  isLoading: boolean;
  result: SearchResult | null;
  error: string | null;
}

interface UseBabyElephantImageActions {
  searchBabyAnimalImages: (animalName: string) => Promise<void>;
  searchBabyAnimalImagesV2: (animalName: string) => Promise<void>;
  clearResults: () => void;
  clearError: () => void;
}

export interface UseBabyElephantImageReturn
  extends UseBabyElephantImageState,
    UseBabyElephantImageActions {}

/**
 * A React hook that acts as a controller for baby animal image searching.
 * Contains business logic and state management for the baby elephant agent.
 *
 * @returns Controller object with state and actions for baby animal image search
 */
export function useBabyElephantImage(): UseBabyElephantImageReturn {
  const crxMcpService = useService(ICRXMCPService);

  const [state, setState] = useState<UseBabyElephantImageState>({
    isLoading: false,
    result: null,
    error: null,
  });

  // Subscribe to agent events for real-time logging
  useEffect(() => {
    const recentEvents = new Set<string>();
    const eventTimeout = 100; // ms to consider events as duplicates

    const disposable = crxMcpService.onAgentEvent(event => {
      // Enhanced deduplication using a more robust approach
      const eventId = `${event.step}-${event.phase}-${event.message}`;

      if (recentEvents.has(eventId)) {
        return; // Skip duplicate events
      }

      // Add to recent events and remove after timeout
      recentEvents.add(eventId);
      setTimeout(() => {
        recentEvents.delete(eventId);
      }, eventTimeout);

      const levelMap: Record<string, 'info' | 'success' | 'warning' | 'error' | 'debug'> = {
        plan: 'debug',
        act: 'info',
        finish: 'success',
        error: 'error',
      };

      const level = levelMap[event.phase] || 'info';

      // Smart truncation that respects word boundaries
      const truncateMessage = (message: string, maxLength: number = 65): string => {
        if (message.length <= maxLength) return message;

        const truncated = message.slice(0, maxLength);
        const lastSpaceIndex = truncated.lastIndexOf(' ');

        // If we find a space within the last 15 characters, cut there
        if (lastSpaceIndex > maxLength - 15) {
          return truncated.slice(0, lastSpaceIndex) + '...';
        }

        // Otherwise, just cut and add ellipsis
        return truncated + '...';
      };

      const shortMessage = `Step ${event.step}: ${truncateMessage(event.message)}`;

      logToServiceConsole('babyElephantV2', level, shortMessage, event.step);
    });

    return () => {
      disposable.dispose();
    };
  }, [crxMcpService]);

  const searchBabyAnimalImages = useCallback(
    async (animalName: string) => {
      if (!animalName.trim()) {
        setState(prev => ({
          ...prev,
          error: 'Please enter an animal name',
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        result: null,
      }));

      const serviceTag = 'babyElephantV1';
      const versionLabel = 'V1';

      try {
        console.log(`🐘 Starting baby ${animalName} image search...`);
        logToServiceConsole(
          serviceTag,
          'info',
          `Starting baby ${animalName} image search (${versionLabel})`,
        );

        // Use the baby elephant agent to search for images
        const searchQuery = `baby ${animalName.trim()}`;

        logToServiceConsole(
          serviceTag,
          'debug',
          `Step 1: Executing ${versionLabel} agent with query: "${searchQuery}"`,
        );

        const result = await crxMcpService.runBabyElephantAgent(searchQuery);

        console.log(`✅ Baby ${animalName} search completed:`, result);

        if (result.success) {
          logToServiceConsole(
            serviceTag,
            'success',
            `Step 2: ${versionLabel} search completed: Found ${result.urls.length} URLs`,
          );

          // Format and output the URLs to ServiceConsole like V2 does
          if (result.urls.length > 0) {
            logToServiceConsole(serviceTag, 'info', `📸 Image URLs found:`);
            result.urls.forEach((url, index) => {
              logToServiceConsole(serviceTag, 'info', `  ${index + 1}. ${url}`);
            });
          }
        } else {
          logToServiceConsole(
            serviceTag,
            'error',
            `Step 2: ${versionLabel} search failed: ${result.message}`,
          );
        }

        // For V1, we only log to ServiceConsole and don't update the result state
        // This keeps the console visible and doesn't show image links in the component
        setState(prev => ({
          ...prev,
          isLoading: false,
          // Don't set result for V1 - only log to console
        }));
      } catch (error) {
        console.error(`❌ Baby ${animalName} search failed:`, error);
        logToServiceConsole(
          serviceTag,
          'error',
          `Step 2: ${versionLabel} search failed: ${(error as Error).message}`,
        );

        setState(prev => ({
          ...prev,
          isLoading: false,
          error: `Failed to search for baby ${animalName} images: ${(error as Error).message}`,
        }));
      }
    },
    [crxMcpService],
  );

  const searchBabyAnimalImagesV2 = useCallback(
    async (animalName: string) => {
      if (!animalName.trim()) {
        setState(prev => ({
          ...prev,
          error: 'Please enter an animal name',
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        result: null,
      }));

      const serviceTag = 'babyElephantV2';
      const versionLabel = 'V2';

      try {
        console.log(`🐘 Starting baby ${animalName} image search with ${versionLabel} agent...`);
        logToServiceConsole(
          serviceTag,
          'info',
          `Starting baby ${animalName} image search (${versionLabel})`,
        );

        // Use the v2 baby elephant agent to search for images
        const task = `Find cute baby ${animalName.trim()} pictures and extract 5-10 direct image URLs. Navigate to an image search engine like DuckDuckGo Images, search for "baby ${animalName.trim()}", and extract the actual image URLs from the results.`;

        logToServiceConsole(serviceTag, 'debug', `Executing ${versionLabel} agent task...`);
        const resultStr = await crxMcpService.runBabyElephantAgentV2(task, {
          startUrl: 'https://duckduckgo.com',
          maxSteps: 15,
          devMode: true,
        });

        console.log(`✅ Baby ${animalName} ${versionLabel} search completed:`, resultStr);

        // Parse the result
        const parsedResult = JSON.parse(resultStr);

        // Extract URLs from finalResult text if available
        let extractedUrls: string[] = [];
        if (parsedResult.finalResult) {
          // Try to extract URLs from patterns like "Preview: url1, url2, url3" or "URLs: url1, url2, url3"
          const urlMatches = parsedResult.finalResult.match(/(?:Preview:|URLs?:)\s*([^.]+)/i);
          if (urlMatches && urlMatches[1]) {
            extractedUrls = urlMatches[1]
              .split(',')
              .map((url: string) => url.trim())
              .filter((url: string) => url.startsWith('http'));
          }
        }

        // Transform V2 result to match V1 interface
        const result: SearchResult = {
          success: parsedResult.success,
          urls: extractedUrls,
          message:
            parsedResult.finalResult || parsedResult.error || `${versionLabel} agent completed`,
        };

        if (result.success) {
          logToServiceConsole(
            serviceTag,
            'success',
            `${versionLabel} search completed: ${result.message}`,
          );

          // Format and output the URLs to ServiceConsole like V1 does
          if (result.urls.length > 0) {
            logToServiceConsole(serviceTag, 'info', `📸 Image URLs found:`);
            result.urls.forEach((url, index) => {
              logToServiceConsole(serviceTag, 'info', `  ${index + 1}. ${url}`);
            });
          }
        } else {
          logToServiceConsole(
            serviceTag,
            'error',
            `${versionLabel} search failed: ${result.message}`,
          );
        }

        setState(prev => ({
          ...prev,
          isLoading: false,
          result: result,
        }));
      } catch (error) {
        console.error(`❌ Baby ${animalName} ${versionLabel} search failed:`, error);
        logToServiceConsole(
          serviceTag,
          'error',
          `${versionLabel} search failed: ${(error as Error).message}`,
        );

        setState(prev => ({
          ...prev,
          isLoading: false,
          error: `Failed to search for baby ${animalName} images with V2: ${(error as Error).message}`,
        }));
      }
    },
    [crxMcpService],
  );

  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      result: null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    ...state,
    searchBabyAnimalImages,
    searchBabyAnimalImagesV2,
    clearResults,
    clearError,
  };
}
