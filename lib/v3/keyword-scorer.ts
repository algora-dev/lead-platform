/**
 * Keyword Scorer v3
 *
 * Scores candidate companies against a confirmed set of keywords with points.
 * Each keyword is checked against all available candidate data fields.
 * Each keyword awards its points at most once (even if it matches multiple fields).
 * Score = sum of matched keyword points, clamped 0-100.
 */

export interface ScoringKeyword {
  keyword: string;
  points: number;
}

export interface CandidateData {
  name: string;
  domain?: string | null;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  employeeRange?: string | null;
  rawPayload?: any;
}

export interface KeywordMatch {
  keyword: string;
  points: number;
  matchedIn: string[];
}

export interface KeywordScoreResult {
  score: number;
  maxScore: number;
  matches: KeywordMatch[];
  thresholdMet: boolean;
}

/**
 * Normalise text for matching: lowercase, collapse whitespace, strip diacritics.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a keyword matches within a field value using token-boundary matching.
 * Short keywords (<=3 chars) must match as whole tokens to avoid false positives.
 * Longer keywords match if they appear as a substring of any token.
 */
function keywordMatchesField(keyword: string, fieldValue: string): boolean {
  if (!fieldValue) return false;
  const normKeyword = normalise(keyword);
  const normField = normalise(fieldValue);
  if (!normKeyword || !normField) return false;

  // For short keywords, require word-boundary match
  if (normKeyword.length <= 3) {
    const tokens = normField.split(/[\s,;|/\\\-_.]+/).filter(Boolean);
    return tokens.some(token => token === normKeyword);
  }

  // For longer keywords, substring match is fine
  return normField.includes(normKeyword);
}

/**
 * Collect all searchable string values from candidate data.
 * Returns array of { field, value } pairs.
 */
function collectSearchableFields(candidate: CandidateData): { field: string; value: string }[] {
  const fields: { field: string; value: string }[] = [];

  if (candidate.name) fields.push({ field: 'name', value: candidate.name });
  if (candidate.domain) fields.push({ field: 'domain', value: candidate.domain });
  if (candidate.website) fields.push({ field: 'website', value: candidate.website });
  if (candidate.description) fields.push({ field: 'description', value: candidate.description });
  if (candidate.industry) fields.push({ field: 'industry', value: candidate.industry });
  if (candidate.location) fields.push({ field: 'location', value: candidate.location });
  if (candidate.employeeRange) fields.push({ field: 'employeeRange', value: candidate.employeeRange });

  // Extract string values from rawPayload (Apollo data, Brave result)
  if (candidate.rawPayload && typeof candidate.rawPayload === 'object') {
    const extracted = extractStrings(candidate.rawPayload, 'rawPayload', 20000);
    fields.push(...extracted);
  }

  return fields;
}

/**
 * Recursively extract string values from an object, with a total character budget.
 */
function extractStrings(obj: any, prefix: string, budget: number): { field: string; value: string }[] {
  const results: { field: string; value: string }[] = [];
  let consumed = 0;

  function walk(val: any, path: string) {
    if (consumed >= budget) return;
    if (typeof val === 'string' && val.length > 0) {
      consumed += val.length;
      results.push({ field: path, value: val });
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length && consumed < budget; i++) {
        walk(val[i], `${path}[${i}]`);
      }
    } else if (val && typeof val === 'object') {
      for (const key of Object.keys(val)) {
        if (consumed >= budget) break;
        walk(val[key], `${path}.${key}`);
      }
    }
  }

  walk(obj, prefix);
  return results;
}

/**
 * Score a candidate against the confirmed keyword set.
 */
export function scoreCandidate(
  keywords: ScoringKeyword[],
  candidate: CandidateData,
  threshold: number = 0,
): KeywordScoreResult {
  const searchableFields = collectSearchableFields(candidate);
  const matches: KeywordMatch[] = [];
  let totalPoints = 0;

  for (const kw of keywords) {
    const matchedIn: string[] = [];

    for (const { field, value } of searchableFields) {
      if (keywordMatchesField(kw.keyword, value)) {
        if (!matchedIn.includes(field)) {
          matchedIn.push(field);
        }
      }
    }

    if (matchedIn.length > 0) {
      matches.push({
        keyword: kw.keyword,
        points: kw.points,
        matchedIn,
      });
      totalPoints += kw.points;
    }
  }

  const score = Math.min(100, Math.max(0, totalPoints));

  return {
    score,
    maxScore: 100,
    matches,
    thresholdMet: score >= threshold,
  };
}

/**
 * Score multiple candidates and return results keyed by a provided identifier.
 */
export function scoreCandidates<T>(
  keywords: ScoringKeyword[],
  candidates: { id: T; data: CandidateData }[],
  threshold: number = 0,
): Map<T, KeywordScoreResult> {
  const results = new Map<T, KeywordScoreResult>();
  for (const { id, data } of candidates) {
    results.set(id, scoreCandidate(keywords, data, threshold));
  }
  return results;
}
