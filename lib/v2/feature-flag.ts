import { getTenantId } from '@/lib/auth';
import { headers } from 'next/headers';

/**
 * V2 Feature Flag
 * Controlled by V2_ENABLED env var or a per-tenant features.v2 flag.
 * When false, V2 routes redirect to the V1 equivalent.
 */
export async function isV2Enabled(): Promise<boolean> {
  // Global env override
  if (process.env.V2_ENABLED === 'true') return true;

  // Per-request header override (for testing)
  const h = await headers();
  if (h.get('x-v2-enabled') === 'true') return true;

  return false;
}
