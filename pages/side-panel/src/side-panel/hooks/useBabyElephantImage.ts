import { useService } from './useService';
import { IBabyElephantImageService } from '../services/babyElephantImage.service';

/**
 * A React hook to access the BabyElephantImageService.
 * 
 * @returns The BabyElephantImageService instance for searching baby animal images.
 */
export function useBabyElephantImage(): IBabyElephantImageService {
    return useService(IBabyElephantImageService);
}
