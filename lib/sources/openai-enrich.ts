/**
 * OpenAI Enrichment — uses OpenAI API to classify and extract from raw text.
 *
 * Given raw text from scan results (job advert, company page), extracts:
 * - Company classification
 * - Contact information
 * - Operational signals
 * - Summary
 *
 * Uses GPT-4o-mini by default (cheap, fast, good enough for classification).
 */

export interface OpenAIEnrichmentResult {
  industry?: string;
  summary?: string;
  contacts?: { email?: string; phone?: string };
  signals?: string[];
}

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function enrichWithOpenAI(
  companyName: string,
  rawText: string,
  taskGroups?: Record<string, string[]>
): Promise<OpenAIEnrichmentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const taskGroupList = taskGroups
    ? Object.entries(taskGroups).map(([k, v]) => `- ${k}: ${v.join(', ')}`).join('\n')
    : '';

  const systemPrompt = `You are a lead intelligence analyst. Given raw text about a company, extract structured information.

Return JSON only, no markdown:
{
  "industry": "the company's industry if identifiable",
  "summary": "one sentence summary of what this company does",
  "contacts": { "email": "email if found", "phone": "phone if found" },
  "signals": ["list of operational signals found that match these task groups, if any"]
}

Task groups to look for:
${taskGroupList || 'No specific task groups provided.'}

Only include signals you actually found in the text. Be precise. Do not invent information.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Company: ${companyName}\n\nRaw text:\n${rawText.slice(0, 4000)}` },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.error(`[openai-enrich] API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      industry: parsed.industry || undefined,
      summary: parsed.summary || undefined,
      contacts: {
        email: parsed.contacts?.email || undefined,
        phone: parsed.contacts?.phone || undefined,
      },
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    };
  } catch (e) {
    console.error(`[openai-enrich] Failed for ${companyName}:`, e);
    return null;
  }
}
