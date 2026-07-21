# V2 Opportunity Discovery Platform

Status: Approved architecture and implementation plan

## 1. Product definition

V2 is an evidence-based opportunity discovery platform, not a job advert scraper and not primarily a CRM.

The company is the durable lead entity. Search results, websites, job adverts, provider records, contacts, technologies, news and other observations are evidence attached to that company.

The platform asks what the user sells, which organisations they want, and what would indicate fit or need. It then discovers candidate organisations, gathers evidence, and produces ranked, explainable opportunity profiles.

## 2. Core workflow

```text
Product Profiles + Customer Profiles
                ↓
      Discovery Strategy Compiler
                ↓
          Discovery Scan
                ↓
 Candidate Companies + Profile Score
                ↓
        Identity Resolution
                ↓
          Evidence Engine
                ↓
 Confidence + Combined Opportunity Score
                ↓
 Permanent Company Opportunity Profile
```

Discovery finds plausible organisations efficiently. Evidence gathering then investigates each known company using the configured providers. Assessment ranks the result and explains it using stored evidence.

## 3. Score model

V2 displays three values. The two source scores always remain visible; the combined score is a ranking aid, not a replacement for them.

### 3.1 Profile Score

Calculated at the end of candidate discovery, before full enrichment.

It answers: **How closely did this candidate match the Product Profiles, Customer Profiles, keywords, signals and filters used by this scan?**

Rules:

- Range: 0-100.
- Use only facts genuinely observed in discovery data or already verified company facts.
- A keyword earns credit only when observed in candidate data. Putting it in a search query does not award points.
- Hard exclusions reject or quarantine; they do not silently subtract arbitrary points.
- Store every criterion, weight, awarded point, explanation and source reference.
- Freeze the score for that scan. A rescan creates a new snapshot.
- The same company may score differently under different strategies.

Typical components include verified geography, industry, company size, technology, product-problem keywords, buying/hiring signals, operational characteristics and decision-maker types.

### 3.2 Confidence Score

Calculated after the Evidence Engine completes its configured work.

It answers: **How strongly does reliable, recent and independent evidence support this opportunity assessment?**

Rules:

- Range: 0-100.
- Measure support for the assessment, not simply the amount of collected data.
- Consider coverage, reliability, independence, freshness, consistency and verification quality.
- Copies of the same underlying source do not count as independent corroboration.
- Missing evidence remains unknown, not automatically negative.
- Direct contradictions are shown and reduce confidence without penalising an organisation because of its industry or type of work.
- Link every contribution to supporting Evidence Items.
- Freeze the score within its Assessment Snapshot.

### 3.3 Combined Opportunity Score

The combined score rewards candidates that perform strongly on both source scores.

Default formula:

```text
Combined = harmonic mean(Profile, Confidence)
Combined = 0 when either source score is 0
```

The harmonic mean deliberately penalises imbalance more than a normal average. The policy is versioned and configurable, but historical snapshots always retain the policy used.

| Profile | Confidence | Combined | Meaning |
|---:|---:|---:|---|
| 92 | 91 | 91 | Excellent match with strong proof |
| 94 | 30 | 45 | Looks ideal but evidence is weak |
| 42 | 94 | 58 | Well evidenced but partial profile fit |
| 68 | 70 | 69 | Good balanced opportunity |

Ranking defaults to Combined Opportunity Score. Filtering and display expose all three scores.

### 3.4 Auditability

Every assessment stores the strategy and scoring-policy versions, all three scores, criterion IDs, maximums and awarded points, explanations, Evidence Item IDs, contradictions, unknowns and calculation timestamp. No score exists only as an unexplained number.

## 4. Domain model

### Product Profile

The durable offer definition: name, description, problems solved, outcomes, industries/use cases, keywords, technologies, company preferences, pricing level, exclusions and notes. Immutable `ProductProfileVersion` records preserve approved revisions.

### Customer Profile

The durable ICP definition: industries, geography, employee/revenue ranges, technologies, operational characteristics, buying/hiring signals, decision makers, exclusions and notes. Immutable `CustomerProfileVersion` records preserve approved revisions.

### Discovery Strategy

An immutable compiled snapshot from one or more approved Product and Customer Profile versions. It includes queries, weighted criteria, hard filters, structured geography, provider plans, evidence priorities, budgets, scoring-policy versions and AI prompt/model/schema metadata.

### Scan Library

A user-managed container for Discovery Scans supporting rename, search, filter, move, duplicate, archive and controlled deletion.

### Discovery Scan

A durable execution record containing its strategy snapshot, geography, status, progress, modes, provider runs, budgets/costs, candidate counts, timestamps and optional parent scan.

### Company

The tenant-scoped canonical organisation. It stores stable identity and materialised current facts, not strategy-specific scores.

Identity resolution prioritises verified domain, trusted provider IDs, legal IDs, aliases plus verified geography, and only then normalised name as a weak candidate requiring confirmation.

### Scan Candidate

Links a scan to a company and stores discovery provider/query, raw candidate reference, discovery-time facts, filter decisions, Profile Score/breakdown and processing state.

### Evidence Item and Evidence Claim

`EvidenceItem` is an immutable source observation/document with provider, evidence type, URL, dates, raw payload/hash, normalised payload, reliability, freshness and collection run.

`EvidenceClaim` is an atomic normalised fact extracted from an Evidence Item: location, employee count, technology, job advert, operational activity, funding event, contact role or repeated signal. Claims retain provenance and can support or contradict each other.

### Provider Run

Tracks discovery/evidence provider version, status, attempts, timing, request/result counts, cost units, rate limits and recoverable errors.

### Assessment Snapshot

An immutable Company + Strategy + Scan assessment containing all scores, breakdowns, evidence links, AI summary, outreach rationale, unknowns, contradictions and prior-snapshot comparison.

## 5. Modular architecture

```text
app/                       Routes and presentation
modules/profiles/          Product and Customer Profiles
modules/strategy/          Deterministic strategy compiler
modules/discovery/         Discovery orchestration/providers
modules/identity/          Company resolution/aliases
modules/evidence/          Evidence orchestration/items/claims
modules/assessment/        Profile, confidence, combined scoring
modules/scans/             Lifecycle, libraries, rescans
modules/companies/         Company profile read model
modules/ai/                Provider-neutral structured AI
modules/jobs/              Durable JobRunner abstraction
modules/tenancy/           Tenant context/scoped access
modules/shared/            Shared primitives only
```

API routes stay thin. Business rules do not live in route handlers or React components.

Discovery providers return candidate references and provenance. Evidence providers return Evidence Items and Claims for known companies. One provider may support both contracts, but responsibilities remain separate.

AI uses named operations with versioned prompts and JSON schemas, runtime validation, model metadata and explicit review when structuring user intent. Deterministic validation, identity resolution, tenancy and score arithmetic remain application code.

Scans are durable background workflows. Vercel handlers create jobs and return quickly. The application owns a replaceable `JobRunner`; jobs are idempotent, resumable and safe to retry.

## 6. Geography

Geography is structured: country, state/province/region, county, city, radius and coordinates when required.

Candidate geography state is `VERIFIED_MATCH`, `PROBABLE_MATCH`, `UNKNOWN` or `VERIFIED_OUTSIDE`.

The requested area is never written as a company location without source proof. Hard-geography scans include only the states allowed by strategy policy; unknown candidates can be quarantined for enrichment rather than falsely labelled or silently discarded.

## 7. Rescanning

Every rescan creates new immutable scan and score snapshots.

Execution modes:

- discover only new candidates;
- revisit known candidates for new evidence;
- rerun all discovery/evidence providers;
- rerun stale or failed providers;
- compare with a selected previous scan.

Result views include new companies, changed Profile/Confidence/Combined scores, new evidence, new contacts, contradictions and unchanged opportunities.

“Only improved scores” and “only new evidence” are result views over a complete comparison, not destructive execution shortcuts.

## 8. Reuse and retirement

Reuse or adapt:

- Next.js shell and styling;
- Prisma/Postgres;
- authentication after tenant correction;
- Tenant, User and stable Company fields;
- Brave/Apollo clients;
- website/job parsers;
- URL canonicalisation;
- name normalisation as one weak identity signal;
- tenant branding/features;
- CSV parsing concepts;
- suitable company/scan UI patterns.

Retire gradually:

- `ScanProfile` as a combined offer/ICP/query/score object;
- synchronous `runMultiSourceScan()`;
- scores stored directly on Company;
- job-advert-only evidence assumptions;
- `Batch` and `LeadsParent` terminology after migration;
- tenant-ID fallback behaviour;
- large all-in-one workspace components;
- duplicated Python/TypeScript scoring implementations.

## 9. Incremental build plan

V1 stays functional behind a feature flag until V2 cutover. Each stage ends with focused tests, production build, migration validation, changed-files report, commit/push and the next-stage handoff.

### Stage 0 — Safety and specification

- Add architecture decision records for scoring, evidence, identity and jobs.
- Add TypeScript unit/integration test tooling.
- Add characterisation tests for tenancy, auth, normalisation and current scan inputs.
- Repair the Python test environment or explicitly retire duplicated Python code.
- Inventory production rows and define backup/restore and additive migration conventions.

Acceptance: V1 builds; baseline tests run in one command; no production data changes.

### Stage 1 — Additive V2 foundation

- Add profile/version, strategy/join, library, scan, candidate, provider-run, evidence/claim and assessment tables.
- Add company aliases/provider identities.
- Introduce tenant-scoped repositories/services.
- Correct stale-session tenant handling and remove the fallback safely later.
- Add V2 feature flag and route shell.

Acceptance: migration applies to a production-like copy; V1 still works; tenant isolation tests pass.

### Stage 2 — Product and Customer Profiles

- CRUD, immutable versions, archive/duplicate and tenant templates.
- AI structuring with validated schemas, editable preview and explicit approval.
- Preserve original user input through all AI failures.

Acceptance: sparse and detailed inputs work; approved versions cannot be mutated; version/tenant tests pass.

### Stage 3 — Strategy and geography

- Compile multiple profile versions deterministically.
- Define versioned Profile Score criteria/weights.
- Add structured geography and geocoding abstraction.
- Preview generated queries, filters, providers and evidence priorities before approval.

Acceptance: same inputs yield the same strategy; query terms alone cannot award points; sub-country geography is verified.

### Stage 4 — Durable discovery-only scans

- Select workflow provider behind `JobRunner`.
- Add asynchronous scan progress/cancellation.
- Adapt Brave/Apollo to Discovery Provider contracts.
- Persist candidates/provenance and resolve company identity.
- Calculate Profile Score/breakdown.
- Add budgets, limits, retries and cost metrics.

Acceptance: HTTP returns quickly; retries do not duplicate; every candidate has provenance and explained Profile Score.

### Stage 5 — Evidence Engine

- Schedule providers by strategy priorities/budgets.
- Adapt website, Apollo enrichment and job adverts as Evidence Providers.
- Persist immutable items/claims and deduplicate by canonical source/content hash.
- Record freshness, reliability and independence.
- Materialise sourced company facts, contacts, locations and technologies.

Acceptance: every materialised fact retains provenance; syndicated duplicates do not inflate evidence; history survives rescans.

### Stage 6 — Confidence and combined assessment

- Implement versioned Confidence policy and harmonic-mean combined policy.
- Generate Assessment Snapshots with component explanations/evidence links.
- Add contradictions, unknowns, AI summary and outreach rationale.
- Add golden assessment fixtures.

Acceptance: every contribution is traceable; imbalanced scores are penalised; deterministic arithmetic is not delegated to AI.

### Stage 7 — Intelligence UX

- Navigation: Dashboard, Product Profiles, Customer Profiles, Scans, Scan Libraries, Companies, Settings.
- Opportunity dashboard with all three scores.
- Company profile, evidence timeline, score breakdown/history and outreach rationale.
- Replace large workspace files with focused route/server/client components.

Acceptance: users complete the V2 flow without legacy screens; score combinations and explanations are clear.

### Stage 8 — Libraries and rescanning

- Library management, rescan modes, lineage and comparison engine.
- Views for new companies/evidence/contacts and all score changes.
- Historical confidence and combined ranking.

Acceptance: prior scans stay unchanged; comparisons reconcile; moving scans changes no strategy/assessment data.

### Stage 9 — Migration and cutover

- Backfill `LeadsParent → ScanLibrary` and `Batch/ScanRun → legacy DiscoveryScan`.
- Convert JobAdverts to evidence while retaining migration references.
- Preserve Companies and improve identity safely.
- Import old ScanProfiles as labelled legacy strategy snapshots.
- Preserve old opportunity scores as `LEGACY_V1` snapshots; never fabricate Profile/Confidence values.
- Reconcile counts/samples, switch V2 on, and remove legacy code/tables only in a later approved migration.

Acceptance: backup and rollback tested; reconciliation passes; cutover and legacy removal are separate operations.

## 10. Testing and operations

Required tests:

- unit tests for compilers, filters, identity and scoring;
- provider contract tests using recorded fixtures;
- Prisma/tenant integration tests;
- job idempotency/retry tests;
- golden evidence/assessment fixtures;
- API validation/auth tests;
- critical browser flows;
- migration reconciliation scripts.

Live-provider tests are explicit, budget-capped and excluded from normal CI.

Use checked-in additive Prisma migrations. Add before backfill, backfill before switching reads, and switch reads before retiring writes. Backfills are resumable/idempotent. No legacy table is dropped during initial cutover.

## 11. GLM 5.2 execution protocol

Implementation uses one bounded brief per stage so GLM 5.2 does not need this planning conversation in context.

Each brief contains objective, commercial reason, exact files, schema delta, contracts, in/out of scope, migration/rollback, tests, acceptance checklist, commit boundary and dependencies.

Before each stage: read this plan and that stage brief, inspect only named files, confirm a clean tree, and implement one vertical slice at a time. Do not combine stages to save time.

## 12. Decisions

Approved:

- additive rebuild with V1 kept functional;
- company-centred immutable evidence;
- separate versioned Product and Customer Profiles;
- discovery separated from evidence;
- immutable Profile Score at discovery time;
- Confidence Score after evidence;
- visible Combined Opportunity Score with versioned harmonic-mean default;
- strategy-specific historical assessments;
- structured verified geography;
- provider-neutral discovery, evidence, AI and jobs.

Deferred without blocking Stages 0-3:

- durable workflow provider before Stage 4;
- geocoding provider before radius searches;
- default component weights, established from golden commercial examples during Stages 3 and 6.
