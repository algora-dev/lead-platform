/**
 * Company Facts Materialiser
 *
 * Reads all EvidenceClaims for a company and materialises the most
 * strongly-supported facts onto the Company record. This is the bridge
 * between immutable evidence and the readable company profile.
 *
 * Rules:
 *  - Every materialised fact retains a link to its source evidence.
 *  - Conflicting claims are surfaced, not silently resolved.
 *  - Only claims from reliable sources (reliability >= 50) are materialised.
 *  - The most recent observation wins for time-sensitive facts.
 *  - Syndicated duplicates do not inflate evidence (deduped at item level).
 */

import { prisma } from '@/lib/prisma';

interface MaterialisedFact {
  claimType: string;
  claimValue: string;
  claimData: any;
  evidenceItemId: number;
  reliability: number;
  observedAt: Date | null;
}

/**
 * Materialise sourced company facts from verified evidence claims.
 * Updates Company fields and stores a materialised facts JSON for
 * complex data (technologies, contacts, operational signals).
 */
export async function materialiseCompanyFacts(companyId: number): Promise<void> {
  // Fetch all claims with their evidence item context
  const claims = await prisma.evidenceClaim.findMany({
    where: { companyId },
    include: {
      evidenceItem: {
        select: {
          id: true,
          reliability: true,
          observedAt: true,
          evidenceType: true,
          sourceUrl: true,
          sourceDomain: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!claims.length) return;

  // Group claims by type
  const claimsByType = new Map<string, MaterialisedFact[]>();
  for (const claim of claims) {
    if (claim.evidenceItem.reliability < 50) continue; // Skip unreliable sources

    const fact: MaterialisedFact = {
      claimType: claim.claimType,
      claimValue: claim.claimValue,
      claimData: claim.claimData,
      evidenceItemId: claim.evidenceItemId,
      reliability: claim.evidenceItem.reliability,
      observedAt: claim.evidenceItem.observedAt,
    };

    const existing = claimsByType.get(claim.claimType) || [];
    existing.push(fact);
    claimsByType.set(claim.claimType, existing);
  }

  // Build materialised data
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return;

  const updateData: any = {};
  const materialisedFacts: Record<string, any> = {};

  // --- Industry ---
  const industryClaims = claimsByType.get('INDUSTRY') || [];
  if (industryClaims.length > 0) {
    // Use highest reliability, most recent
    const best = pickBest(industryClaims);
    if (best && !company.industry) {
      updateData.industry = best.claimValue.slice(0, 255);
    }
    materialisedFacts.industry = {
      value: best?.claimValue,
      sources: industryClaims.map(c => c.evidenceItemId),
    };
  }

  // --- Employee Count ---
  const employeeClaims = claimsByType.get('EMPLOYEE_COUNT') || [];
  if (employeeClaims.length > 0) {
    const best = pickBest(employeeClaims);
    if (best) {
      const count = best.claimData?.count;
      if (count && (!company.employeeCount || count > company.employeeCount)) {
        updateData.employeeCount = count;
      }
      if (best.claimValue && !company.employeeRange) {
        updateData.employeeRange = best.claimValue;
      }
    }
    materialisedFacts.employeeCount = {
      value: best?.claimValue,
      count: best?.claimData?.count,
      sources: employeeClaims.map(c => c.evidenceItemId),
    };
  }

  // --- Location ---
  const locationClaims = claimsByType.get('LOCATION') || [];
  if (locationClaims.length > 0) {
    const best = pickBest(locationClaims);
    if (best && (!company.location || !company.country)) {
      if (!company.location) updateData.location = best.claimValue;
      // Derive country from location string
      if (!company.country) {
        const country = deriveCountry(best.claimValue);
        if (country) updateData.country = country;
      }
    }
    materialisedFacts.location = {
      value: best?.claimValue,
      sources: locationClaims.map(c => c.evidenceItemId),
    };
  }

  // --- Contact Info ---
  const contactClaims = claimsByType.get('CONTACT_INFO') || [];
  if (contactClaims.length > 0) {
    const emails: string[] = [];
    const phones: string[] = [];
    const socialLinks: string[] = [];

    for (const c of contactClaims) {
      if (c.claimData?.type === 'email' && c.claimData.emails) {
        emails.push(...c.claimData.emails);
      } else if (c.claimData?.type === 'phone' && c.claimData.phones) {
        phones.push(...c.claimData.phones);
      } else if (c.claimData?.type === 'linkedin' || c.claimData?.type === 'website') {
        socialLinks.push(c.claimValue);
      }
    }

    // Update email/phone on company if missing
    if (emails.length > 0 && !company.email) {
      updateData.email = emails[0];
    }
    if (phones.length > 0 && !company.phone) {
      updateData.phone = phones[0];
    }

    materialisedFacts.contacts = {
      emails: [...new Set(emails)],
      phones: [...new Set(phones)],
      socialLinks: [...new Set(socialLinks)],
      sources: contactClaims.map(c => c.evidenceItemId),
    };
  }

  // --- Technology ---
  const techClaims = claimsByType.get('TECHNOLOGY') || [];
  if (techClaims.length > 0) {
    const technologies = [...new Set(techClaims.map(c => c.claimValue))];
    materialisedFacts.technologies = {
      values: technologies,
      sources: [...new Set(techClaims.map(c => c.evidenceItemId))],
    };
  }

  // --- Operational Activity ---
  const operationalClaims = claimsByType.get('OPERATIONAL_ACTIVITY') || [];
  if (operationalClaims.length > 0) {
    const signals = [...new Set(operationalClaims.map(c => c.claimValue))];
    materialisedFacts.operationalSignals = {
      values: signals,
      sources: [...new Set(operationalClaims.map(c => c.evidenceItemId))],
    };
  }

  // --- Job Adverts ---
  const jobClaims = claimsByType.get('JOB_ADVERT') || [];
  if (jobClaims.length > 0) {
    materialisedFacts.jobAdverts = {
      count: jobClaims.length,
      titles: jobClaims.map(c => c.claimValue).slice(0, 10),
      sources: jobClaims.map(c => c.evidenceItemId),
    };
  }

  // --- Repeated Signals ---
  const signalClaims = claimsByType.get('REPEATED_SIGNAL') || [];
  if (signalClaims.length > 0) {
    const signals = [...new Set(signalClaims.map(c => c.claimValue))];
    materialisedFacts.signals = {
      values: signals,
      count: signalClaims.length,
      sources: [...new Set(signalClaims.map(c => c.evidenceItemId))],
    };
  }

  // Store materialised facts JSON on company
  updateData.materialisedFacts = {
    ...((company.materialisedFacts as any) || {}),
    ...materialisedFacts,
    lastMaterialisedAt: new Date().toISOString(),
  };

  await prisma.company.update({
    where: { id: companyId },
    data: updateData,
  });
}

/**
 * Pick the best fact from multiple claims:
 * highest reliability, then most recently observed.
 */
function pickBest(claims: MaterialisedFact[]): MaterialisedFact | null {
  if (!claims.length) return null;
  return claims.reduce((best, current) => {
    if (current.reliability > best.reliability) return current;
    if (current.reliability === best.reliability) {
      const currentDate = current.observedAt?.getTime() || 0;
      const bestDate = best.observedAt?.getTime() || 0;
      return currentDate > bestDate ? current : best;
    }
    return best;
  });
}

/**
 * Derive country from a location string.
 */
function deriveCountry(location: string): string | null {
  const lower = location.toLowerCase();
  if (lower.includes('united kingdom') || lower.includes('england') || lower.includes('scotland') ||
      lower.includes('wales') || lower.includes('northern ireland') || lower.includes(' london')) {
    return 'United Kingdom';
  }
  if (lower.includes('new zealand') || lower.includes('auckland') || lower.includes('wellington')) {
    return 'New Zealand';
  }
  if (lower.includes('united states') || lower.includes(' usa') || lower.includes(', us')) {
    return 'United States';
  }
  if (lower.includes('australia') || lower.includes('sydney') || lower.includes('melbourne')) {
    return 'Australia';
  }
  return null;
}
