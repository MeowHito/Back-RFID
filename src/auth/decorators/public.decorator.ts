import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard';

/**
 * Decorator to mark endpoints as public (no authentication required)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
