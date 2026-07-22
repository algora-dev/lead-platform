/**
 * Strategy Compiler v2
 *
 * Phase 3 rewrite:
 * - Geography uses city + state + country (not just country)
 * - Separates Lead Profile (WHO to discover) from Product Profile (fit/scoring)
 * - Generates provider-specific plans (Brave vs Apollo)
 * - Removes naïve word-frequency fallback as primary mechanism
 * - Adds compilerVersion for invalidation
 * - Supports pagination and result budgets
 *
 * Lead Profile drives: industries, locations, buying/hiring signals, company size
 * Product Profile drives: problems solved, outcomes, technologies, scoring keywords
 */

export interface StrategyInput {
  productProfileVersionIds: number[];
  customerProfileVersionIds: number[];
  country: string;
  stateProvince?: string;
  county?: string;
  city?: string;
  radiusKm?: number;
}

export interface GeographyInput {
  country: string;
  stateProvince?: string;
  county?: string;
  city?: string;
  radiusKm?: number;
}

export interface BraveQuery {
  query: string;
  family: 'keyword' | 'hiring' | 'directory' | 'site' | 'quote_signal';
  rationale: string;
}

export interface ApolloFilter {
  keyword: string;
  industry?: string[];
  organizationLocations: string[];
  employeeRange?: { min?: number; max?: number };
  rationale: string;
}

export interface CompiledQuery {
  query: string;
  type: 'keyword' | 'hiring' | 'site' | 'combination';
  rationale: string;
}

export interface CompiledStrategy {
  compilerVersion: string;
  queries: CompiledQuery[]; // Backward-compatible flat list
  keywords: string[];
  inclusionFilters: string[];
  exclusionFilters: string[];
  evidencePriorities: string[];
  enrichmentPriorities: string[];
  scoringConfig: Record<string, any>;
  defaultName: string;
  // Provider-specific plans
  bravePlan: {
    queries: BraveQuery[];
    maxResultsPerQuery: number;
    maxPages: number;
    estimatedRequests: number;
  };
  apolloPlan: {
    filters: ApolloFilter[];
    perPage: number;
    maxPages: number;
    estimatedRequests: number;
  };
  geographyString: string;
}

interface ProductVersionData {
  id: number;
  profile?: { name?: string };
  problemsSolved: string[];
  outcomes: string[];
  industries: string[];
  keywords: string[];
  technologies: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  pricingLevel: string | null;
  exclusions: string[];
  notes: string | null;
  rawInput?: any;
}

interface CustomerVersionData {
  id: number;
  profile?: { name?: string };
  industries: string[];
  locations: string[];
  employeeCountMin: number | null;
  employeeCountMax: number | null;
  revenueMin: number | null;
  revenueMax: number | null;
  technologies: string[];
  operationalCharacteristics: string[];
  buyingSignals: string[];
  hiringSignals: string[];
  decisionMakers: string[];
  exclusions: string[];
  notes: string | null;
  rawInput?: any;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map(s => s.toLowerCase().trim()).filter(Boolean))];
}

/**
 * Build geography string from strategy geo input.
 * Always includes city + state + country when available.
 */
function buildGeographyString(geo: GeographyInput): string {
  const parts: string[] = [];
  if (geo.city) parts.push(geo.city);
  if (geo.stateProvince) parts.push(geo.stateProvince);
  if (geo.county && !geo.stateProvince) parts.push(geo.county);
  if (geo.country) parts.push(geo.country);
  return parts.join(', ');
}

/**
 * Build Apollo location filter.
 * Apollo accepts city names, state names, and country names in organization_locations.
 */
function buildApolloLocations(geo: GeographyInput, customerLocations: string[]): string[] {
  const locs: string[] = [];
  // Always include the strategy geography first
  if (geo.city) locs.push(geo.city);
  if (geo.stateProvince) locs.push(geo.stateProvince);
  if (geo.country) locs.push(geo.country);
  // Add customer profile locations as additional targets
  for (const loc of customerLocations) {
    const lower = loc.toLowerCase();
    if (!locs.some(l => l.toLowerCase() === lower)) {
      locs.push(loc);
    }
  }
  return locs;
}

export const COMPILER_VERSION = 'v2';

export function compileStrategy(
  product: ProductVersionData[],
  customer: CustomerVersionData[],
  geo: GeographyInput
): CompiledStrategy {
  const compilerVersion = 'v2';
  const geoStr = buildGeographyString(geo);

  // ==========================================
  // LEAD PROFILE (Customer) — drives WHO to discover
  // ==========================================
  const leadIndustries = dedupe(customer.flatMap(c => c.industries));
  const leadLocations = dedupe(customer.flatMap(c => c.locations));
  const leadHiringSignals = dedupe(customer.flatMap(c => c.hiringSignals));
  const leadBuyingSignals = dedupe(customer.flatMap(c => c.buyingSignals));
  const leadOperationalChars = dedupe(customer.flatMap(c => c.operationalCharacteristics));
  const leadTechnologies = dedupe(customer.flatMap(c => c.technologies));
  const leadExclusions = dedupe(customer.flatMap(c => c.exclusions));

  // Company size from customer profile
  const employeeMin = Math.min(
    ...customer.map(c => c.employeeCountMin).filter((v): v is number => v != null),
    Infinity,
  );
  const employeeMax = Math.max(
    ...customer.map(c => c.employeeCountMax).filter((v): v is number => v != null),
    0,
  );

  // ==========================================
  // PRODUCT PROFILE — drives fit/scoring
  // ==========================================
  const productKeywords = dedupe([
    ...product.flatMap(p => p.keywords),
    ...product.flatMap(p => p.technologies),
    ...product.flatMap(p => p.problemsSolved),
  ]);
  const productIndustries = dedupe(product.flatMap(p => p.industries));
  const productExclusions = dedupe(product.flatMap(p => p.exclusions));

  // Combined keywords for scoring/matching
  const allKeywords = dedupe([...productKeywords, ...leadOperationalChars, ...leadBuyingSignals]);

  // Combined industries
  const allIndustries = dedupe([...leadIndustries, ...productIndustries]);

  // Combined exclusions
  const allExclusions = dedupe([...leadExclusions, ...productExclusions]);

  // ==========================================
  // BRAVE PLAN — search queries for web discovery
  // ==========================================
  const braveQueries: BraveQuery[] = [];

  // Family 1: Industry + location queries (highest priority)
  for (const industry of leadIndustries.slice(0, 5)) {
    braveQueries.push({
      query: `"${industry}" ${geoStr}`,
      family: 'keyword',
      rationale: `Industry "${industry}" in ${geoStr}`,
    });
  }

  // Family 2: Hiring signal queries
  for (const signal of leadHiringSignals.slice(0, 6)) {
    braveQueries.push({
      query: `hiring "${signal}" ${geoStr}`,
      family: 'hiring',
      rationale: `Companies hiring for "${signal}" in ${geoStr} — indicates active operational need`,
    });
  }

  // Family 3: Quote/estimate/bid signals (for construction/trades)
  if (leadIndustries.length > 0 || leadBuyingSignals.length > 0) {
    const quoteTerms = leadBuyingSignals.length > 0 ? leadBuyingSignals : ['quote', 'estimate', 'bid', 'tender'];
    for (const term of quoteTerms.slice(0, 3)) {
      const industry = leadIndustries[0] || 'contractor';
      braveQueries.push({
        query: `"${industry}" "${term}" ${geoStr}`,
        family: 'quote_signal',
        rationale: `"${industry}" companies with "${term}" signals in ${geoStr}`,
      });
    }
  }

  // Family 4: Directory queries (find business directories)
  if (leadIndustries.length > 0) {
    const industry = leadIndustries[0];
    braveQueries.push({
      query: `${industry} companies ${geoStr} directory`,
      family: 'directory',
      rationale: `Directory listing for ${industry} companies in ${geoStr}`,
    });
  }

  // Family 5: Site-specific job board queries
  const jobBoards = ['indeed.com', 'reed.co.uk', 'totaljobs.com'];
  for (const board of jobBoards.slice(0, 2)) {
    const topSignal = leadHiringSignals[0] || leadIndustries[0];
    if (topSignal) {
      braveQueries.push({
        query: `site:${board} "${topSignal}" ${geoStr}`,
        family: 'site',
        rationale: `Job board ${board} for "${topSignal}" in ${geoStr}`,
      });
    }
  }

  // Family 6: Product keyword + location (for fit scoring discovery)
  for (const kw of productKeywords.slice(0, 3)) {
    braveQueries.push({
      query: `"${kw}" ${geoStr}`,
      family: 'keyword',
      rationale: `Product keyword "${kw}" in ${geoStr} — finds companies mentioning related needs`,
    });
  }

  // ==========================================
  // APOLLO PLAN — organization search filters
  // ==========================================
  const apolloFilters: ApolloFilter[] = [];
  const apolloLocations = buildApolloLocations(geo, leadLocations);

  // Filter 1: Industry keyword search
  for (const industry of leadIndustries.slice(0, 3)) {
    apolloFilters.push({
      keyword: industry,
      industry: leadIndustries.length > 0 ? leadIndustries : undefined,
      organizationLocations: apolloLocations,
      employeeRange: (employeeMin !== Infinity || employeeMax > 0) ? {
        min: employeeMin !== Infinity ? employeeMin : undefined,
        max: employeeMax > 0 ? employeeMax : undefined,
      } : undefined,
      rationale: `Apollo org search for "${industry}" in ${apolloLocations.join(', ')}`,
    });
  }

  // Filter 2: Hiring signal keywords (Apollo can search by keywords in org descriptions)
  for (const signal of leadHiringSignals.slice(0, 2)) {
    apolloFilters.push({
      keyword: signal,
      organizationLocations: apolloLocations,
      employeeRange: (employeeMin !== Infinity || employeeMax > 0) ? {
        min: employeeMin !== Infinity ? employeeMin : undefined,
        max: employeeMax > 0 ? employeeMax : undefined,
      } : undefined,
      rationale: `Apollo org search with keyword "${signal}" in ${apolloLocations.join(', ')}`,
    });
  }

  // Filter 3: Operational characteristic
  for (const op of leadOperationalChars.slice(0, 2)) {
    apolloFilters.push({
      keyword: op,
      organizationLocations: apolloLocations,
      rationale: `Apollo org search for operational characteristic "${op}" in ${apolloLocations.join(', ')}`,
    });
  }

  // ==========================================
  // BACKWARD-COMPATIBLE FLAT QUERIES
  // ==========================================
  const queries: CompiledQuery[] = braveQueries.map(bq => ({
    query: bq.query,
    type: bq.family === 'hiring' ? 'hiring' : bq.family === 'site' ? 'site' : bq.family === 'quote_signal' ? 'combination' : 'keyword',
    rationale: bq.rationale,
  }));

  // ==========================================
  // INCLUSION FILTERS
  // ==========================================
  const inclusionFilters: string[] = [];
  if (allIndustries.length) {
    inclusionFilters.push(`Industry in: ${allIndustries.join(', ')}`);
  }
  if (employeeMin !== Infinity && employeeMin > 0) {
    inclusionFilters.push(`Minimum employees: ${employeeMin}`);
  }
  if (employeeMax > 0) {
    inclusionFilters.push(`Maximum employees: ${employeeMax}`);
  }
  if (leadTechnologies.length) {
    inclusionFilters.push(`Technologies: ${leadTechnologies.join(', ')}`);
  }

  // ==========================================
  // EVIDENCE PRIORITIES
  // ==========================================
  const evidencePriorities: string[] = [];
  if (leadHiringSignals.length) evidencePriorities.push('job_advert');
  evidencePriorities.push('company_website');
  if (leadTechnologies.length || productKeywords.length) evidencePriorities.push('tech_stack');
  evidencePriorities.push('contact_info');
  if (customer.some(c => c.revenueMin || c.revenueMax)) evidencePriorities.push('funding_event');
  evidencePriorities.push('apollo_data');

  // ==========================================
  // ENRICHMENT PRIORITIES
  // ==========================================
  const enrichmentPriorities: string[] = ['apollo', 'brave', 'openai'];
  if (process.env.APOLLO_API_KEY) enrichmentPriorities.unshift('apollo');

  // ==========================================
  // SCORING CONFIG
  // ==========================================
  const scoringConfig = {
    profileScore: {
      keywordMatch: { points: 5, max: 30 },
      industryMatch: { points: 8, max: 16 },
      technologyMatch: { points: 6, max: 18 },
      locationMatch: { points: 4, max: 8 },
      sizeMatch: { points: 6, max: 12 },
      hiringSignalMatch: { points: 8, max: 16 },
    },
    confidenceScore: {
      jobAdvert: { points: 10, max: 30 },
      companyWebsite: { points: 8, max: 16 },
      apolloData: { points: 6, max: 12 },
      techStack: { points: 5, max: 10 },
      contactInfo: { points: 4, max: 8 },
      multipleSources: { points: 8, max: 16 },
      recentEvidence: { points: 4, max: 8 },
    },
    combinedPolicy: 'harmonic_mean',
    combinedPolicyVersion: 'v1',
  };

  // ==========================================
  // DEFAULT NAME
  // ==========================================
  const productNames = product.map(p => p.profile?.name).filter(Boolean);
  const customerNames = customer.map(c => c.profile?.name).filter(Boolean);
  const defaultName = [
    productNames[0] || 'Product',
    '×',
    customerNames[0] || 'Customer',
  ].join(' ');

  // ==========================================
  // RESULT BUDGETS
  // ==========================================
  const braveMaxPerQuery = 20;
  const braveMaxPages = 1; // Brave API returns up to 20 per page
  const apolloPerPage = 25;
  const apolloMaxPages = 4; // Up to 100 results per filter

  return {
    compilerVersion,
    queries,
    keywords: allKeywords,
    inclusionFilters,
    exclusionFilters: allExclusions,
    evidencePriorities,
    enrichmentPriorities,
    scoringConfig,
    defaultName,
    bravePlan: {
      queries: braveQueries,
      maxResultsPerQuery: braveMaxPerQuery,
      maxPages: braveMaxPages,
      estimatedRequests: braveQueries.length * braveMaxPages,
    },
    apolloPlan: {
      filters: apolloFilters,
      perPage: apolloPerPage,
      maxPages: apolloMaxPages,
      estimatedRequests: apolloFilters.length * apolloMaxPages,
    },
    geographyString: geoStr,
  };
}
