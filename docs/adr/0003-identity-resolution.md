# ADR-0003: Company identity resolution by domain first

Date: 2026-07-21
Status: Accepted

## Context

V1 deduplicated companies primarily by `normalizedName + country`. This is
unreliable: "ABC Ltd" and "ABC Limited" and "ABC Group" may or may not be the
same company, and name normalisation alone produces both false merges and false
splits.

## Decision

Adopt a tiered identity resolution strategy, in priority order:

1. **Verified domain** (e.g. `example.com` from a crawled website) — strongest
   signal. Two records sharing the same verified domain are the same company.
2. **Trusted provider IDs** (Apollo `organization_id`, Companies House number,
   LinkedIn URL) — strong signal when domains are absent.
3. **Legal IDs / aliases** — registered company numbers, known aliases.
4. **Normalised name + verified geography** — weak candidate requiring
   confirmation, never an automatic merge on its own.

The `CompanyAliases` and `CompanyProviderIdentities` tables store known aliases
and provider-specific identifiers for cross-referencing.

## Consequences

- Schema needs `CompanyAlias` and `CompanyProviderIdentity` tables.
- Name normalisation remains as one weak signal, not the primary key.
- Domain extraction/canonicalisation becomes critical infrastructure.
- Identity resolution is application code, not AI.
- Existing V1 companies may need domain backfill during migration.
