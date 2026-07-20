/**
 * ScanProfile type definitions and helpers.
 *
 * A ScanProfile encapsulates everything needed to run a scan:
 * - Brave Search query pairs, negative terms, job terms
 * - Task groups for signal detection
 * - Scoring weights (overrides defaults from scoring.json)
 * - Countries to scan
 * - Ignore domains
 *
 * Phase 1: profiles stored in DB, managed via admin API.
 * Phase 3: profiles become user-configurable in the UI.
 */

export interface ScanProfileConfig {
  /** Brave Search settings */
  brave: {
    countries: string[];
    freshness: string;
    resultsPerPage: number;
    defaultQueryLimit: number;
    negativeTerms: string[];
    queryPairs: [string, string][];
  };
  /** Terms that indicate a result is a job advert */
  jobTerms: string[];
  /** Domains to ignore (social media, job boards handled separately) */
  ignoreDomains: string[];
  /** Task groups for operational signal detection */
  taskGroups: Record<string, string[]>;
  /** Scoring weights — merged over defaults from scoring.json */
  scoring: {
    scoreName?: string;
    baseHiringSignal?: number;
    advertTaskPointsPerGroup?: number;
    advertTaskPointsCap?: number;
    companyTaskPointsPerGroup?: number;
    companyTaskPointsCap?: number;
    activeJobPoints?: Record<string, number>;
    repeatTaskPointsPerExtraAdvert?: number;
    repeatTaskPointsCap?: number;
    salaryBands?: { minimum: number; points: number }[];
    contactPoints?: { email?: number; phone?: number };
    companySizeBands?: { minimum: number; maximum: number; points: number; label?: string }[];
    maximumScore?: number;
    principle?: string;
  };
}

/** Default config for the "Sales/Outreach Roles" scan profile */
export const SALES_OUTREACH_PROFILE: ScanProfileConfig = {
  brave: {
    countries: ['UK'],
    freshness: 'pm',
    resultsPerPage: 20,
    defaultQueryLimit: 16,
    negativeTerms: ['student', 'internship', 'volunteer', 'graduate'],
    queryPairs: [
      ['cold calling', 'sales'],
      ['cold email', 'outreach'],
      ['lead generation', 'sales'],
      ['outbound', 'sales'],
      ['appointment setting', 'CRM'],
      ['sales development', 'pipeline'],
      ['business development', 'prospecting'],
      ['telesales', 'leads'],
      ['sales representative', 'new business'],
      ['account executive', 'outbound'],
      ['sales consultant', 'lead gen'],
      ['outreach', 'prospecting'],
      ['sales agent', 'cold'],
      ['business development', 'cold calling'],
      ['inside sales', 'outbound'],
      ['lead gen', 'appointment setting'],
    ],
  },
  jobTerms: ['job', 'vacancy', 'career', 'position', 'role', 'hiring', 'employment'],
  ignoreDomains: ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'reddit.com'],
  taskGroups: {
    'outbound sales': ['cold calling', 'cold call', 'cold email', 'outbound', 'outreach', 'prospecting', 'cold outreach'],
    'lead generation': ['lead generation', 'lead gen', 'pipeline', 'qualified leads', 'new business', 'prospects'],
    'appointment setting': ['appointment setting', 'book meetings', 'schedule calls', 'book appointments'],
    'crm management': ['CRM', 'pipeline management', 'salesforce', 'hubspot', 'pipedrive', 'update CRM'],
    'client acquisition': ['new clients', 'win new business', 'client acquisition', 'account winning'],
    'sales reporting': ['sales targets', 'KPI', 'sales reports', 'conversion rates', 'weekly targets'],
  },
  scoring: {
    scoreName: 'Opportunity Score',
    baseHiringSignal: 12,
    advertTaskPointsPerGroup: 8,
    advertTaskPointsCap: 40,
    companyTaskPointsPerGroup: 5,
    companyTaskPointsCap: 30,
    activeJobPoints: { '1': 8, '2': 16, '3': 23, '4_plus': 30 },
    repeatTaskPointsPerExtraAdvert: 5,
    repeatTaskPointsCap: 15,
    salaryBands: [
      { minimum: 1, points: 4 },
      { minimum: 30000, points: 7 },
      { minimum: 70000, points: 10 },
    ],
    contactPoints: { email: 5, phone: 5 },
    companySizeBands: [
      { minimum: 10, maximum: 150, points: 15, label: '10-150 sweet spot' },
      { minimum: 151, maximum: 300, points: 10, label: '151-300' },
      { minimum: 1, maximum: 9, points: 7, label: '1-9' },
      { minimum: 301, maximum: 999999, points: 5, label: '301+' },
    ],
    maximumScore: 100,
    principle: 'Positive evidence only. Never subtract points because of job title, industry, physical work, clinical work, technical work, or company type.',
  },
};

/** Default config for the "Construction Quoting" scan profile */
export const CONSTRUCTION_QUOTING_PROFILE: ScanProfileConfig = {
  brave: {
    countries: ['UK'],
    freshness: 'pm',
    resultsPerPage: 20,
    defaultQueryLimit: 16,
    negativeTerms: ['student', 'internship', 'volunteer', 'graduate'],
    queryPairs: [
      ['quoting', 'construction'],
      ['estimator', 'building'],
      ['quantity surveyor', 'construction'],
      ['project surveyor', 'quotes'],
      ['estimating', 'builder'],
      ['tender', 'construction'],
      ['pricing', 'construction'],
      ['cost estimation', 'building'],
      ['surveyor', 'contractor'],
      ['estimator', 'contractor'],
      [' quotations', 'building'],
      ['estimating', 'roofing'],
      ['project manager', 'construction'],
      ['site manager', 'contractor'],
      ['bid manager', 'construction'],
      ['estimator', 'civil engineering'],
    ],
  },
  jobTerms: ['job', 'vacancy', 'career', 'position', 'role', 'hiring', 'employment'],
  ignoreDomains: ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'reddit.com'],
  taskGroups: {
    'quoting and estimating': ['quoting', 'estimating', 'estimator', 'quotations', 'quotes', 'pricing', 'cost estimation', 'tender pricing'],
    'surveying': ['surveyor', 'quantity surveyor', 'project surveyor', 'measured survey', 'bill of quantities'],
    'tendering': ['tender', 'tendering', 'bid', 'bidding', 'bid manager', 'tender submissions', 'pre-qualification'],
    'project management': ['project manager', 'site manager', 'construction management', 'programme', 'scheduling'],
    'contractor operations': ['contractor', 'subcontractor', 'building contractor', 'civil engineering', 'groundworks'],
    'technical and trade': ['roofing', 'plumbing', 'electrical', 'carpentry', 'bricklaying', 'plastering', 'tiling'],
  },
  scoring: {
    scoreName: 'Opportunity Score',
    baseHiringSignal: 12,
    advertTaskPointsPerGroup: 8,
    advertTaskPointsCap: 40,
    companyTaskPointsPerGroup: 5,
    companyTaskPointsCap: 30,
    activeJobPoints: { '1': 8, '2': 16, '3': 23, '4_plus': 30 },
    repeatTaskPointsPerExtraAdvert: 5,
    repeatTaskPointsCap: 15,
    salaryBands: [
      { minimum: 1, points: 4 },
      { minimum: 35000, points: 7 },
      { minimum: 80000, points: 10 },
    ],
    contactPoints: { email: 5, phone: 5 },
    companySizeBands: [
      { minimum: 5, maximum: 50, points: 15, label: '5-50 sweet spot' },
      { minimum: 51, maximum: 200, points: 12, label: '51-200' },
      { minimum: 1, maximum: 4, points: 7, label: '1-4' },
      { minimum: 201, maximum: 999999, points: 5, label: '201+' },
    ],
    maximumScore: 100,
    principle: 'Positive evidence only. Never subtract points because of job title, industry, physical work, clinical work, technical work, or company type.',
  },
};

/** Slugify a profile name */
export function slugifyProfile(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'profile';
}
