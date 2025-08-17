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
    clearResults,
    clearError,
  };
}
