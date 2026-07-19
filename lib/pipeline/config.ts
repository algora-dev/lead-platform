import branding from '@/tenants/internal/branding.json';
import sources from '@/tenants/internal/sources.json';
import fields from '@/tenants/internal/fields.json';
import scoring from '@/tenants/internal/scoring.json';
import features from '@/tenants/internal/features.json';

export const SOURCES = sources;
export const FIELDS = fields;
export const SCORING = scoring;
export const FEATURES = features;
export const BRANDING = branding;

export const TASK_GROUPS = fields.taskGroups as Record<string, string[]>;
export const QUERY_PAIRS = sources.brave.queryPairs as [string, string][];
export const JOB_TERMS = sources.jobTerms as string[];
export const IGNORE_DOMAINS = sources.ignoreDomains as string[];
export const JOB_BOARD_DOMAINS = [
  'indeed.', 'reed.co.uk', 'totaljobs.', 'cv-library.', 'adzuna.',
  'glassdoor.', 'monster.', 'jobsite.', 'ziprecruiter.', 'seek.co.nz',
  'trademe.co.nz',
];

export const TENANT_ID_RESOLVED = process.env.TENANT_ID || 'internal';
