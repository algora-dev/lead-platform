# ADR-0002: Immutable evidence items and atomic claims

Date: 2026-07-21
Status: Accepted

## Context

V1 stored job adverts as the only evidence type and overwrote company fields
(website, phone, email, etc.) on each scan. There was no provenance, no timeline,
and no way to tell when or where a fact was discovered. Syndicated duplicates could
inflate apparent evidence.

## Decision

Adopt a two-layer evidence model:

1. **EvidenceItem** — an immutable source observation/document with provider,
   evidence type, URL, collected/observed dates, raw payload hash, normalised
   payload, reliability and freshness scores, and collection run reference.

2. **EvidenceClaim** — an atomic normalised fact extracted from an Evidence Item
   (location, employee count, technology, job advert, operational activity, funding,
   contact role, repeated signal). Claims retain provenance back to their parent
   EvidenceItem and can support or contradict each other.

Both are append-only. Existing items are never mutated. Rescans add new items and
claims; they do not overwrite previous ones.

## Consequences

- Schema needs `EvidenceItem` and `EvidenceClaim` tables.
- Company materialised fields (website, phone, etc.) become read models derived
  from claims, not directly written by providers.
- Deduplication uses canonical source URL + content hash.
- Independence scoring: copies of the same underlying source do not count as
  independent corroboration.
- Evidence timeline is queryable for any company.
- Providers emit items/claims; they do not write directly to Company fields.
