/**
 * Strategy Compiler
 * Merges Product Profile versions and Customer Profile versions into a
 * compiled Discovery Strategy with search queries, keywords, filters,
 * evidence priorities, and scoring config.
 *
 * This is deterministic application code — no AI. AI may suggest profile
 * content, but strategy compilation is rule-based so it is reproducible.
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

export interface CompiledQuery {
  query: string;
  type: 'keyword' | 'hiring' | 'site' | 'combination';
  rationale: string;
}

export interface CompiledStrategy {
  queries: CompiledQuery[];
  keywords: string[];
  inclusionFilters: string[];
  exclusionFilters: string[];
  evidencePriorities: string[];
  enrichmentPriorities: string[];
  scoringConfig: Record<string, any>;
  defaultName: string;
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
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map(s => s.toLowerCase().trim()).filter(Boolean))];
}

function combineLocations(customer: CustomerVersionData[], country: string): string {
  const locs = customer.flatMap(c => c.locations);
  const parts = [country];
  // Add first non-country location if present
  const specific = locs.find(l => l.toLowerCase() !== country.toLowerCase());
  if (specific) parts.push(specific);
  return parts.join(', ');
}

export function compileStrategy(
  product: ProductVersionData[],
  customer: CustomerVersionData[],
  geo: GeographyInput
): CompiledStrategy {
  // --- Merge keywords from all sources ---
  const productKeywords = product.flatMap(p => [...p.keywords, ...p.technologies, ...p.problemsSolved]);
  const customerKeywords = customer.flatMap(c => [...c.technologies, ...c.operationalCharacteristics, ...c.buyingSignals]);
  const allKeywords = dedupe([...productKeywords, ...customerKeywords]);

  // --- Merge industries ---
  const industries = dedupe([
    ...product.flatMap(p => p.industries),
    ...customer.flatMap(c => c.industries),
  ]);

  // --- Merge exclusions ---
  const exclusions = dedupe([
    ...product.flatMap(p => p.exclusions),
    ...customer.flatMap(c => c.exclusions),
  ]);

  // --- Merge hiring signals ---
  const hiringSignals = dedupe(customer.flatMap(c => c.hiringSignals));

  // --- Build search queries ---
  const queries: CompiledQuery[] = [];
  const locStr = combineLocations(customer, geo.country);

  // Query type 1: Keyword + location queries
  for (const kw of allKeywords.slice(0, 15)) {
    queries.push({
      query: `"${kw}" ${locStr}`,
      type: 'keyword',
      rationale: `Keyword "${kw}" from product/customer profiles, scoped to ${locStr}`,
    });
  }

  // Query type 2: Hiring signal queries
  for (const signal of hiringSignals.slice(0, 8)) {
    queries.push({
      query: `hiring "${signal}" ${locStr}`,
      type: 'hiring',
      rationale: `Hiring signal "${signal}" indicates active need, scoped to ${locStr}`,
    });
  }

  // Query type 3: Industry + keyword combinations
  for (const industry of industries.slice(0, 3)) {
    const topKw = allKeywords.slice(0, 3);
    queries.push({
      query: `${industry} (${topKw.join(' OR ')}) ${locStr}`,
      type: 'combination',
      rationale: `Industry "${industry}" combined with top keywords, scoped to ${locStr}`,
    });
  }

  // Query type 4: Site-specific queries for major job boards
  const jobBoards = ['indeed.com', 'reed.co.uk', 'totaljobs.com'];
  for (const board of jobBoards) {
    const topKw = allKeywords[0];
    if (topKw) {
      queries.push({
        query: `site:${board} "${topKw}" ${locStr}`,
        type: 'site',
        rationale: `Job board ${board} search for top keyword "${topKw}" in ${locStr}`,
      });
    }
  }

  // --- Inclusion filters (what candidates must have to be relevant) ---
  const inclusionFilters: string[] = [];
  if (industries.length) {
    inclusionFilters.push(`Industry in: ${industries.join(', ')}`);
  }
  const sizeMin = Math.min(
    ...product.map(p => p.companySizeMin).filter((v): v is number => v != null),
    ...customer.map(c => c.employeeCountMin).filter((v): v is number => v != null),
    Infinity,
  );
  const sizeMax = Math.max(
    ...product.map(p => p.companySizeMax).filter((v): v is number => v != null),
    ...customer.map(c => c.employeeCountMax).filter((v): v is number => v != null),
    0,
  );
  if (sizeMin !== Infinity && sizeMin > 0) {
    inclusionFilters.push(`Minimum employees: ${sizeMin}`);
  }
  if (sizeMax > 0) {
    inclusionFilters.push(`Maximum employees: ${sizeMax}`);
  }
  const customerTech = dedupe(customer.flatMap(c => c.technologies));
  if (customerTech.length) {
    inclusionFilters.push(`Technologies: ${customerTech.join(', ')}`);
  }

  // --- Evidence priorities (what evidence is most valuable) ---
  const evidencePriorities: string[] = [];
  if (hiringSignals.length) {
    evidencePriorities.push('job_advert');
  }
  evidencePriorities.push('company_website');
  if (customerTech.length || product.flatMap(p => p.technologies).length) {
    evidencePriorities.push('tech_stack');
  }
  evidencePriorities.push('contact_info');
  if (customer.some(c => c.revenueMin || c.revenueMax)) {
    evidencePriorities.push('funding_event');
  }
  evidencePriorities.push('apollo_data');

  // --- Enrichment priorities ---
  const enrichmentPriorities: string[] = ['apollo', 'brave', 'openai'];
  if (process.env.APOLLO_API_KEY) enrichmentPriorities.unshift('apollo');

  // --- Scoring config ---
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

  // --- Default name ---
  const productNames = product.map(p => p.profile?.name).filter(Boolean);
  const customerNames = customer.map(c => c.profile?.name).filter(Boolean);
  const defaultName = [
    productNames[0] || 'Product',
    '×',
    customerNames[0] || 'Customer',
  ].join(' ');

  return {
    queries,
    keywords: allKeywords,
    inclusionFilters,
    exclusionFilters: exclusions,
    evidencePriorities,
    enrichmentPriorities,
    scoringConfig,
    defaultName,
  };
}
