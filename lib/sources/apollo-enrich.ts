/**
 * Apollo Enrichment — uses Apollo.io API to enrich company data.
 *
 * Given a company name (and optionally website), fetches:
 * - Employee count and range
 * - Industry
 * - Contact info (email, phone)
 * - LinkedIn URL
 *
 * Uses Organization Enrichment endpoint: 1 credit per organization.
 * https://docs.apollo.io/docs/organization-enrichment
 */

export interface ApolloEnrichmentResult {
  employeeCount?: number;
  employeeRange?: string;
  industry?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  website?: string;
  description?: string;
}

export async function enrichWithApollo(
  companyName: string,
  website?: string
): Promise<ApolloEnrichmentResult | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const body: Record<string, string> = { name: companyName };
    if (website) {
      // Extract domain from website URL
      try {
        const domain = new URL(website).hostname.replace(/^www\./, '');
        body.domain = domain;
      } catch {
        // If website isn't a valid URL, use as-is
        body.domain = website;
      }
    }

    const res = await fetch('https://api.apollo.io/v1/organizations/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[apollo-enrich] API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const org = data?.organization;
    if (!org) return null;

    return {
      employeeCount: org.employee_count || undefined,
      employeeRange: org.employee_range || undefined,
      industry: org.industry || undefined,
      email: org.primary_domain ? `info@${org.primary_domain}` : undefined,
      phone: org.phone || undefined,
      linkedinUrl: org.linkedin_url || undefined,
      website: org.website_url || undefined,
      description: org.short_description || undefined,
    };
  } catch (e) {
    console.error(`[apollo-enrich] Failed for ${companyName}:`, e);
    return null;
  }
}
