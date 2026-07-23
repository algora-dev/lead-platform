/**
 * AI Assessment v3
 *
 * Calls OpenAI to analyse product + customer profiles and produce:
 * - understandingSummary: short text describing product + ideal lead
 * - scoringKeywords: up to 10 keywords with points (totaling 100)
 * - broadQueries: 5-8 simple wide-net search queries
 */

import { ASSESSMENT_PROMPT_VERSION, validateAssessment, type AssessmentResult } from './strategy-assessment-schema';

const SYSTEM_PROMPT = `You are a lead intelligence strategist. You analyse product/service profiles and ideal lead profiles to create a discovery strategy.

Your job:
1. Understand what the product/service does and who the ideal lead is
2. Write a short (2-3 sentence) understanding summary
3. Generate up to 10 scoring keywords — these are terms that, if found in a company's data (name, website, description, industry), indicate this is a good lead. Rank by importance. Assign points (out of 100 total) based on importance.
4. Generate 5-8 broad search queries for finding companies. These should be SIMPLE and WIDE — e.g. "roofing companies Birmingham" not "roofing contractor quote estimate Birmingham England". Cast a wide net.

Return JSON:
{
  "understandingSummary": "string",
  "scoringKeywords": [
    { "keyword": "string", "points": number, "rationale": "string" }
  ],
  "broadQueries": ["string", ...]
}`;

const USER_CLARIFICATION_SUFFIX = `\n\nThe user has provided additional clarification:\n`;

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

interface Geography {
  country: string;
  stateProvince?: string | null;
  county?: string | null;
  city?: string | null;
  radiusKm?: number | null;
}

export interface AssessmentInput {
  productVersions: ProductVersionData[];
  customerVersions: CustomerVersionData[];
  geography: Geography;
  clarification?: string | null;
}

export interface AssessmentOutput {
  understandingSummary: string;
  scoringKeywords: { keyword: string; points: number; rationale: string }[];
  broadQueries: string[];
  aiModel: string;
  aiPromptVersion: string;
}

export class AssessmentError extends Error {
  constructor(message: string, public readonly code: 'AI_CALL_FAILED' | 'INVALID_OUTPUT' | 'TIMEOUT') {
    super(message);
    this.name = 'AssessmentError';
  }
}

/**
 * Build the user prompt from profile data + geography.
 */
function buildUserPrompt(input: AssessmentInput): string {
  const geoParts: string[] = [];
  if (input.geography.city) geoParts.push(input.geography.city);
  if (input.geography.stateProvince) geoParts.push(input.geography.stateProvince);
  if (input.geography.county) geoParts.push(input.geography.county);
  if (input.geography.country) geoParts.push(input.geography.country);
  const geoStr = geoParts.join(', ');

  // Summarise product profiles
  const productSummaries = input.productVersions.map(p => {
    const parts: string[] = [`Product: ${p.profile?.name || 'Unknown'}`];
    if (p.problemsSolved.length) parts.push(`Problems solved: ${p.problemsSolved.join(', ')}`);
    if (p.outcomes.length) parts.push(`Outcomes: ${p.outcomes.join(', ')}`);
    if (p.industries.length) parts.push(`Industries: ${p.industries.join(', ')}`);
    if (p.keywords.length) parts.push(`Keywords: ${p.keywords.join(', ')}`);
    if (p.technologies.length) parts.push(`Technologies: ${p.technologies.join(', ')}`);
    if (p.companySizeMin || p.companySizeMax) parts.push(`Company size: ${p.companySizeMin || 'any'}-${p.companySizeMax || 'any'}`);
    if (p.pricingLevel) parts.push(`Pricing: ${p.pricingLevel}`);
    if (p.exclusions.length) parts.push(`Exclusions: ${p.exclusions.join(', ')}`);
    if (p.notes) parts.push(`Notes: ${p.notes}`);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  // Summarise customer profiles
  const customerSummaries = input.customerVersions.map(c => {
    const parts: string[] = [`Lead Profile: ${c.profile?.name || 'Unknown'}`];
    if (c.industries.length) parts.push(`Industries: ${c.industries.join(', ')}`);
    if (c.locations.length) parts.push(`Locations: ${c.locations.join(', ')}`);
    if (c.employeeCountMin || c.employeeCountMax) parts.push(`Employees: ${c.employeeCountMin || 'any'}-${c.employeeCountMax || 'any'}`);
    if (c.revenueMin || c.revenueMax) parts.push(`Revenue: ${c.revenueMin || 'any'}-${c.revenueMax || 'any'}`);
    if (c.technologies.length) parts.push(`Technologies: ${c.technologies.join(', ')}`);
    if (c.operationalCharacteristics.length) parts.push(`Operational: ${c.operationalCharacteristics.join(', ')}`);
    if (c.buyingSignals.length) parts.push(`Buying signals: ${c.buyingSignals.join(', ')}`);
    if (c.hiringSignals.length) parts.push(`Hiring signals: ${c.hiringSignals.join(', ')}`);
    if (c.decisionMakers.length) parts.push(`Decision makers: ${c.decisionMakers.join(', ')}`);
    if (c.exclusions.length) parts.push(`Exclusions: ${c.exclusions.join(', ')}`);
    if (c.notes) parts.push(`Notes: ${c.notes}`);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  let prompt = `Target geography: ${geoStr}\n\n=== PRODUCT/SERVICE PROFILES ===\n${productSummaries}\n\n=== IDEAL LEAD PROFILES ===\n${customerSummaries}`;

  if (input.clarification && input.clarification.trim()) {
    prompt += `${USER_CLARIFICATION_SUFFIX}${input.clarification.trim()}`;
  }

  return prompt;
}

/**
 * Call OpenAI to generate a strategy assessment.
 */
export async function generateAssessment(input: AssessmentInput): Promise<AssessmentOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AssessmentError('OPENAI_API_KEY not configured', 'AI_CALL_FAILED');

  const model = process.env.OPENAI_STRATEGY_MODEL || 'gpt-4o-mini';
  const userPrompt = buildUserPrompt(input);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new AssessmentError('AI request timed out after 45s', 'TIMEOUT');
    }
    throw new AssessmentError(`AI request failed: ${e.message}`, 'AI_CALL_FAILED');
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => 'unknown');
    throw new AssessmentError(`OpenAI ${response.status}: ${errBody.slice(0, 300)}`, 'AI_CALL_FAILED');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new AssessmentError('AI returned empty response', 'INVALID_OUTPUT');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AssessmentError('AI response was not valid JSON', 'INVALID_OUTPUT');
  }

  const validation = validateAssessment(parsed);
  if (!validation.ok || !validation.data) {
    const errorSummary = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
    throw new AssessmentError(`AI output validation failed: ${errorSummary}`, 'INVALID_OUTPUT');
  }

  return {
    ...validation.data,
    aiModel: model,
    aiPromptVersion: ASSESSMENT_PROMPT_VERSION,
  };
}
