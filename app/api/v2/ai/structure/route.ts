import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * AI Structuring Endpoint
 * Takes free-form product/service input and returns structured fields.
 * Uses OpenAI GPT-4o-mini with a validated JSON schema.
 * The original user input is always preserved regardless of AI outcome.
 */

const SYSTEM_PROMPT = `You are a product analysis assistant. Given a description of a product or service, extract structured information.
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
- Keywords should be terms that might appear in company websites, job adverts, or public records.
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

  const systemPrompt = type === 'customer'
    ? SYSTEM_PROMPT.replace('product or service', 'ideal customer profile').replace('product analysis', 'customer profile analysis')
    : SYSTEM_PROMPT;

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

    // Validate types
    const asArray = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];
    const result = {
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

    return NextResponse.json({ structured: result, aiModel: 'gpt-4o-mini', aiPromptVersion: 'v1' });
  } catch (e: any) {
    return NextResponse.json({ error: `AI request error: ${e.message}` }, { status: 500 });
  }
}
