import branding from '@/tenants/internal/branding.json';
import features from '@/tenants/internal/features.json';

const TENANT_ID = process.env.TENANT_ID || 'internal';

export const tenant = {
  id: TENANT_ID,
  branding,
  features,
};
