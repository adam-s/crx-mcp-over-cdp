import { AsyncStorageSchema } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';

export enum StorageKeys {
  OPEN_AI_API_KEY = 'openAiApiKey',
  GOOGLE_GEMINI_API_KEY = 'googleGeminiApiKey',
}

export interface SidePanelAppStorageSchema extends AsyncStorageSchema {
  [StorageKeys.OPEN_AI_API_KEY]?: string;
  [StorageKeys.GOOGLE_GEMINI_API_KEY]?: string;
}
