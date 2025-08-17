import { useState, useCallback } from 'react';
import { useService } from './useService';
import { ICRXMCPService } from '@shared/services/crxMCP.service';

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

      try {
        console.log(`🐘 Starting baby ${animalName} image search...`);

        // Use the baby elephant agent to search for images
        const searchQuery = `baby ${animalName.trim()}`;
        const result = await crxMcpService.runBabyElephantAgent(searchQuery);

        console.log(`✅ Baby ${animalName} search completed:`, result);

        setState(prev => ({
          ...prev,
          isLoading: false,
          result: result,
        }));
      } catch (error) {
        console.error(`❌ Baby ${animalName} search failed:`, error);

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

      try {
        console.log(`🐘 Starting baby ${animalName} image search with V2 agent...`);

        // Use the v2 baby elephant agent to search for images
        const task = `Find cute baby ${animalName.trim()} pictures and extract 5-10 direct image URLs. Navigate to an image search engine like DuckDuckGo Images, search for "baby ${animalName.trim()}", and extract the actual image URLs from the results.`;

        const resultStr = await crxMcpService.runBabyElephantAgentV2(task, {
          startUrl: 'https://duckduckgo.com',
          maxSteps: 15,
          devMode: true,
        });

        console.log(`✅ Baby ${animalName} V2 search completed:`, resultStr);

        // Parse the result
        const parsedResult = JSON.parse(resultStr);

        // Transform V2 result to match V1 interface
        const result: SearchResult = {
          success: parsedResult.success,
          urls: [], // V2 agent doesn't extract URLs yet in this simplified version
          message: parsedResult.finalResult || parsedResult.error || 'V2 agent completed',
        };

        setState(prev => ({
          ...prev,
          isLoading: false,
          result: result,
        }));
      } catch (error) {
        console.error(`❌ Baby ${animalName} V2 search failed:`, error);

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
