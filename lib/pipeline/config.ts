import fs from 'fs';
import path from 'path';

const BASE = process.cwd();
const TENANT_ID = process.env.TENANT_ID || 'internal';
const TENANT_DIR = path.join(BASE, 'tenants', TENANT_ID);

function loadJson(name: string): Record<string, any> {
  const filePath = path.join(TENANT_DIR, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing tenant configuration: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export const SOURCES = loadJson('sources.json');
export const FIELDS = loadJson('fields.json');
export const SCORING = loadJson('scoring.json');
export const FEATURES = loadJson('features.json');
export const BRANDING = loadJson('branding.json');

export const TASK_GROUPS = FIELDS.taskGroups as Record<string, string[]>;
export const QUERY_PAIRS = SOURCES.brave.queryPairs as [string, string][];
export const JOB_TERMS = SOURCES.jobTerms as string[];
export const IGNORE_DOMAINS = SOURCES.ignoreDomains as string[];
export const JOB_BOARD_DOMAINS = [
  'indeed.', 'reed.co.uk', 'totaljobs.', 'cv-library.', 'adzuna.',
  'glassdoor.', 'monster.', 'jobsite.', 'ziprecruiter.', 'seek.co.nz',
  'trademe.co.nz',
];

export const TENANT_ID_RESOLVED = TENANT_ID;
