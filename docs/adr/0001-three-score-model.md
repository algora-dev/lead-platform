# ADR-0001: Three-score model (Profile, Confidence, Combined)

Date: 2026-07-21
Status: Accepted

## Context

V1 used a single `opportunityScore` on Company that mixed profile fit and evidence
strength into one opaque number. This made it impossible to distinguish "looks ideal
but unproven" from "well-evidenced but partial fit", and scores were not comparable
across different products or strategies.

## Decision

Adopt three separate scores:

1. **Profile Score (0–100)** — frozen at the end of candidate discovery. Measures how
   closely the candidate matched the Product/Customer Profile keywords, filters and
   criteria used by that scan. Query terms alone cannot earn points; only observed
   data counts.

2. **Confidence Score (0–100)** — calculated after the Evidence Engine completes.
   Measures how strongly reliable, recent and independent evidence supports the
   opportunity assessment.

3. **Combined Opportunity Score (0–100)** — harmonic mean of Profile and Confidence.
   Defaults to 0 when either source score is 0. Penalises imbalance deliberately.

All three are stored as immutable snapshots per scan/strategy. Historical scores
remain comparable because scoring policy versions are frozen with each snapshot.

## Consequences

- Schema needs `AssessmentSnapshot` with all three scores plus breakdowns.
- Score arithmetic is deterministic application code, never delegated to AI.
- Same company can have different scores under different strategies.
- UI must display all three scores, not just one.
- Scoring policy must be versioned so historical snapshots remain valid.
