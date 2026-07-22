/**
 * Strategy Validator
 * Validates that a compiled strategy has sufficient discovery terms
 * before it can be approved or used to start a scan.
 *
 * A strategy is invalid if:
 * - It has zero executable queries
 * - It has zero keywords
 * - Geography is missing required fields (country at minimum)
 * - No profile versions are linked
 * - Profile versions are not approved (Ready)
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    queryCount: number;
    keywordCount: number;
    hasGeography: boolean;
    hasProductProfiles: boolean;
    hasCustomerProfiles: boolean;
    profilesReady: boolean;
  };
}

export interface StrategyForValidation {
  queries: any[];
  keywords: string[];
  country?: string | null;
  stateProvince?: string | null;
  city?: string | null;
  productProfileVersionIds: number[];
  customerProfileVersionIds: number[];
  approved?: boolean;
}

export interface ProfileVersionForValidation {
  id: number;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rawInput?: any;
}

export function validateStrategy(
  strategy: StrategyForValidation,
  productVersions: ProfileVersionForValidation[],
  customerVersions: ProfileVersionForValidation[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const queryCount = Array.isArray(strategy.queries) ? strategy.queries.length : 0;
  const keywordCount = Array.isArray(strategy.keywords) ? strategy.keywords.length : 0;
  const hasGeography = !!strategy.country?.trim();
  const hasProductProfiles = strategy.productProfileVersionIds.length > 0;
  const hasCustomerProfiles = strategy.customerProfileVersionIds.length > 0;

  // Check profile readiness
  const productReady = productVersions.every(v => !!v.approvedAt);
  const customerReady = customerVersions.every(v => !!v.approvedAt);
  const profilesReady = productReady && customerReady;

  if (!hasProductProfiles) {
    errors.push('At least one product profile version is required');
  }
  if (!hasCustomerProfiles) {
    errors.push('At least one customer profile version is required');
  }
  if (!hasGeography) {
    errors.push('Country is required');
  }
  if (queryCount === 0) {
    errors.push('Strategy has zero discovery queries — cannot perform discovery');
  }
  if (keywordCount === 0) {
    errors.push('Strategy has zero keywords — cannot match companies');
  }
  if (hasProductProfiles && !productReady) {
    errors.push('One or more product profile versions are not approved (Ready). Approve them before using in a strategy.');
  }
  if (hasCustomerProfiles && !customerReady) {
    errors.push('One or more customer profile versions are not approved (Ready). Approve them before using in a strategy.');
  }

  // Warnings (non-blocking)
  if (strategy.city && !strategy.stateProvince) {
    warnings.push('City is set but no state/province — location filtering may be imprecise');
  }
  if (queryCount > 0 && queryCount < 5) {
    warnings.push(`Only ${queryCount} queries — consider enriching profiles for broader discovery`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      queryCount,
      keywordCount,
      hasGeography,
      hasProductProfiles,
      hasCustomerProfiles,
      profilesReady,
    },
  };
}
