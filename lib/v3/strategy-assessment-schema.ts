/**
 * Strategy Assessment Schema v3
 *
 * Runtime validation types for AI assessment output.
 */

export interface ScoringKeyword {
  keyword: string;
  points: number;
  rationale: string;
}

export interface AssessmentResult {
  understandingSummary: string;
  scoringKeywords: ScoringKeyword[];
  broadQueries: string[];
}

export interface AssessmentValidationError {
  field: string;
  message: string;
}

export const ASSESSMENT_PROMPT_VERSION = 'v3.0';

// --- Validation limits ---
export const MAX_KEYWORDS = 10;
export const MIN_KEYWORDS = 1;
export const MAX_KEYWORD_LENGTH = 80;
export const MIN_KEYWORD_LENGTH = 2;
export const MAX_POINTS = 100;
export const MIN_POINTS = 1;
export const MAX_SUMMARY_LENGTH = 800;
export const MIN_SUMMARY_LENGTH = 1;
export const MAX_RATIONALE_LENGTH = 240;
export const MIN_RATIONALE_LENGTH = 1;
export const MAX_QUERIES = 8;
export const MIN_QUERIES = 3;
export const MAX_QUERY_LENGTH = 160;
export const MIN_QUERY_LENGTH = 2;

/**
 * Validate an AI assessment result.
 * Returns errors array (empty = valid).
 */
export function validateAssessment(raw: unknown): {
  ok: boolean;
  data?: AssessmentResult;
  errors: AssessmentValidationError[];
} {
  const errors: AssessmentValidationError[] = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: [{ field: 'root', message: 'Assessment must be an object' }] };
  }

  const obj = raw as Record<string, unknown>;

  // understandingSummary
  const summary = obj.understandingSummary;
  if (typeof summary !== 'string' || summary.length < MIN_SUMMARY_LENGTH || summary.length > MAX_SUMMARY_LENGTH) {
    errors.push({
      field: 'understandingSummary',
      message: `Summary must be ${MIN_SUMMARY_LENGTH}-${MAX_SUMMARY_LENGTH} chars`,
    });
  }

  // scoringKeywords
  const keywordsRaw = obj.scoringKeywords;
  if (!Array.isArray(keywordsRaw)) {
    errors.push({ field: 'scoringKeywords', message: 'scoringKeywords must be an array' });
  } else {
    if (keywordsRaw.length < MIN_KEYWORDS || keywordsRaw.length > MAX_KEYWORDS) {
      errors.push({
        field: 'scoringKeywords',
        message: `Must have ${MIN_KEYWORDS}-${MAX_KEYWORDS} keywords (got ${keywordsRaw.length})`,
      });
    }

    const seenKeywords = new Set<string>();
    let totalPoints = 0;
    const validatedKeywords: ScoringKeyword[] = [];

    for (let i = 0; i < keywordsRaw.length; i++) {
      const kw = keywordsRaw[i];
      if (!kw || typeof kw !== 'object') {
        errors.push({ field: `scoringKeywords[${i}]`, message: 'Must be an object' });
        continue;
      }

      const k = kw as Record<string, unknown>;
      const keyword = k.keyword;
      const points = k.points;
      const rationale = k.rationale;

      if (typeof keyword !== 'string' || keyword.length < MIN_KEYWORD_LENGTH || keyword.length > MAX_KEYWORD_LENGTH) {
        errors.push({
          field: `scoringKeywords[${i}].keyword`,
          message: `Keyword must be ${MIN_KEYWORD_LENGTH}-${MAX_KEYWORD_LENGTH} chars`,
        });
        continue;
      }

      const lowerKeyword = keyword.toLowerCase().trim();
      if (seenKeywords.has(lowerKeyword)) {
        errors.push({
          field: `scoringKeywords[${i}].keyword`,
          message: `Duplicate keyword: "${keyword}"`,
        });
        continue;
      }
      seenKeywords.add(lowerKeyword);

      if (typeof points !== 'number' || !Number.isInteger(points) || points < MIN_POINTS || points > MAX_POINTS) {
        errors.push({
          field: `scoringKeywords[${i}].points`,
          message: `Points must be an integer ${MIN_POINTS}-${MAX_POINTS}`,
        });
        continue;
      }
      totalPoints += points;

      if (typeof rationale !== 'string' || rationale.length < MIN_RATIONALE_LENGTH || rationale.length > MAX_RATIONALE_LENGTH) {
        errors.push({
          field: `scoringKeywords[${i}].rationale`,
          message: `Rationale must be ${MIN_RATIONALE_LENGTH}-${MAX_RATIONALE_LENGTH} chars`,
        });
        continue;
      }

      validatedKeywords.push({ keyword: keyword.trim(), points, rationale: rationale.trim() });
    }

    if (validatedKeywords.length >= MIN_KEYWORDS && totalPoints !== MAX_POINTS) {
      errors.push({
        field: 'scoringKeywords',
        message: `Points must total exactly ${MAX_POINTS} (got ${totalPoints})`,
      });
    }
  }

  // broadQueries
  const queriesRaw = obj.broadQueries;
  if (!Array.isArray(queriesRaw)) {
    errors.push({ field: 'broadQueries', message: 'broadQueries must be an array' });
  } else {
    if (queriesRaw.length < MIN_QUERIES || queriesRaw.length > MAX_QUERIES) {
      errors.push({
        field: 'broadQueries',
        message: `Must have ${MIN_QUERIES}-${MAX_QUERIES} queries (got ${queriesRaw.length})`,
      });
    }

    const seenQueries = new Set<string>();
    for (let i = 0; i < queriesRaw.length; i++) {
      const q = queriesRaw[i];
      if (typeof q !== 'string' || q.length < MIN_QUERY_LENGTH || q.length > MAX_QUERY_LENGTH) {
        errors.push({
          field: `broadQueries[${i}]`,
          message: `Query must be ${MIN_QUERY_LENGTH}-${MAX_QUERY_LENGTH} chars`,
        });
        continue;
      }
      const trimmed = q.trim();
      if (seenQueries.has(trimmed.toLowerCase())) {
        errors.push({
          field: `broadQueries[${i}]`,
          message: `Duplicate query: "${trimmed}"`,
        });
        continue;
      }
      seenQueries.add(trimmed.toLowerCase());
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      understandingSummary: (summary as string).trim(),
      scoringKeywords: (keywordsRaw as any[]).map(k => ({
        keyword: (k.keyword as string).trim(),
        points: k.points as number,
        rationale: (k.rationale as string).trim(),
      })),
      broadQueries: (queriesRaw as string[]).map(q => q.trim()),
    },
    errors: [],
  };
}

/**
 * Validate user-edited keywords at confirmation time.
 * Same rules but without rationale requirement.
 */
export function validateUserKeywords(keywords: unknown): {
  ok: boolean;
  data?: { keyword: string; points: number }[];
  errors: AssessmentValidationError[];
} {
  const errors: AssessmentValidationError[] = [];

  if (!Array.isArray(keywords)) {
    return { ok: false, errors: [{ field: 'keywords', message: 'Must be an array' }] };
  }

  if (keywords.length < MIN_KEYWORDS || keywords.length > MAX_KEYWORDS) {
    return {
      ok: false,
      errors: [{
        field: 'keywords',
        message: `Must have ${MIN_KEYWORDS}-${MAX_KEYWORDS} keywords (got ${keywords.length})`,
      }],
    };
  }

  const seen = new Set<string>();
  let total = 0;
  const valid: { keyword: string; points: number }[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const k = keywords[i] as Record<string, unknown>;
    if (!k || typeof k !== 'object') {
      errors.push({ field: `keywords[${i}]`, message: 'Must be an object' });
      continue;
    }

    const keyword = k.keyword;
    const points = k.points;

    if (typeof keyword !== 'string' || keyword.trim().length < MIN_KEYWORD_LENGTH || keyword.trim().length > MAX_KEYWORD_LENGTH) {
      errors.push({
        field: `keywords[${i}].keyword`,
        message: `Keyword must be ${MIN_KEYWORD_LENGTH}-${MAX_KEYWORD_LENGTH} chars`,
      });
      continue;
    }

    const lower = keyword.toLowerCase().trim();
    if (seen.has(lower)) {
      errors.push({ field: `keywords[${i}].keyword`, message: `Duplicate: "${keyword}"` });
      continue;
    }
    seen.add(lower);

    if (typeof points !== 'number' || !Number.isInteger(points) || points < MIN_POINTS || points > MAX_POINTS) {
      errors.push({
        field: `keywords[${i}].points`,
        message: `Points must be integer ${MIN_POINTS}-${MAX_POINTS}`,
      });
      continue;
    }

    total += points;
    valid.push({ keyword: keyword.trim(), points });
  }

  if (valid.length >= MIN_KEYWORDS && total !== MAX_POINTS) {
    errors.push({
      field: 'keywords',
      message: `Points must total exactly ${MAX_POINTS} (got ${total})`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: valid, errors: [] };
}
