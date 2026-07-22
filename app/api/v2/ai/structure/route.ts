import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * AI Structuring Endpoint
 * Takes free-form product/service input and returns structured fields.
 * Uses OpenAI GPT-4o-mini with a validated JSON schema.
 * The original user input is always preserved regardless of AI outcome.
 *
 * Phase 2: Separate prompts for product vs customer profiles.
 * Customer profiles drive WHO to discover (industries, locations, signals).
 * Product profiles drive fit/scoring (problems, outcomes, technologies).
 */

const PRODUCT_PROMPT = `You are a product analysis assistant. Given a description of a product or service, extract structured information.
Return ONLY valid JSON matching this schema:
{
  "problemsSolved": string[],
  "outcomes": string[],
  "industries": string[],
  "keywords": string[],
  "technologies": string[],
  "companySizeMin": number | null,
  "companySizeMax": number | null,
  "pricingLevel": "budget" | "mid" | "premium" | "enterprise" | null,
  "exclusions": string[],
  "notes": string | null
}
Rules:
- Extract only what is explicitly stated or strongly implied.
- Leave fields empty/null if not mentioned. Do not guess.
- Keywords should be terms that might appear in company websites, job adverts, or public records related to this product.
- Be concise — each array entry should be 1-4 words.
- Industries should be the sectors this product is designed for (e.g. "construction", "manufacturing").`;

const CUSTOMER_PROMPT = `You are a customer profile analyst. Given a description of an ideal customer or target market, extract structured information about WHO to discover.
Return ONLY valid JSON matching this schema:
{
  "industries": string[],
  "locations": string[],
  "employeeCountMin": number | null,
  "employeeCountMax": number | null,
  "revenueMin": number | null,
  "revenueMax": number | null,
  "technologies": string[],
  "operationalCharacteristics": string[],
  "buyingSignals": string[],
  "hiringSignals": string[],
  "decisionMakers": string[],
  "exclusions": string[],
  "notes": string | null
}
Rules:
- Extract only what is explicitly stated or strongly implied.
- Leave fields empty/null if not mentioned. Do not guess.
- Industries: what sectors do these companies operate in? (e.g. "roofing", "construction", "plumbing")
- Locations: where are these companies? (e.g. "Detroit", "Michigan", "United States")
- Hiring signals: what roles would these companies hire for? (e.g. "estimator", "sales rep", "project manager")
- Buying signals: what indicates readiness to buy? (e.g. "growing team", "manual quoting", "expanding")
- Operational characteristics: how do they work? (e.g. "field-based", "project quoting", "invoicing")
- Technologies: what tools do they use? (e.g. "Excel", "paper-based", "CRM")
- Be concise — each array entry should be 1-4 words.`;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { rawInput, type } = body;

  if (!rawInput) {
    return NextResponse.json({ error: 'rawInput is required' }, { status: 400 });
  }

  const inputText = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
  if (inputText.trim().length < 10) {
    return NextResponse.json({ error: 'Input too short — provide at least a sentence describing the product or service' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  const systemPrompt = type === 'customer' ? CUSTOMER_PROMPT : PRODUCT_PROMPT;
  const promptVersion = type === 'customer' ? 'customer-v2' : 'product-v2';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: inputText },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI request failed: ${res.status}`, detail: err }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 502 });
    }

    let structured;
    try {
      structured = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
    }

    // Validate and normalise based on type
    const asArray = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];

    let result: any;

    if (type === 'customer') {
      result = {
        industries: asArray(structured.industries),
        locations: asArray(structured.locations),
        employeeCountMin: typeof structured.employeeCountMin === 'number' ? structured.employeeCountMin : null,
        employeeCountMax: typeof structured.employeeCountMax === 'number' ? structured.employeeCountMax : null,
        revenueMin: typeof structured.revenueMin === 'number' ? structured.revenueMin : null,
        revenueMax: typeof structured.revenueMax === 'number' ? structured.revenueMax : null,
        technologies: asArray(structured.technologies),
        operationalCharacteristics: asArray(structured.operationalCharacteristics),
        buyingSignals: asArray(structured.buyingSignals),
        hiringSignals: asArray(structured.hiringSignals),
        decisionMakers: asArray(structured.decisionMakers),
        exclusions: asArray(structured.exclusions),
        notes: typeof structured.notes === 'string' ? structured.notes : null,
      };
    } else {
      result = {
        problemsSolved: asArray(structured.problemsSolved),
        outcomes: asArray(structured.outcomes),
        industries: asArray(structured.industries),
        keywords: asArray(structured.keywords),
        technologies: asArray(structured.technologies),
        companySizeMin: typeof structured.companySizeMin === 'number' ? structured.companySizeMin : null,
        companySizeMax: typeof structured.companySizeMax === 'number' ? structured.companySizeMax : null,
        pricingLevel: ['budget', 'mid', 'premium', 'enterprise'].includes(structured.pricingLevel) ? structured.pricingLevel : null,
        exclusions: asArray(structured.exclusions),
        notes: typeof structured.notes === 'string' ? structured.notes : null,
      };
    }

    return NextResponse.json({ structured: result, aiModel: 'gpt-4o-mini', aiPromptVersion: promptVersion });
  } catch (e: any) {
    return NextResponse.json({ error: `AI request error: ${e.message}` }, { status: 500 });
  }
}
