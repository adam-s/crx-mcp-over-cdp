import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICRXMCPService } from '@shared/services/crxMCP.service';

export const IBabyElephantImageService = createDecorator<IBabyElephantImageService>('babyElephantImageService');

export interface IBabyElephantImageService {
    readonly _serviceBrand: undefined;
    searchBabyAnimalImages(animalName: string): Promise<{ success: boolean; urls: string[]; message: string }>;
    getCurrentPageUrl(): Promise<string>;
    navigateToGoogleImages(): Promise<string>;
}

export class BabyElephantImageService implements IBabyElephantImageService {
    readonly _serviceBrand: undefined;
    private _crxMcpService?: ICRXMCPService;

    constructor() {
        // The service will be set via setCrxMcpService method
    }

    setCrxMcpService(crxMcpService: ICRXMCPService) {
        this._crxMcpService = crxMcpService;
    }

    private getCrxMcpService(): ICRXMCPService {
        if (!this._crxMcpService) {
            throw new Error('CRX MCP Service not available. Please ensure it is properly initialized.');
        }
        return this._crxMcpService;
    }

    async searchBabyAnimalImages(animalName: string): Promise<{ success: boolean; urls: string[]; message: string }> {
        try {
            console.log(`🐘 Searching for baby ${animalName} images...`);

            const crxMcpService = this.getCrxMcpService();

            // Navigate to Google Images
            await this.navigateToGoogleImages();

            // Search for baby animal images
            const searchQuery = `baby ${animalName} images`;
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`;

            const result = await crxMcpService.navigateTo(searchUrl);
            if (result !== 'ok') {
                return {
                    success: false,
                    urls: [],
                    message: `Failed to navigate to search: ${result}`,
                };
            }

            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get current URL to confirm navigation
            const currentUrl = await crxMcpService.getCurrentPageUrl();

            // For now, return a success message with the search URL
            // In a real implementation, you'd extract image URLs from the page
            return {
                success: true,
                urls: [currentUrl],
                message: `Successfully searched for baby ${animalName} images at: ${currentUrl}`,
            };
        } catch (error) {
            console.error('Error searching for baby animal images:', error);
            return {
                success: false,
                urls: [],
                message: `Error: ${(error as Error).message}`,
            };
        }
    }

    async getCurrentPageUrl(): Promise<string> {
        return this.getCrxMcpService().getCurrentPageUrl();
    }

    async navigateToGoogleImages(): Promise<string> {
        return this.getCrxMcpService().navigateTo('https://www.google.com/imghp');
    }
}

registerSingleton(IBabyElephantImageService, BabyElephantImageService, InstantiationType.Delayed);
