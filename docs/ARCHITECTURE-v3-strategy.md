# Architecture: v3 Strategy System (AI-Assessed + Keyword-Scored)

## Overview

Replaces the current rigid strategy compiler + category-based scorer with an AI-driven assessment pipeline that produces broad discovery queries and a user-confirmed keyword scoring model.

## Current System (v2) Problems

1. **Queries too narrow** — exact-quoted multi-term Brave queries (`"roofing contractor" "quote" Detroit, Michigan, United States`) miss most real companies
2. **Scoring too shallow** — only checks candidate name/domain/website for keyword matches
3. **No user confirmation step** — strategy compiles and is immediately ready to scan
4. **No score threshold** — user can't filter "show me only 50+"
5. **No two-stage flow** — discovery and evidence are disconnected; no manual selection of candidates for evidence gathering
6. **Rigid scoring categories** — fixed categories (keyword, industry, technology, location, size, hiring) with fixed point values, not adaptable to different product types

## New Flow (v3)

```
[Product Profile + Lead Profile + Geography]
  ↓
[AI Assessment] — OpenAI GPT-4o-mini reads both profiles, outputs:
  • understandingSummary (short text: "Your product is X, ideal lead is Y because Z")
  • scoringKeywords[] (up to 10, each with: keyword, points, rationale)
  • broadQueries[] (simple search queries for wide discovery)
  ↓
[User Confirmation Modal] — User reviews:
  • AI understanding text (read-only, with clarification textarea)
  • Keyword list (editable: reorder, edit, add, remove, adjust points)
  • Points auto-sum to 100 (normalised if user edits)
  ↓
[Strategy Finalisation]
  • If user added clarification text → AI rebuilds assessment with new context
  • If user only edited keywords/points → direct DB update, no AI call
  ↓
[Discovery Scan] — broad queries → many candidates
  ↓
[Initial Scoring] — each candidate scored against confirmed keyword set
  • Check candidate name, description, industry, Apollo data, page snippet, domain
  • Each keyword match adds its points → total out of 100
  • Candidates below user-set threshold are hidden
  ↓
[User Review] — user sees scored candidates, can:
  • Filter by min score
  • Manually select candidates for evidence gathering
  • Or auto-select all above threshold
  ↓
[Evidence Scan] — deep dive on selected candidates only
  • Gather evidence (job adverts, website content, Apollo enrichment, etc.)
  • Re-score with full evidence data (confidence score)
  • Final assessment snapshot
```

## DB Schema Changes

### New Table: `StrategyAssessment`

Stores the AI assessment output and user confirmation state.

```prisma
model StrategyAssessment {
  id              Int       @id @default(autoincrement())
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  strategyId      Int
  strategy        DiscoveryStrategy @relation(fields: [strategyId], references: [id], onDelete: Cascade)

  // AI Assessment Output
  understandingSummary  String    // "Your product is X, ideal lead is Y because Z"
  scoringKeywords       Json      // [{ keyword, points, rationale }] — up to 10
  broadQueries          String[]  // simple search queries for wide discovery

  // AI metadata
  aiModel         String?
  aiPromptVersion String?

  // User Confirmation State
  status          StrategyAssessmentStatus @default(PENDING)
  userClarification  String?   // text user added if AI was off-track
  userEditedKeywords Json?    // user's edited keyword set (if they changed it)
  confirmedBy     String?
  confirmedAt     DateTime?

  // If rebuilt (user clarification triggered AI rebuild)
  parentAssessmentId Int?
  parentAssessment   StrategyAssessment? @relation("AssessmentRebuild", fields: [parentAssessmentId], references: [id])
  rebuilds           StrategyAssessment[] @relation("AssessmentRebuild")
}

enum StrategyAssessmentStatus {
  PENDING         // AI has produced assessment, awaiting user review
  CONFIRMED       // User confirmed (with or without edits)
  REBUILDING      // User added clarification, AI is rebuilding
  SUPERSEDED      // Replaced by a rebuild
}
```

### Modify: `DiscoveryStrategy`

Add fields to link the confirmed assessment and store the final scoring config.

```prisma
// Add to DiscoveryStrategy:
  assessmentId        Int?      // links to the confirmed StrategyAssessment
  assessment          StrategyAssessment? @relation(fields: [assessmentId], references: [id])
  finalKeywords       Json?     // [{ keyword, points }] — the confirmed set used for scoring
  finalQueries        String[]? // broad queries used for discovery (from confirmed assessment)
  scoreThreshold      Int?      @default(0)  // user-set minimum score (0-100)
```

### Modify: `ScanCandidate`

Add fields for keyword match details and selection state.

```prisma
// Add to ScanCandidate:
  keywordMatches   Json?     // [{ keyword, points, matchedIn }] — which keywords matched and where
  selectedForEvidence Boolean @default(false)  // user selected this candidate for evidence gathering
```

## API Changes

### 1. `POST /api/v2/strategies` — Create Strategy (modified)

Currently: compiles strategy synchronously, returns immediately.

New flow:
1. Save strategy with geography + profile version IDs
2. Call AI assessment (OpenAI GPT-4o-mini) with both profiles
3. Create `StrategyAssessment` with AI output
4. Return strategy + assessment (status=PENDING)

### 2. `POST /api/v2/strategies/:id/assessment/rebuild` — New

Triggered when user adds clarification text. Sends profiles + clarification to AI, creates a new `StrategyAssessment` (status=PENDING, parentAssessmentId = old assessment). Old assessment → SUPERSEDED.

### 3. `POST /api/v2/strategies/:id/assessment/confirm` — New

User confirms the assessment. Request body:
```json
{
  "keywords": [
    { "keyword": "roofing", "points": 25 },
    { "keyword": "contractor", "points": 15 },
    ...
  ],
  "clarification": null,  // null = no clarification needed, string = AI rebuild required
}
```

If `clarification` is null:
- Save keywords to `strategy.finalKeywords`
- Save broad queries to `strategy.finalQueries`
- Set assessment status = CONFIRMED
- Set strategy.approved = true
- No AI call needed

If `clarification` is a non-empty string:
- Set assessment.userClarification = clarification
- Trigger AI rebuild (async)
- Return status = REBUILDING
- Frontend polls or gets notified when new assessment is ready

### 4. `PATCH /api/v2/strategies/:id` — Modified

Add support for updating `scoreThreshold`.

### 5. `POST /api/v2/scans/:id/select-candidates` — New

User selects candidates for evidence gathering.
```json
{
  "candidateIds": [1, 2, 3]
}
```
Sets `selectedForEvidence = true` on specified candidates.

### 6. `POST /api/v2/scans/:id/run-evidence` — New

Triggers evidence gathering on all `selectedForEvidence` candidates.

## AI Assessment Prompt

**Model:** GPT-4o-mini (cheap, fast, good at structured output)

**Input:** Product profile version data + Customer profile version data + Geography

**System prompt:**
```
You are a lead intelligence strategist. You analyse product/service profiles and ideal lead profiles to create a discovery strategy.

Your job:
1. Understand what the product/service does and who the ideal lead is
2. Write a short (2-3 sentence) understanding summary
3. Generate up to 10 scoring keywords — these are terms that, if found in a company's data (name, website, description, industry), indicate this is a good lead. Rank by importance. Assign points (out of 100 total) based on importance.
4. Generate 5-8 broad search queries for finding companies. These should be SIMPLE and WIDE — e.g. "roofing companies Birmingham" not "roofing contractor quote estimate Birmingham England". Cast a wide net.

Return JSON:
{
  "understandingSummary": "string",
  "scoringKeywords": [
    { "keyword": "string", "points": number, "rationale": "string" }
  ],
  "broadQueries": ["string", ...]
}
```

## New Scorer (v3)

Replaces the current `profile-scorer.ts` category-based system.

```typescript
interface KeywordScoreInput {
  keywords: { keyword: string; points: number }[];
  candidate: {
    name: string;
    domain?: string;
    website?: string;
    description?: string;   // from Brave result snippet or Apollo description
    industry?: string;
    location?: string;
    employeeRange?: string;
    rawPayload?: any;       // full Apollo org data or Brave result
  };
}

interface KeywordScoreResult {
  score: number;          // 0-100
  maxScore: number;       // always 100
  matches: {
    keyword: string;
    points: number;
    matchedIn: string;    // which field matched
  }[];
  thresholdMet: boolean;
}
```

**Matching logic:**
- For each keyword, check against ALL available candidate fields: name, domain, website, description, industry, location, employeeRange, and rawPayload (Apollo data, Brave snippet)
- If keyword found in any field, award its points
- Sum all matched points → score out of 100
- Simple, transparent, explainable

## UI Changes

### 1. Strategy Assessment Modal (new)

Appears after strategy creation (replaces current "approve" button flow).

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  AI Strategy Assessment                    [×]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  📋 Understanding                               │
│  ┌─────────────────────────────────────────┐   │
│  │ Your product is [X]. Your ideal lead    │   │
│  │ is [Y] because [Z].                     │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ✏️ Clarification (optional)                    │
│  ┌─────────────────────────────────────────┐   │
│  │ If the AI's understanding is off,       │   │
│  │ add context here and it will rebuild... │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  🎯 Scoring Keywords (drag to reorder)          │
│  ┌─────────────────────────────────────────┐   │
│  │ 1. roofing        [25 pts] [✏] [✕]      │   │
│  │ 2. contractor     [20 pts] [✏] [✕]      │   │
│  │ 3. estimate       [15 pts] [✏] [✕]      │   │
│  │ 4. ...                                   │   │
│  │ Total: 100 pts  [+ Add keyword]          │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  🔍 Search Queries (preview)                    │
│  • roofing companies Birmingham                 │
│  • roofing contractor Birmingham                │
│  • ...                                          │
│                                                 │
│  [Cancel]              [Confirm Strategy]       │
│                                                 │
│  If clarification text added:                   │
│  [Cancel]    [Rebuild with Clarification]       │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 2. Scan Results Page (modified)

Add to the candidates table:
- **Score threshold slider** (0-100) at the top — filters candidates below threshold
- **Checkbox column** for selecting candidates for evidence gathering
- **"Select all above threshold"** button
- **"Run Evidence Scan on Selected"** button

### 3. Strategy Detail Page (modified)

Replace the current queries/keywords/filters display with:
- AI understanding summary
- Confirmed keyword set with points
- Score threshold setting
- Broad queries (read-only preview)

## File Changes Summary

### New Files
- `lib/v3/ai-assessment.ts` — AI assessment logic (calls OpenAI, parses response)
- `lib/v3/keyword-scorer.ts` — New keyword-based scorer
- `app/api/v2/strategies/[id]/assessment/rebuild/route.ts` — AI rebuild endpoint
- `app/api/v2/strategies/[id]/assessment/confirm/route.ts` — Confirm endpoint
- `app/api/v2/scans/[id]/select-candidates/route.ts` — Candidate selection
- `app/api/v2/scans/[id]/run-evidence/route.ts` — Evidence scan trigger
- `components/v2/AssessmentModal.tsx` — User confirmation modal
- `components/v2/KeywordEditor.tsx` — Drag-to-reorder keyword list with point editing

### Modified Files
- `prisma/schema.prisma` — Add StrategyAssessment model, modify DiscoveryStrategy + ScanCandidate
- `app/api/v2/strategies/route.ts` — Call AI assessment after strategy creation
- `app/api/v2/strategies/[id]/route.ts` — Add assessment + threshold fields
- `lib/v2/scan-handler.ts` — Use finalKeywords + finalQueries from strategy, call keyword-scorer
- `app/(v2)/v2/scans/[id]/page.tsx` — Add threshold slider, checkboxes, evidence scan button
- `components/v2/StrategyWorkspace.tsx` — Replace approve flow with assessment modal

### Deprecated (kept for backward compat, not used in new flow)
- `lib/v2/strategy-compiler.ts` — replaced by AI assessment
- `lib/v2/profile-scorer.ts` — replaced by keyword-scorer

## Implementation Order

1. **DB schema changes** — add StrategyAssessment, modify DiscoveryStrategy + ScanCandidate, run migration
2. **AI assessment logic** — `lib/v3/ai-assessment.ts` (OpenAI call, structured output)
3. **Keyword scorer** — `lib/v3/keyword-scorer.ts` (simple, testable)
4. **API endpoints** — assessment confirm, rebuild, select-candidates, run-evidence
5. **UI: AssessmentModal** — the confirmation modal with keyword editor
6. **UI: Scan results** — threshold slider, checkboxes, evidence trigger
7. **Wire up scan-handler** — use v3 queries + scorer instead of v2
8. **Test end-to-end** — create strategy → AI assessment → user confirms → scan → score → select → evidence

## AI-vs-DB Decision Logic

When user clicks "Confirm Strategy" in the modal:

```
if (userAddedClarification && clarification.trim().length > 0) {
  // AI rebuild needed
  status = REBUILDING
  call AI with profiles + clarification
  create new StrategyAssessment (PENDING)
  old assessment → SUPERSEDED
  show new assessment to user
} else {
  // Direct DB update, no AI
  status = CONFIRMED
  save user's keyword edits to strategy.finalKeywords
  save broadQueries to strategy.finalQueries
  strategy.approved = true
}
```

**Rule:** Only call AI if user provides clarification text. Keyword reordering/point adjustment/addition/removal = direct DB save.

## Backward Compatibility

- Existing v2 strategies remain functional (they have no assessment, use old compiler)
- v2 scan-handler falls back to old scorer if no `finalKeywords` on strategy
- New strategies automatically go through v3 flow
- No destructive migration — all changes are additive

## Implementation Contract (Definitive)

This section resolves earlier ambiguities and is the source of truth for implementation.

### Valid Prisma Model

Use named relations because a strategy owns assessment history and also points to its current assessment. PostgreSQL scalar lists are non-null and default to an empty list.

```prisma
enum StrategyAssessmentStatus {
  PENDING
  CONFIRMED
  SUPERSEDED
}

enum StrategyPreparationStatus {
  ASSESSING
  AWAITING_CONFIRMATION
  READY
  FAILED
}

model StrategyAssessment {
  id                   Int      @id @default(autoincrement())
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  strategyId           Int
  strategy             DiscoveryStrategy @relation(StrategyAssessmentHistory, fields: [strategyId], references: [id], onDelete: Cascade)
  understandingSummary String
  scoringKeywords      Json
  broadQueries         String[] @default([])
  aiModel              String?
  aiPromptVersion      String?
  status               StrategyAssessmentStatus @default(PENDING)
  userClarification    String?
  userEditedKeywords   Json?
  confirmedBy          String?
  confirmedAt          DateTime?
  parentAssessmentId   Int?
  parentAssessment     StrategyAssessment? @relation(AssessmentRebuild, fields: [parentAssessmentId], references: [id], onDelete: SetNull)
  rebuilds             StrategyAssessment[] @relation(AssessmentRebuild)
  currentForStrategy   DiscoveryStrategy? @relation(CurrentStrategyAssessment)

  @@index([strategyId, createdAt])
}

// Add to DiscoveryStrategy
  assessments          StrategyAssessment[] @relation(StrategyAssessmentHistory)
  currentAssessmentId  Int? @unique
  currentAssessment    StrategyAssessment? @relation(CurrentStrategyAssessment, fields: [currentAssessmentId], references: [id], onDelete: SetNull)
  preparationStatus    StrategyPreparationStatus @default(ASSESSING)
  assessmentError      String?
  finalKeywords        Json?
  finalQueries         String[] @default([])
  scoreThreshold       Int @default(0)

// Add to ScanCandidate
  discoveryData        Json?
  keywordMatches       Json?
  selectedForEvidence  Boolean @default(false)
```

Do not add the earlier ambiguous `assessmentId` relation. `currentAssessmentId` is the only current-assessment pointer.

### Lifecycle and Validation

- Strategy creation saves `ASSESSING`, calls AI synchronously, then saves a `PENDING` assessment and `AWAITING_CONFIRMATION`.
- On AI failure keep the strategy, save a safe error in `assessmentError`, set `FAILED`, return `502`, and never allow scanning.
- Rebuild accepts only `{ clarification }` and runs synchronously. After valid AI output, create the replacement, supersede the old assessment, and swap the current pointer in one transaction.
- A failed rebuild leaves the current pending assessment untouched. No polling or `REBUILDING` state is needed.
- Use `OPENAI_STRATEGY_MODEL`, falling back to the project's configured low-cost model. Record model and prompt version.
- Validate AI output strictly: summary 1-800 chars; 1-10 unique keywords; keyword 2-80 chars; integer points 1-100 totalling exactly 100; rationale 1-240 chars; 3-8 unique queries of 2-160 chars.
- Broad queries contain one broad intent plus geography, avoid quoted multi-requirement searches, and do not make all scoring keywords mandatory.
- Confirmation accepts `{ keywords, scoreThreshold? }`; clarification always uses rebuild. This makes AI-vs-DB routing explicit.
- The UI shows points remaining/over and disables confirmation until points total 100. It never silently rebalances user weights.
- Confirmation transaction marks the current assessment confirmed, stores edited keywords, copies final keywords/queries, approval metadata, threshold, and sets `READY`.
- Reject stale or superseded assessment confirmation. A v3 strategy can scan only when approved, `READY`, with valid final keywords and non-empty final queries.

### Discovery Data and Scoring

The current handler drops useful Brave snippets and skips later provider data after company deduplication. v3 must aggregate before scoring:

- Resolve every provider candidate to a company ID, group records by company ID, and score the merged candidate once.
- Store a bounded `discoveryData` snapshot with provider, query, URL, title/description, industry, employee data, and relevant provider fields. Exclude secrets and cap searchable serialised text at 20,000 characters per company.
- Keep the existing discovery provider/query/URL fields as primary-source provenance for compatibility.
- Normalise Unicode, lowercase, collapse whitespace, and use token boundaries so short keywords do not match inside unrelated words.
- Search name, domain, website, snippet/description, industry, location, employee range, and string values in the bounded snapshot.
- Award each keyword once even if it matches multiple fields; retain all matching fields in the explanation.
- Persist `{ keyword, points, matchedIn[] }[]` in `keywordMatches` and retain `profileScoreBreakdown` for existing consumers.
- Score is the sum of matched points, clamped to 0-100. Threshold affects visibility and selection only; never delete low scorers.
- Strategies with `finalKeywords=null` retain the v2 query plan and scorer.

### Selection and Evidence Semantics

Use the existing evidence route rather than adding a duplicate run-evidence route:

- `PUT /api/v2/scans/:id/candidate-selection` with `{ candidateIds }` replaces the complete selection. Validate all IDs belong to the tenant's scan and update in one transaction.
- `POST /api/v2/scans/:id/evidence` accepts `{ candidateIds?, refresh? }`; omitted IDs use selected candidates.
- Reject empty or foreign selections and duplicate active evidence jobs.
- Freeze candidate IDs in the job payload. `runEvidenceEngine` filters by them instead of loading all scan candidates.
- Skip already-gathered candidates unless `refresh=true`; mark only successfully processed candidates as gathered.
- Preserve selection state so the user can see what was chosen.
- Pass the same processed candidate IDs into assessment; do not reassess the whole scan implicitly.
- `EVIDENCE_COMPLETE` means the requested batch completed, not that every candidate has evidence. Candidate flags are authoritative.

### UI and Security

- Open the assessment modal after strategy creation. Closing it leaves an `Awaiting confirmation` strategy that can be reopened.
- Clarification uses rebuild; keyword add/edit/remove/reorder and point changes use confirmation with a hard maximum of 10.
- The scan page uses client state for threshold filtering and selection, persists threshold, and supports selecting all eligible not-yet-gathered candidates.
- The evidence button shows selected count, disables at zero, persists selection, then starts the evidence job.
- Score rows expose matched keywords and points.
- Tenant-scope every strategy, assessment, scan, and candidate lookup. Verify all client-supplied IDs through their parent.
- Use `400` malformed, `404` scoped miss, `409` lifecycle/job conflict, `422` validation failure, and `502` AI provider failure.
- Never include secrets in prompts, snapshots, logs, or provider errors.

### Canonical File Plan

New files:

- `lib/v3/strategy-assessment-schema.ts` - runtime schemas and inferred TypeScript types.
- `lib/v3/ai-assessment.ts` - prompt, configured model call, timeout, parsing, and error mapping.
- `lib/v3/keyword-scorer.ts` - pure normalisation and scoring functions.
- `app/api/v2/strategies/[id]/assessment/rebuild/route.ts`.
- `app/api/v2/strategies/[id]/assessment/confirm/route.ts`.
- `app/api/v2/scans/[id]/candidate-selection/route.ts`.
- `components/v2/AssessmentModal.tsx`.
- `components/v2/KeywordEditor.tsx`.

Modified files:

- `prisma/schema.prisma` and a generated migration.
- Strategy list/detail API routes and `components/v2/StrategyWorkspace.tsx`.
- `lib/v2/scan-handler.ts` for v3 aggregation/scoring with v2 fallback.
- The existing evidence route, handler, and engine for frozen candidate IDs.
- The existing assessment route, handler, and engine for processed candidate IDs.
- Scan detail UI plus a small client candidate-table component for filtering and selection.

Do not create the earlier proposed `select-candidates` or `run-evidence` endpoints; the routes in this contract are canonical.

### Tests and Definition of Done

Add focused Vitest coverage for:

- AI schema acceptance/rejection, including more than 10 keywords and totals other than 100.
- Keyword normalisation, token boundaries, multi-field matches, one award per keyword, and score cap.
- Confirmation lifecycle and stale/superseded assessment rejection.
- Tenant isolation for assessment, selection, and evidence APIs.
- Selection replacement and evidence payload filtering.
- v2 fallback when `finalKeywords` is null.

Before declaring complete:

1. Generate Prisma client and apply the migration using the repository's established migration workflow.
2. Run focused tests, then `npm test`.
3. Run `npm run build` and resolve regressions caused by this work.
4. Manually verify create -> review/rebuild -> edit/confirm -> broad discovery -> threshold -> selection -> selected evidence -> selected assessment.
5. Verify an existing v2 strategy can still launch and score a scan.
