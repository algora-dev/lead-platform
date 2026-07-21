/**
 * Profile Scorer
 * Calculates the Profile Score for a candidate company based on
 * observed data from discovery, measured against the strategy's
 * scoring config.
 *
 * Rules (from ADR-0001):
 * - Range: 0-100
 * - Only facts genuinely observed in discovery data earn points
 * - Query terms alone do NOT award points — only observed data counts
 * - Hard exclusions reject; they don't subtract points
 * - Every point must be explainable
 */

export interface ProfileScoreInput {
  // Observed candidate data
  name: string;
  website?: string | null;
  domain?: string | null;
  country?: string | null;
  location?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  technologies?: string[];
  hiringSignals?: string[];
  operationalCharacteristics?: string[];
}

export interface StrategyKeywords {
  keywords: string[];
  industries: string[];
  technologies: string[];
  hiringSignals: string[];
  operationalCharacteristics: string[];
  companySizeMin?: number | null;
  companySizeMax?: number | null;
  locations: string[];
  exclusions: string[];
}

export interface ScoreBreakdownItem {
  criterion: string;
  awarded: number;
  max: number;
  explanation: string;
  matched: string[];
}

export interface ProfileScoreResult {
  score: number;
  maxScore: number;
  breakdown: ScoreBreakdownItem[];
  excluded: boolean;
  exclusionReason?: string;
}

const SCORING = {
  keywordMatch: { points: 5, max: 30 },
  industryMatch: { points: 8, max: 16 },
  technologyMatch: { points: 6, max: 18 },
  locationMatch: { points: 4, max: 8 },
  sizeMatch: { points: 6, max: 12 },
  hiringSignalMatch: { points: 8, max: 16 },
};

export function calculateProfileScore(
  candidate: ProfileScoreInput,
  strategy: StrategyKeywords
): ProfileScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];
  let total = 0;
  let maxScore = 0;

  // Check exclusions first
  if (strategy.exclusions.length) {
    const candidateText = [
      candidate.name,
      candidate.industry,
      candidate.location,
      ...(candidate.technologies || []),
      ...(candidate.operationalCharacteristics || []),
    ].filter(Boolean).join(' ').toLowerCase();

    for (const excl of strategy.exclusions) {
      if (candidateText.includes(excl.toLowerCase())) {
        return {
          score: 0,
          maxScore: 100,
          breakdown: [],
          excluded: true,
          exclusionReason: `Matched exclusion: "${excl}"`,
        };
      }
    }
  }

  // Keyword match — check if strategy keywords appear in candidate's name, domain, or website
  const candidateText = [
    candidate.name,
    candidate.domain,
    candidate.website,
  ].filter(Boolean).join(' ').toLowerCase();

  const matchedKeywords: string[] = [];
  for (const kw of strategy.keywords) {
    if (candidateText.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
    }
  }
  const keywordPoints = Math.min(
    SCORING.keywordMatch.max,
    matchedKeywords.length * SCORING.keywordMatch.points
  );
  total += keywordPoints;
  maxScore += SCORING.keywordMatch.max;
  if (matchedKeywords.length) {
    breakdown.push({
      criterion: 'Keyword Match',
      awarded: keywordPoints,
      max: SCORING.keywordMatch.max,
      explanation: `${matchedKeywords.length} keyword(s) found in candidate name/website`,
      matched: matchedKeywords,
    });
  }

  // Industry match
  const matchedIndustries: string[] = [];
  if (candidate.industry) {
    for (const ind of strategy.industries) {
      if (candidate.industry.toLowerCase().includes(ind.toLowerCase())) {
        matchedIndustries.push(ind);
      }
    }
  }
  const industryPoints = Math.min(
    SCORING.industryMatch.max,
    matchedIndustries.length * SCORING.industryMatch.points
  );
  total += industryPoints;
  maxScore += SCORING.industryMatch.max;
  if (matchedIndustries.length) {
    breakdown.push({
      criterion: 'Industry Match',
      awarded: industryPoints,
      max: SCORING.industryMatch.max,
      explanation: `${matchedIndustries.length} industry match(es): ${matchedIndustries.join(', ')}`,
      matched: matchedIndustries,
    });
  }

  // Technology match
  const candidateTechs = candidate.technologies || [];
  const matchedTechs: string[] = [];
  for (const t of strategy.technologies) {
    if (candidateTechs.some(ct => ct.toLowerCase().includes(t.toLowerCase()))) {
      matchedTechs.push(t);
    }
  }
  const techPoints = Math.min(
    SCORING.technologyMatch.max,
    matchedTechs.length * SCORING.technologyMatch.points
  );
  total += techPoints;
  maxScore += SCORING.technologyMatch.max;
  if (matchedTechs.length) {
    breakdown.push({
      criterion: 'Technology Match',
      awarded: techPoints,
      max: SCORING.technologyMatch.max,
      explanation: `${matchedTechs.length} technology match(es): ${matchedTechs.join(', ')}`,
      matched: matchedTechs,
    });
  }

  // Location match
  const matchedLocations: string[] = [];
  const candidateLocText = [candidate.location, candidate.country].filter(Boolean).join(' ').toLowerCase();
  for (const loc of strategy.locations) {
    if (candidateLocText.includes(loc.toLowerCase())) {
      matchedLocations.push(loc);
    }
  }
  const locPoints = Math.min(
    SCORING.locationMatch.max,
    matchedLocations.length * SCORING.locationMatch.points
  );
  total += locPoints;
  maxScore += SCORING.locationMatch.max;
  if (matchedLocations.length) {
    breakdown.push({
      criterion: 'Location Match',
      awarded: locPoints,
      max: SCORING.locationMatch.max,
      explanation: `Location matches: ${matchedLocations.join(', ')}`,
      matched: matchedLocations,
    });
  }

  // Company size match
  if (strategy.companySizeMin != null || strategy.companySizeMax != null) {
    maxScore += SCORING.sizeMatch.max;
    if (candidate.employeeCount) {
      const minOk = strategy.companySizeMin == null || candidate.employeeCount >= strategy.companySizeMin;
      const maxOk = strategy.companySizeMax == null || candidate.employeeCount <= strategy.companySizeMax;
      if (minOk && maxOk) {
        total += SCORING.sizeMatch.points;
        breakdown.push({
          criterion: 'Company Size Match',
          awarded: SCORING.sizeMatch.points,
          max: SCORING.sizeMatch.max,
          explanation: `Employee count ${candidate.employeeCount} is within target range${strategy.companySizeMin ? ` (min ${strategy.companySizeMin}` : ''}${strategy.companySizeMax ? `, max ${strategy.companySizeMax})` : ')'}`,
          matched: [String(candidate.employeeCount)],
        });
      }
    }
  }

  // Hiring signal match
  const candidateSignals = candidate.hiringSignals || [];
  const matchedSignals: string[] = [];
  for (const s of strategy.hiringSignals) {
    if (candidateSignals.some(cs => cs.toLowerCase().includes(s.toLowerCase()))) {
      matchedSignals.push(s);
    }
  }
  const signalPoints = Math.min(
    SCORING.hiringSignalMatch.max,
    matchedSignals.length * SCORING.hiringSignalMatch.points
  );
  total += signalPoints;
  maxScore += SCORING.hiringSignalMatch.max;
  if (matchedSignals.length) {
    breakdown.push({
      criterion: 'Hiring Signal Match',
      awarded: signalPoints,
      max: SCORING.hiringSignalMatch.max,
      explanation: `${matchedSignals.length} hiring signal(s) matched: ${matchedSignals.join(', ')}`,
      matched: matchedSignals,
    });
  }

  return {
    score: Math.min(100, total),
    maxScore: 100,
    breakdown,
    excluded: false,
  };
}
